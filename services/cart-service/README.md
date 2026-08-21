# Cart service

Service quản lý giỏ hàng theo user. Mỗi request lấy `user_id` từ access token do
auth-service phát hành; client không thể đọc hoặc sửa giỏ hàng của user khác.

## Development

```bash
npm install
npm run migrate:dev
npm run seed:dev
npm run dev
```

`.env.development` dùng cùng `JWT_ACCESS_SECRET` với auth-service. Product service
phải chạy tại `PRODUCT_SERVICE_URL` để thêm/cập nhật item và lấy chi tiết giỏ hàng.
Production nhận secret qua environment do AWS inject và không đọc file dev.

Order-service dùng `INTERNAL_API_KEY` để consume đúng quantity đã checkout.
`order_id` được lưu làm idempotency key nên retry không trừ cart lần hai.

Seed tạo cart mẫu cho user ID `1` và `2`, tham chiếu product ID `1`, `2`, `3`.
Hãy chạy seed của auth-service và product-service trước. Nếu ID thực tế khác, cập
nhật các biến `SEED_*_ID` trong `.env.development`. Chạy lại seed không tạo item trùng.

## API

- `GET /health`
- `GET /api/cart`
- `POST /api/cart/items`
- `PATCH /api/cart/items/:productId`
- `DELETE /api/cart/items/:productId`
- `DELETE /api/cart`
- `POST /internal/cart/consume`
- `GET /api-docs`

Tất cả API `/api/cart` yêu cầu access token. Tổng tiền trả về chỉ là giá tham khảo;
Order service phải kiểm tra lại sản phẩm, giá và stock khi checkout.

## Thiết kế Order Consumption

### Mục tiêu và ranh giới trách nhiệm

`POST /internal/cart/consume` đồng bộ giỏ hàng sau khi Order-service đã chấp nhận
checkout. Endpoint chỉ giảm hoặc xóa đúng quantity có trong order snapshot; nó không
tạo order, reserve inventory, xác nhận payment hoặc quyết định checkout thành công.

Cart không phải nguồn dữ liệu chính xác cuối cùng cho giá và stock. Product-service
chịu trách nhiệm kiểm soát inventory và chống overselling; Order-service điều phối
checkout. Vì vậy consume cart là bước dọn trạng thái giỏ hàng và có thể retry, không
phải bước cấp phát inventory.

Không xóa toàn bộ cart sau checkout vì user có thể:

- Chỉ checkout một phần giỏ hàng.
- Thay đổi quantity trong lúc checkout đang được xử lý.
- Thêm item mới sau khi Order-service đã chụp cart snapshot.

### API contract nội bộ

```http
POST /internal/cart/consume
x-internal-api-key: <shared-secret>
Content-Type: application/json

{
  "orderId": "123e4567-e89b-42d3-a456-426614174000",
  "userId": 2,
  "items": [
    { "productId": 1, "quantity": 2 },
    { "productId": 3, "quantity": 1 }
  ]
}
```

Ràng buộc request:

- `orderId` phải là UUID và đóng vai trò idempotency key.
- `userId` phải là số nguyên dương.
- `items` chứa từ 1 đến 100 phần tử.
- `productId` trong cùng request không được trùng nhau.
- `quantity` nằm trong khoảng `1..999`.

Endpoint không dùng JWT của end user. Order-service gửi `x-internal-api-key`; Cart
so sánh key bằng `crypto.timingSafeEqual`. Development đọc key từ
`.env.development`; production phải inject secret từ secret manager và chỉ expose
endpoint qua private network/TLS.

### Cấu trúc xử lý

```text
Order-service
    │ POST /internal/cart/consume
    ▼
internal-cart.routes.js
    ├── authenticateInternal
    └── validate(consumeCartSchema)
            ▼
internal-cart.controller.js
            ▼
cart.service.js
            ▼
cart.repository.js::consumeItems
            ▼
PostgreSQL transaction
```

Route và controller chỉ thực hiện HTTP concern. Idempotency, locking và thay đổi dữ
liệu nằm trong repository để toàn bộ thao tác dùng chung một database transaction.

### Mô hình dữ liệu idempotency

```text
cart_consumptions
├── order_id       UUID PRIMARY KEY
├── user_id        BIGINT
├── request_items  JSONB
└── created_at     TIMESTAMPTZ
```

`order_id` là primary key nên PostgreSQL chỉ chấp nhận một consumption record cho
mỗi order. `user_id` và `request_items` được lưu để phát hiện trường hợp caller vô
tình tái sử dụng cùng `orderId` cho một yêu cầu khác.

Consumption record và thay đổi `cart_items` được commit trong cùng transaction.
Nếu cập nhật cart lỗi, PostgreSQL rollback cả consumption record; retry sau đó vẫn
có thể xử lý lại thay vì bị hiểu nhầm là order đã hoàn thành.

Migration `002_create_cart_consumptions.sql` tạo bảng cho database mới. Migration
`003_add_cart_consumption_request.sql` bổ sung `request_items` cho database
development đã từng chạy phiên bản cũ của migration `002`.

### Transaction flow

```text
BEGIN
  │
  ├─ INSERT cart_consumptions(order_id, user_id, request_items)
  │    ON CONFLICT (order_id) DO NOTHING
  │
  ├─ Insert thành công?
  │    │
  │    ├─ Không
  │    │   ├─ user và items giống record cũ → COMMIT, trả 200, không trừ lại
  │    │   └─ request khác                    → ROLLBACK, trả 409
  │    │
  │    └─ Có
  │
  ├─ SELECT cart WHERE user_id = ? FOR UPDATE
  │
  ├─ Cart không tồn tại → COMMIT consumption record, trả 200
  │
  ├─ Với từng item theo productId tăng dần
  │    ├─ current quantity > consumed quantity → UPDATE quantity = quantity - consumed
  │    └─ current quantity <= consumed quantity → DELETE cart item
  │
  ├─ UPDATE carts.updated_at
  │
COMMIT → trả 200
```

Cart hoặc item không còn tồn tại vẫn được xem là consume thành công. Đây là hành vi
có chủ đích: inventory và order đã được xử lý ở service sở hữu tương ứng, còn Cart
chỉ cần đạt trạng thái cuối không chứa quantity đã checkout. Quantity không bao giờ
bị cập nhật thành số âm.

### Idempotency và retry

Hai request đồng thời có cùng `orderId` cùng tranh chấp primary key trong
`cart_consumptions`. PostgreSQL chỉ cho một transaction insert thành công; request
còn lại chờ transaction đầu tiên kết thúc rồi đi vào nhánh kiểm tra record hiện có.

```text
Request A: INSERT thành công → trừ cart → COMMIT
Request B: chờ A           → conflict   → payload giống → 200, không trừ lại
```

Nếu transaction A rollback, insert của B có thể tiếp tục và xử lý cart. Vì vậy lỗi
tạm thời không làm mất khả năng retry.

Retry phải gửi cùng `userId` và cùng mảng `items`. PostgreSQL `JSONB` không quan tâm
thứ tự key trong object nhưng có phân biệt thứ tự phần tử trong array; caller nên
retry nguyên payload ban đầu và không sắp xếp lại danh sách item.

### Concurrency trên cùng cart

Các order khác nhau có `orderId` khác nhau nên không bị idempotency key chặn nhau.
Khi cùng tác động một cart, `SELECT ... FOR UPDATE` khóa cart row và tuần tự hóa phần
consume. Request sau chỉ đọc/sửa cart sau khi request trước đã commit hoặc rollback.

Các API Cart thông thường cũng chạy trong transaction. Nếu PostgreSQL phát hiện
deadlock giữa một thao tác user và internal consume, một transaction sẽ bị hủy và
toàn bộ thay đổi của nó được rollback. Internal consume có thể retry an toàn nhờ
consumption record cũng nằm trong transaction; tầng gọi cần xem lỗi database/5xx là
retryable với cùng payload.

### Response và failure behavior

| Trường hợp | HTTP | Thay đổi cart |
| --- | ---: | --- |
| Key hợp lệ, order mới | `200` | Giảm/xóa đúng quantity |
| Retry cùng order và payload | `200` | Không thay đổi lần hai |
| Cùng `orderId`, payload khác | `409` | Rollback toàn bộ |
| Cart hoặc item không còn tồn tại | `200` | Không tạo quantity âm |
| Thiếu/sai internal API key | `401` | Không truy cập database |
| Payload không hợp lệ | `400` | Không truy cập repository |
| Lỗi database | `500` | Transaction rollback; có thể retry |

### Invariants

Thiết kế duy trì các điều kiện sau:

1. Một `orderId` chỉ consume cart nhiều nhất một lần.
2. Một `orderId` không thể được dùng lại cho user hoặc item list khác.
3. Consumption record và thay đổi cart luôn cùng commit hoặc cùng rollback.
4. Hai consumption đồng thời trên cùng cart không ghi đè quantity của nhau.
5. Consume không làm `cart_items.quantity` âm.
6. Retry sau timeout không trừ cart lần thứ hai.

### Giới hạn hiện tại

- Chưa có flow hoàn item vào cart khi order bị hủy; user có thể tự thêm lại item.
- `cart_consumptions` chưa có retention/cleanup job. Không được xóa record trước
  idempotency window vì retry cũ có thể consume lần hai.
- Shared API key xác thực caller ở mức service, chưa phân quyền theo từng operation.
- Endpoint không tự kiểm tra trạng thái Order; chỉ caller nội bộ đáng tin cậy được
  phép gọi.
