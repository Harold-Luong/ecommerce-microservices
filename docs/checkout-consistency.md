# Checkout consistency

Tài liệu này mô tả consistency model của checkout **đang được triển khai local** giữa Cart, Order và Product. Đây là Saga đồng bộ qua HTTP, không phải distributed ACID transaction.

## Mục tiêu

Checkout phải bảo đảm các kết quả sau:

1. Một checkout retry không tạo nhiều order hoặc trừ stock/cart nhiều lần.
2. Nhiều user tranh cùng stock không làm `products.stock` âm hoặc oversell.
3. Mỗi service chỉ thay đổi dữ liệu trong database do nó sở hữu.
4. Khi dependency tạm thời không khả dụng, trạng thái còn lại cho phép retry/recovery.
5. Hủy order chỉ hoàn stock một lần.

## Ownership và nguồn dữ liệu

| Service | Nguồn dữ liệu chính xác | Không chịu trách nhiệm |
| --- | --- | --- |
| Product | Product tồn tại, name/price tại lúc reserve, available stock | Cart, order lifecycle, payment |
| Cart | Ý định mua của user: `product_id`, `quantity` | Stock chính xác, giá cuối cùng, checkout decision |
| Order | Checkout intent, order snapshot, Saga state | Truy vấn trực tiếp DB của Product/Cart |

Cart có thể hiển thị `available` dựa trên Product response tại thời điểm đọc, nhưng thông tin này có thể stale. Chỉ Product reservation mới quyết định một checkout có đủ stock hay không.

## Keys và idempotency

```text
Client Idempotency-Key
  │
  └── Order: UNIQUE(user_id, idempotency_key)
          │ tạo đúng một Order UUID
          │
          ├── Product: inventory_reservations.order_id UNIQUE
          └── Cart:    cart_consumptions.order_id PRIMARY KEY
```

| Key | Scope | Tác dụng |
| --- | --- | --- |
| `Idempotency-Key` | Client → Order, scoped by user | Trả lại cùng Order cho checkout retry |
| `order.id` | Order → Product | Một reservation/stock decrement cho một order |
| `order.id` | Order → Cart | Một cart consumption cho một order |

Client phải giữ nguyên `Idempotency-Key` khi retry cùng checkout intent. Key mới biểu thị một checkout intent mới.

## Happy path

```text
Client
  │ POST /api/orders + JWT + Idempotency-Key
  ▼
Order
  │ 1. GET /api/cart bằng JWT gốc của user
  │ 2. Lưu request_items và Order PENDING
  ▼
Product
  │ 3. POST /internal/inventory/reservations + x-internal-api-key
  │ 4. Lock products, kiểm tra stock, tạo reservation, trừ stock
  ▼
Order
  │ 5. Lưu order_items snapshot + total_amount
  │ 6. Chuyển PENDING → PENDING_PAYMENT
  ▼
Cart
  │ 7. POST /internal/cart/consume + x-internal-api-key
  │ 8. Lưu cart_consumption, giảm/xóa quantity đã checkout
  ▼
Order
  │ 9. Đặt cart_consumed = true
  ▼
Response 201 Created
```

Order tạo `request_items` trước khi gọi Product. Sau thời điểm đó, retry dùng snapshot đã lưu thay vì đọc cart lần nữa. `order_items` lấy name/price từ Product reservation, không lấy estimated price từ Cart.

## Local transactions

```text
Order PostgreSQL
  - create PENDING order
  - finalize order_items/total/status
  - mark cart_consumed
  - begin/finish cancellation

Product PostgreSQL
  - advisory lock(orderId)
  - product row locks
  - reservation + reservation items + stock decrement/release

Cart PostgreSQL
  - cart_consumption idempotency record
  - cart row lock
  - cart_items decrement/delete
```

Mỗi block chỉ atomic trong database của service đó. Không có commit chung của Order, Product và Cart.

## Product reservation và chống overselling

Product chạy reserve trong một local database transaction:

```text
BEGIN
  advisory lock theo orderId
  reservation cũ?
    ├── payload giống → trả reservation cũ
    └── payload khác → 409
  lock product rows theo productId tăng dần
  kiểm tra tất cả product và stock
  INSERT reservation/reservation items
  UPDATE products SET stock = stock - quantity WHERE stock >= quantity
COMMIT
```

Nếu bất kỳ product nào không tồn tại hoặc thiếu stock, toàn bộ transaction rollback. Khóa theo thứ tự product ID giảm nguy cơ deadlock; conditional update là lớp bảo vệ cuối chống stock âm.

Ví dụ stock còn 1 và có hai request mua 1:

```text
Request A: lock product → reserve → stock 1 thành 0 → commit
Request B: chờ lock      → thấy stock 0             → 409
```

## Order state machine

```text
NEW → PENDING → PENDING_PAYMENT → CANCEL_PENDING → CANCELLED
      │
      └── Product trả 404/409 → FAILED
```

| State | Ý nghĩa | Retry behavior |
| --- | --- | --- |
| `PENDING` | Cart snapshot đã lưu; reserve/finalize chưa hoàn tất | Retry checkout cùng key |
| `PENDING_PAYMENT` | Inventory reserved và order snapshot đã lưu; chưa phải payment thành công | Retry Cart consume nếu cần |
| `FAILED` | Lỗi nghiệp vụ như thiếu stock/product không tồn tại | Không retry cùng intent |
| `CANCEL_PENDING` | Đã lưu intent hủy; Product release chưa xác nhận | Retry cancel |
| `CANCELLED` | Product release đã thành công | Cancel retry trả lại state hiện có |

Product reservation có state riêng: `RESERVED → RELEASED`. Không dùng `RESERVED` hoặc `RELEASED` làm Order state.

## Failure và recovery

| Failure window | Dữ liệu đã commit | State quan sát được | Recovery hiện tại |
| --- | --- | --- | --- |
| Cart GET lỗi trước khi tạo order | Không có Order | Không có state | Client retry checkout |
| Product thiếu stock/product không tồn tại | Order PENDING rồi FAILED | `FAILED` | User sửa cart, tạo intent mới |
| Product timeout trước/sau commit | Có thể chỉ PENDING hoặc reservation đã tồn tại | `PENDING` | Retry cùng key; Product trả reservation cũ nếu đã commit |
| Product reserve xong, Order finalize lỗi | Reservation có thể tồn tại | `PENDING` | Retry finalize từ cùng reservation |
| Cart consume lỗi | Order đã PENDING_PAYMENT | `cart_consumed=false` | Retry checkout cùng key, chỉ gọi Cart consume |
| Cart consume xong, Order mark flag lỗi | Cart đã consume | `cart_consumed=false` | Retry Cart no-op, rồi Order đánh dấu true |
| Cancel release lỗi | Cancel intent đã lưu | `CANCEL_PENDING` | Retry cancel cùng order |

Order HTTP client ánh xạ network/unavailable thành `502`, timeout thành `504`; các lỗi nghiệp vụ downstream `4xx` được giữ nguyên. Không có background worker hiện tại tự retry những state này, nên recovery phụ thuộc client retry hoặc vận hành thủ công.

## Cart consumption semantics

Cart consume được gọi sau khi Order đã `PENDING_PAYMENT`. Nó là best-effort UI reconciliation, không quyết định inventory hay thành công checkout.

```text
BEGIN
  INSERT cart_consumptions(order_id, user_id, request_items)
  ON CONFLICT DO NOTHING
  conflict với payload giống → no-op, 200
  conflict với payload khác → 409
  lock cart của user
  với từng item: giảm quantity hoặc xóa item khi quantity không đủ
COMMIT
```

Cart không tồn tại, item không tồn tại hoặc quantity hiện có thấp hơn quantity trong request vẫn được xem là consume thành công; quantity không bị âm. Cart không xóa toàn bộ giỏ, nên item khác không thuộc order được giữ lại.

Tuy nhiên Cart hiện không lưu version/snapshot provenance của từng `cart_item`. Nếu cùng một `productId` bị user sửa đồng thời với checkout, endpoint không thể phân biệt chính xác quantity nào thuộc snapshot cũ và quantity nào user mới thêm. Đây là giới hạn cần xử lý bằng versioning hoặc cart snapshot strategy nếu business yêu cầu semantics chặt hơn.

## Cancel và compensation

```text
PENDING_PAYMENT
  │ beginCancellation transaction
  ▼
CANCEL_PENDING
  │ POST Product release(orderId)
  ├── lỗi → giữ CANCEL_PENDING, retry
  └── thành công
        ▼
    CANCELLED
```

`CANCEL_PENDING` được ghi trước khi gọi Product để tránh mất intent khi process chết. Product release idempotent, vì vậy retry không cộng stock hai lần. Cancel hiện chỉ release inventory; không thêm item trở lại Cart.

## Security boundary

| Call | Credential hiện tại |
| --- | --- |
| Browser → Cart/Order/Product protected API | JWT access token |
| Order → Cart `GET /api/cart` | JWT gốc của user được forward |
| Order → Product reserve/release | `x-internal-api-key` |
| Order → Cart consume | `x-internal-api-key` |

`INTERNAL_API_KEY` hiện là pre-shared secret, nạp từ environment. Development dùng placeholder đã versioned. Nó chỉ bảo vệ ở tầng application: Product và Cart hiện lắng nghe trên `0.0.0.0`, chưa có network policy hoặc ingress tách endpoint `/internal/*` khỏi public route. Do đó local chỉ nên bind/firewall các port này trong môi trường tin cậy; không gửi key cho frontend hoặc expose các port ra Internet.

Production phải dùng secret manager, private network và TLS. Đây chưa phải mTLS/IAM service identity hoặc per-operation authorization.

## Known gaps before Payment

- `expires_at` của reservation mới được lưu/index; chưa có reaper tự release stock hết hạn.
- Chưa có `PAID`, `COMPLETED` hoặc inventory finalization state.
- Chưa có Payment/SQS/Transactional Outbox/event consumer.
- Chưa có background retry/reconciliation cho Saga state dang dở.
- Hard delete Product từng có reservation bị foreign key ngăn; catalog lifecycle cần soft delete.
- Chưa có database-backed integration/concurrency test trong CI cho toàn bộ flow.

## Minimum verification scenarios

1. Gửi hai `POST /api/orders` đồng thời cùng user/key: chỉ một Order UUID và một Product reservation/cart consumption.
2. Cho stock là 1, gửi hai Order UUID khác nhau quantity 1: đúng một request thành công, request còn lại `409`.
3. Mô phỏng Product response timeout sau reserve commit: retry cùng key không trừ stock thêm.
4. Mô phỏng Cart unavailable: Order là `PENDING_PAYMENT`, `cart_consumed=false`; retry cùng key consume được Cart.
5. Mô phỏng Product unavailable khi cancel: Order giữ `CANCEL_PENDING`; retry cancel hoàn stock đúng một lần.
