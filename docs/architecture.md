# Architecture

Tài liệu này tách rõ hai phạm vi:

- **Current local implementation**: code đang có trong Auth, Product, Cart và Order.
- **AWS target**: hướng triển khai sau khi local integration, recovery và concurrency đã được kiểm chứng.

Payment, Notification, Service Connect, Transactional Outbox, SQS và structured logging chưa được coi là đã triển khai nếu source code hiện chưa có chúng.

## Current local implementation

### Data ownership

Mỗi service sở hữu database PostgreSQL riêng. Có thể dùng chung một PostgreSQL instance khi development, nhưng không service nào được truy vấn trực tiếp bảng của service khác.

| Service | Dữ liệu sở hữu | Trách nhiệm |
| --- | --- | --- |
| Auth | `users`, `refresh_sessions` | Credentials, refresh-token rotation, JWT, role |
| Product | `categories`, `products`, `audit_logs`, `inventory_reservations`, `inventory_reservation_items` | Catalog, price, stock, reservation và audit |
| Cart | `carts`, `cart_items`, `cart_consumptions` | Cart theo user và idempotent consume sau checkout |
| Order | `orders`, `order_items` | Checkout state machine, price snapshot, cancel/compensation |

Product dùng PostgreSQL trong implementation hiện tại. Inventory consistency dựa vào `SELECT ... FOR UPDATE`, advisory lock theo `order_id` và atomic conditional update; chuyển Product sang DynamoDB sẽ là một redesign riêng, không phải chỉ thay cấu hình deployment.

### Public API và authorization

| Service | Public route | Quyền |
| --- | --- | --- |
| Auth | `/api/v1/auth/*` | Public cho register/login/refresh; JWT cho endpoint protected |
| Product | `/api/categories/*`, `/api/products/*` | Read public; ghi yêu cầu JWT role `admin` |
| Cart | `/api/cart/*` | JWT; chỉ thao tác cart của `sub` trong token |
| Order | `/api/orders/*` | JWT; owner xem/hủy order của mình, admin xem tất cả |

Cả bốn service có `GET /health` kiểm tra database và `/api-docs` phục vụ Swagger UI.

### Internal API

| Caller | Callee | Endpoint | Mục đích |
| --- | --- | --- | --- |
| Order | Product | `POST /internal/inventory/reservations` | Reserve và khấu trừ stock |
| Order | Product | `POST /internal/inventory/reservations/:orderId/release` | Hoàn stock khi cancel |
| Order | Cart | `POST /internal/cart/consume` | Giảm/xóa quantity đã checkout |

Hiện Order, Product và Cart dùng chung `INTERNAL_API_KEY` truyền trong header `x-internal-api-key`; Product/Cart so sánh constant-time. Đây chỉ là application-level guard cho local development: các service đều lắng nghe trên `0.0.0.0` và chưa có reverse proxy, security group hoặc listener riêng để tách `/internal/*` khỏi public route. Vì vậy, bất kỳ client nào chạm được Product/Cart port vẫn có thể thử gọi internal endpoint; key không được gửi cho frontend và các port này không được expose ra Internet.

Trong production, internal endpoint không có ALB rule public. Secret phải được inject từ Secrets Manager; Order gọi Product/Cart qua private network/TLS và có thể tách credential theo dependency để giảm blast radius.

## Checkout consistency

### End-to-end flow

```text
Client
  │ JWT + Idempotency-Key
  ▼
Order
  ├── GET Cart bằng JWT của user
  ├── INSERT orders(PENDING, request_items)
  ├── POST Product reserve(orderId, items)
  │       └── Product transaction: lock → validate → reservation → decrement stock
  ├── Order transaction: snapshot reservation → PENDING_PAYMENT
  ├── POST Cart consume(orderId, items)
  │       └── Cart transaction: idempotency record → lock cart → reduce/delete items
  └── UPDATE orders.cart_consumed = true
```

Cart price/stock chỉ là tham khảo. Product là authority cuối cùng của stock; Order lưu product name/price từ Product reservation để order history không thay đổi khi catalog được cập nhật sau đó.

### Hai state machine khác nhau

```text
Order
NEW → PENDING → PENDING_PAYMENT → CANCEL_PENDING → CANCELLED
             └───────────────→ FAILED

Product reservation
RESERVED → RELEASED
```

`PENDING_PAYMENT` nghĩa là inventory đã reserve và order snapshot đã lưu, chưa phải payment thành công. `RESERVED`/`RELEASED` chỉ là state của reservation Product.

### Idempotency propagation

```text
Client Idempotency-Key
  └── UNIQUE(user_id, idempotency_key) → Order UUID
                                            ├── Product reservation.order_id
                                            └── Cart consumption.order_id
```

- Same client key của cùng user luôn trở lại cùng Order UUID.
- Product chỉ reserve/trừ stock một lần cho một `order_id`.
- Cart chỉ consume một lần cho một `order_id`.
- Retry sau timeout có thể lặp HTTP request nhưng không lặp business effect.

Đây là *at-most-once effect* theo từng local database operation, không phải distributed ACID transaction xuyên ba database.

### Transaction boundary và concurrency

```text
Order DB:   create/finalize/cancel state trong local transaction
Product DB: reservation + stock update trong local transaction
Cart DB:    consumption record + cart mutation trong local transaction
```

Product khóa product row theo product ID tăng dần, kiểm tra stock và thực hiện conditional update `WHERE stock >= quantity`. Các checkout cạnh tranh cùng product được tuần tự hóa bởi database; request đến sau đọc stock sau commit và nhận `409` khi không đủ hàng.

Order không đọc lại Cart sau khi đã tạo `PENDING`; retry dùng `request_items` đã lưu. Cart consume chỉ xóa đúng quantity trong snapshot, không xóa toàn bộ cart để giữ lại item user thêm hoặc không chọn checkout.

### Failure behavior

| Sự kiện | State sau cùng | Cách tiếp tục |
| --- | --- | --- |
| Cart rỗng | Chưa tạo Order | Client tạo checkout mới sau khi cập nhật cart |
| Product thiếu stock/sản phẩm không tồn tại | `FAILED` | Không retry cùng intent; user sửa cart |
| Product timeout/unavailable | `PENDING` | Retry cùng `Idempotency-Key` |
| Product đã commit nhưng response mất | `PENDING` | Retry lấy reservation cũ |
| Cart consume lỗi | `PENDING_PAYMENT`, `cart_consumed=false` | Retry cùng key, chỉ consume Cart |
| Cancel không gọi được Product | `CANCEL_PENDING` | Retry cancel để release stock |

Xem [Checkout consistency](checkout-consistency.md) để biết chi tiết recovery, invariants và kịch bản test.

## Current limitations

- Chưa có Payment, `PAID`/`COMPLETED` state hoặc payment event.
- Chưa có worker tự release reservation hết `expires_at`.
- Chưa có background reconciliation/retry cho `PENDING`, `CANCEL_PENDING` hoặc `cart_consumed=false`.
- Cancel không restore item vào Cart.
- Chưa có Transactional Outbox hay event bus.
- `INTERNAL_API_KEY` hiện là shared secret, không phải service identity đầy đủ.
- Chưa có full integration/concurrency suite dùng ba database thật trong CI.
- Hard-delete Product đã từng có reservation không được hỗ trợ đầy đủ; future catalog lifecycle nên dùng soft delete.

## AWS target

### Network và routing

```text
Browser ──► CloudFront ──► S3 (frontend, future)
   │
   └──────► public ALB ──► ECS public API services
                                  │
                                  ├── private PostgreSQL databases
                                  ├── private service-to-service HTTP
                                  └── SQS workers (future)
```

Mục tiêu VPC gồm public subnet cho ALB/NAT Gateway, private app subnet cho ECS và private DB subnet cho RDS. ALB chỉ route public API:

| Path pattern | Target service |
| --- | --- |
| `/api/v1/auth/*` | Auth |
| `/api/categories/*`, `/api/products/*` | Product |
| `/api/cart/*` | Cart |
| `/api/orders/*` | Order |

Internal endpoint không có ALB rule public. Order sẽ gọi Product/Cart qua private DNS, ví dụ ECS Service Connect hoặc Cloud Map. Security group dự kiến chỉ cho phép ALB gọi public service port và chỉ cho Order gọi internal port của Product/Cart.

### Storage và secret

- RDS PostgreSQL: Auth, Product, Cart và Order; mỗi service dùng database/schema riêng.
- S3/CloudFront: frontend và upload image ở phase sau; database chỉ lưu object key.
- Secrets Manager: production database credential, JWT secret và internal credential.
- ECS task role: quyền SDK của application; execution role: pull image, logs và đọc secret được khai báo.

Versioned `.env.development` chỉ có placeholder local. Production secret không được commit, ghi log, bake vào image hoặc nằm plaintext trong task definition.

### Payment, messaging và Transactional Outbox

Payment/Notification chưa có code. Target flow:

```text
Order state + outbox record --same Order DB transaction--> outbox publisher
    → payment-queue → Payment worker → notification-queue → Notification Lambda
```

Transactional Outbox đảm bảo **business state và outbox record** cùng commit trong một Order DB transaction. Publish đến SQS diễn ra bất đồng bộ, vì vậy consumer vẫn phải idempotent và queue cần visibility timeout, retry/DLQ phù hợp.

## Deployment order

1. Hoàn tất local integration/concurrency/recovery test.
2. Containerize đủ service và có Compose hoặc tương đương cho local.
3. Tạo VPC, RDS/secret, ECR, ECS và ALB theo từng service.
4. Chuyển internal HTTP sang private DNS/TLS và secret production.
5. Thêm Payment, Outbox, SQS, Notification và observability.
