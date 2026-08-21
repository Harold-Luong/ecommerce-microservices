# Order service

Order service checkout từ cart, lưu snapshot sản phẩm/giá và điều phối inventory
reservation tại Product-service. Service đóng vai trò Saga coordinator; mỗi service
tự quản lý database transaction của mình và phối hợp bằng idempotency, retry cùng
compensation thay vì distributed transaction.

## Development

```bash
npm install
npm run migrate:dev
npm run dev
```

Tạo database local một lần bằng PostgreSQL admin nếu chưa có:

```sql
CREATE USER orders WITH PASSWORD 'orders';
CREATE DATABASE order_db OWNER orders;
```

Auth, Product và Cart phải chạy trước. Ba service dùng cùng `JWT_ACCESS_SECRET`;
Order, Product và Cart dùng cùng `INTERNAL_API_KEY` cho API nội bộ.

Các dependency bắt buộc:

- Cart cung cấp `GET /api/cart` và `POST /internal/cart/consume`.
- Product cung cấp `POST /internal/inventory/reservations` và
  `POST /internal/inventory/reservations/:orderId/release`.
- Auth phát JWT có cùng issuer, audience và `JWT_ACCESS_SECRET` mà Order xác minh.

Các biến môi trường quan trọng:

| Biến | Mục đích |
| --- | --- |
| `JWT_ACCESS_SECRET` | Xác minh access token của user |
| `INTERNAL_API_KEY` | Gọi API nội bộ của Product và Cart |
| `CART_SERVICE_URL` | Base URL của Cart-service |
| `PRODUCT_SERVICE_URL` | Base URL của Product-service |
| `SERVICE_REQUEST_TIMEOUT_MS` | Timeout chung cho downstream HTTP request |
| `INVENTORY_RESERVATION_TTL_SECONDS` | TTL gửi sang Product khi reserve inventory |

## API

- `POST /api/orders` — checkout cart; bắt buộc header `Idempotency-Key`
- `GET /api/orders` — user xem order của mình; admin xem tất cả
- `GET /api/orders/:id`
- `POST /api/orders/:id/cancel` — hủy và hoàn stock
- `GET /api-docs`

Tất cả API `/api/orders` yêu cầu Bearer access token. User chỉ đọc/hủy order của
mình; admin có thể đọc tất cả order.

## Kiến trúc xử lý

```text
HTTP request
    │
    ▼
Routes
    ├── authenticate JWT
    └── validate params/query/header
            │
            ▼
Controllers
    └── chuyển HTTP input/output
            │
            ▼
Order service
    ├── điều phối checkout/cancel Saga
    ├── Cart client ─────► Cart-service
    ├── Product client ──► Product-service
    └── Order repository ─► Order PostgreSQL
```

Phân chia trách nhiệm:

| Thành phần | Trách nhiệm |
| --- | --- |
| Controller | HTTP status, header và response envelope |
| Order service | State machine, retry decision và Saga orchestration |
| Order repository | SQL, row lock và local database transaction |
| Cart client | Đọc cart bằng JWT và consume cart bằng internal key |
| Product client | Reserve/release inventory bằng internal key |
| Product-service | Nguồn dữ liệu chính xác của product, price và stock |

## Mô hình dữ liệu

### `orders`

```text
id                UUID primary key
user_id           chủ sở hữu order
idempotency_key   khóa retry do client cung cấp
status            trạng thái Saga
request_items     cart snapshot tối thiểu: productId + quantity
reservation_id    reservation trả về từ Product
total_amount      tổng tiền từ order_items snapshot
cart_consumed     Cart đã xác nhận consume hay chưa
failure_reason    nguyên nhân lỗi nghiệp vụ cuối cùng
created_at
updated_at
```

Constraint `UNIQUE (user_id, idempotency_key)` bảo đảm cùng một user không tạo hai
order cho cùng một checkout intent. Hai user khác nhau có thể dùng cùng giá trị key.

### `order_items`

`order_items` lưu snapshot bất biến của `product_name`, `unit_price`, `quantity` và
`subtotal`. Snapshot lấy từ inventory reservation của Product, không dùng giá tham
khảo mà Cart từng hiển thị. Việc đổi tên hoặc giá Product sau đó không làm thay đổi
order lịch sử.

Không tạo foreign key từ Order DB sang Cart/Product/Auth DB vì mỗi microservice sở
hữu database riêng.

## State machine

```text
                             Product 404/409
                          ┌──────────────────► FAILED
                          │
NEW ──► PENDING ──────────┴── reserve thành công ──► PENDING_PAYMENT
                                                           │
                                                           │ cancel
                                                           ▼
                                                    CANCEL_PENDING
                                                           │
                                                           │ release thành công
                                                           ▼
                                                      CANCELLED
```

| Trạng thái | Ý nghĩa |
| --- | --- |
| `PENDING` | Đã lưu checkout intent; inventory chưa được finalize vào order |
| `PENDING_PAYMENT` | Inventory đã reserve, item snapshot và tổng tiền đã lưu |
| `FAILED` | Checkout dừng do lỗi nghiệp vụ không thể tự retry |
| `CANCEL_PENDING` | Đã ghi nhận yêu cầu hủy, đang chờ Product hoàn stock |
| `CANCELLED` | Product đã hoàn stock và Saga hủy hoàn tất |

`PENDING_PAYMENT` chưa có nghĩa là đã thanh toán. Payment/confirmation sẽ được bổ
sung ở phase tiếp theo.

## Checkout flow

Request yêu cầu một idempotency key ổn định cho cùng checkout intent:

```http
POST /api/orders
Authorization: Bearer <access-token>
Idempotency-Key: checkout-user-2-2026-08-21-001
```

### 1. Khôi phục hoặc tạo Saga

```text
Tìm order theo (user_id, idempotency_key)
    │
    ├── Đã tồn tại → không đọc cart mới; tiếp tục từ state đã lưu
    │
    └── Chưa tồn tại
            ├── GET Cart /api/cart bằng JWT của user
            ├── cart rỗng → 409, không tạo order
            ├── tạo request_items từ productId + quantity
            └── INSERT order trạng thái PENDING
```

`INSERT ... ON CONFLICT DO NOTHING` xử lý hai checkout request đồng thời. Request
thắng conflict tạo order; request còn lại đọc đúng order vừa được tạo và tiếp tục
cùng Saga.

Sau khi order tồn tại, retry luôn dùng `request_items` đã lưu. Cart thay đổi sau đó
không làm thay đổi nội dung checkout đang xử lý.

### 2. Reserve inventory

Order gọi Product:

```http
POST /internal/inventory/reservations
x-internal-api-key: <secret>

{
  "orderId": "<order UUID>",
  "userId": 2,
  "items": [{ "productId": 1, "quantity": 2 }],
  "expiresInSeconds": 900
}
```

Product dùng `orderId` làm idempotency key, lock product rows và khấu trừ stock
bằng atomic conditional update trong local transaction.

```text
Reserve thành công                         → tiếp tục finalize
Product 404/409                            → Order chuyển FAILED
Product timeout/network/5xx → 504/502      → Order giữ PENDING để retry
Reserve commit nhưng response bị timeout   → retry nhận reservation cũ
```

Nếu Product trả reservation không còn trạng thái `RESERVED`, Order chuyển `FAILED`
vì inventory không còn được bảo đảm cho checkout đó.

### 3. Finalize order snapshot

Order mở local transaction:

```text
BEGIN
  ├── SELECT order FOR UPDATE
  ├── PENDING_PAYMENT → trả snapshot hiện tại, không finalize lại
  ├── status khác PENDING → 409
  ├── INSERT order_items từ reservation
  ├── SUM(subtotal) thành total_amount
  └── PENDING → PENDING_PAYMENT
COMMIT
```

Nếu Order DB lỗi sau khi Product đã reserve, order vẫn `PENDING`; retry cùng
`Idempotency-Key` gọi Product bằng cùng `orderId`, nhận reservation cũ rồi finalize
lại. Không khấu trừ stock lần hai.

### 4. Consume cart

Sau khi order đã `PENDING_PAYMENT`, Order gọi:

```http
POST /internal/cart/consume
x-internal-api-key: <secret>

{
  "orderId": "<order UUID>",
  "userId": 2,
  "items": [{ "productId": 1, "quantity": 2 }]
}
```

Cart dùng `orderId` làm idempotency key và chỉ giảm/xóa quantity có trong order
snapshot. Khi Cart trả thành công, Order đặt `cart_consumed = true`.

Cart failure không đổi order thành `FAILED` vì order và inventory đã được ghi nhận;
Cart chỉ là trạng thái UI. Order vẫn trả `PENDING_PAYMENT` với
`cart_consumed = false`. Retry checkout cùng key sẽ chỉ gọi lại Cart consume, không
reserve inventory hoặc finalize order lần nữa.

Nếu Cart đã consume nhưng response bị timeout, retry vẫn an toàn. Nếu Cart thành
công nhưng Order chưa kịp cập nhật `cart_consumed`, retry gọi Cart lại và Cart trả
kết quả idempotent trước khi Order đánh dấu hoàn tất.

## Idempotency và concurrent checkout

Một idempotency key được dùng xuyên suốt theo hai cấp:

```text
Client key
  └── UNIQUE(user_id, idempotency_key) → một Order UUID
                                            │
                                            ├── Product reservation order_id
                                            └── Cart consumption order_id
```

Hai request checkout đồng thời cùng key:

```text
Request A ── INSERT Order thành công ──┐
                                      ├── cùng Order UUID
Request B ── conflict, đọc Order cũ ──┘
                                      │
                                      ├── Product chỉ reserve một lần
                                      ├── Order chỉ finalize một lần
                                      └── Cart chỉ consume một lần
```

Client phải:

- Tạo key mới cho một checkout intent mới.
- Giữ nguyên key khi retry do timeout, mất kết nối hoặc `5xx`.
- Không tái sử dụng key của checkout cũ cho một cart mới.

## Failure và retry matrix

| Điểm lỗi | State bền vững | Response | Retry cùng key |
| --- | --- | ---: | --- |
| Cart rỗng | Chưa có order | `409` | Đọc cart lại |
| Cart GET timeout/unavailable | Chưa có order | `504/502` | Chạy lại từ đầu |
| Product thiếu hàng/không có product | `FAILED` | `409/404` | Trả lỗi đã lưu |
| Product timeout/unavailable | `PENDING` | `504/502` | Retry reserve |
| Product đã commit, response bị mất | `PENDING` | `504/502` | Nhận reservation cũ |
| Finalize Order DB lỗi | `PENDING` | `500` | Finalize lại |
| Cart consume lỗi | `PENDING_PAYMENT`, `cart_consumed=false` | Order vẫn trả thành công | Retry Cart |
| Đánh dấu cart consumed lỗi | `PENDING_PAYMENT`, `cart_consumed=false` | Order vẫn trả thành công | Cart no-op rồi đánh dấu lại |
| Product release lỗi khi cancel | `CANCEL_PENDING` | `502/504` | Retry release |

HTTP client áp timeout bằng `AbortSignal.timeout`:

- Downstream `4xx`: giữ nguyên status nghiệp vụ.
- Downstream `5xx`: ánh xạ thành `502 Bad Gateway`.
- Network/unavailable: `502 Bad Gateway`.
- Timeout: `504 Gateway Timeout`.

## Cancel và compensation flow

```http
POST /api/orders/:id/cancel
Authorization: Bearer <access-token>
```

```text
Kiểm tra owner hoặc admin
    │
    ├── CANCELLED → trả order hiện tại
    ├── PENDING   → 409; checkout có thể đang xử lý
    ├── FAILED    → 409
    └── PENDING_PAYMENT
            │
            ▼
Order DB transaction
PENDING_PAYMENT → CANCEL_PENDING
            │
            ▼
Product release inventory
            │
            ├── lỗi → giữ CANCEL_PENDING để retry
            │
            └── thành công
                    ▼
Order DB
CANCEL_PENDING → CANCELLED
```

`CANCEL_PENDING` được commit trước khi gọi Product để lưu durable cancellation
intent. Nếu process chết sau khi Product hoàn stock nhưng trước khi chuyển
`CANCELLED`, retry tiếp tục từ `CANCEL_PENDING`. Product release idempotent nên
không cộng stock hai lần.

Cancel hiện không tự thêm item trở lại Cart.

## Query và authorization flow

- `GET /api/orders`: user chỉ thấy order của mình; role `admin` xem tất cả.
- `GET /api/orders/:id`: owner hoặc admin được đọc.
- `POST /api/orders/:id/cancel`: owner hoặc admin được hủy.
- Truy cập order của user khác trả `404` thay vì `403` để không làm lộ order ID.

JWT gốc được giữ trong `req.auth.accessToken` và chuyển tiếp khi Order gọi
`GET /api/cart`, nhờ đó Cart tự xác minh user. Các API reserve/release/consume dùng
`INTERNAL_API_KEY`, không dùng token của end user.

## Consistency boundary

- Unique `(user_id, idempotency_key)` ngăn tạo order trùng.
- Cart snapshot được lưu trong order trước khi gọi service khác.
- Product lock row theo thứ tự product ID và trừ stock bằng điều kiện atomic.
- Reservation unique theo `order_id`, nên retry không trừ stock lần hai.
- Order dừng ở `PENDING` khi dependency tạm lỗi và retry có thể tiếp tục Saga.
- Lỗi nghiệp vụ 404/409 chuyển order sang `FAILED`.
- Hủy dùng `CANCEL_PENDING`; chỉ chuyển `CANCELLED` sau khi Product hoàn stock.
- Consume cart dùng `order_id` làm idempotency key, trừ đúng quantity đã checkout
  và không xóa item user thêm đồng thời.

Không có distributed ACID transaction giữa các database. Đây là Saga có state
trung gian, retry và compensation. Reservation hiện có TTL nhưng cần worker thu hồi
reservation hết hạn ở phase Payment/SQS tiếp theo.

```text
Order DB   ── local transaction
Product DB ── local transaction
Cart DB    ── local transaction

Cross-service consistency
    = durable state + idempotency + retry + compensation
```

## Invariants

1. Một `(user_id, idempotency_key)` chỉ ánh xạ đến một Order UUID.
2. Một Order UUID chỉ reserve inventory một lần.
3. Một Order UUID chỉ consume cart một lần.
4. `order_items` và `total_amount` cùng commit trong một Order DB transaction.
5. Order chỉ thành `CANCELLED` sau khi Product release thành công.
6. Lỗi dependency tạm thời không chuyển `PENDING` thành `FAILED`.
7. Retry không đọc lại cart sau khi order đã được tạo.

## Giới hạn hiện tại

- Chưa có Payment, `PAID`, `CONFIRMED` hoặc `COMPLETED` flow.
- Chưa có worker tự release reservation hết TTL.
- Chưa có background retry cho order `PENDING` hoặc `cart_consumed = false`.
- Chưa có transactional outbox/event để tiếp tục Saga bất đồng bộ.
- Cancel không restore item vào Cart.
- List order hydrate items theo từng order, có thể tạo N+1 query khi page lớn.
- Shared `INTERNAL_API_KEY` mới xác thực ở mức service, chưa tách key theo từng
  dependency hoặc operation.

## Kiểm thử

```bash
npm test
```

Test hiện tại kiểm tra JWT forwarding, validation và việc dùng cùng `orderId` cho
Product reservation lẫn Cart consumption. Integration/concurrency test với ba
database thật nên được bổ sung trước khi triển khai production.
