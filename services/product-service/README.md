# Product service

Service quản lý danh mục và sản phẩm, mặc định chạy tại `http://localhost:3002`.

## Khởi chạy

```bash
npm install
npm run migrate:dev
npm run seed:dev
npm run dev
```

Các lệnh development tự nạp `.env.development`. Service phải dùng cùng
`JWT_ACCESS_SECRET` với auth-service để xác minh access token. Production chạy
`npm start`, `npm run migrate` và `npm run seed` bằng biến môi trường được AWS
Secrets Manager inject, không đọc file development.

Các API ghi dữ liệu yêu cầu access token có role `admin`. Token hợp lệ với role
`user` nhận phản hồi `403 Forbidden`; các API đọc vẫn công khai.

Order-service dùng `INTERNAL_API_KEY` để gọi API inventory nội bộ. Reservation
và thao tác khấu trừ stock được thực hiện atomically trong cùng một database
transaction, unique theo `order_id` và có thể release idempotent khi hủy order.

## Kiến trúc

Product service là chủ sở hữu duy nhất của product, giá và stock. Cart và Order
không truy cập trực tiếp database của Product.

```text
Browser
   │ public API
   ▼
Cart service ── GET product ────────────────┐
   │                                        │
   │ cart snapshot                          ▼
   ▼                                Product service
Order service ── reserve/release stock ──► PostgreSQL
       │                                  ├── products
       ▼                                  ├── inventory_reservations
Order PostgreSQL                          └── inventory_reservation_items
```

Phân chia trách nhiệm:

| Thành phần | Trách nhiệm |
| --- | --- |
| Cart | Lưu ý định mua và hiển thị stock tham khảo |
| Order | Snapshot cart, điều phối checkout và trạng thái Saga |
| Product | Kiểm tra stock; reserve, khấu trừ và hoàn stock bằng atomic database transaction |
| PostgreSQL | Row locking, transaction và unique constraint |

### Luồng checkout

```text
1. Order lưu cart snapshot với trạng thái PENDING
2. Order gọi POST /internal/inventory/reservations
3. Product khóa các product row theo thứ tự ID
4. Product kiểm tra toàn bộ stock
5. Product tạo reservation và trừ stock trong cùng transaction
6. Order lưu snapshot tên/giá và chuyển sang PENDING_PAYMENT
7. Order yêu cầu Cart consume quantity đã checkout
```

Nếu một sản phẩm không tồn tại hoặc thiếu stock, toàn bộ transaction Product được
rollback; không có trường hợp chỉ một phần order được reserve.

### Chống overselling

Product khóa row trước khi đọc stock:

```sql
SELECT id, name, price, stock
FROM products
WHERE id = $1
FOR UPDATE;
```

Ngoài transaction và row lock, thao tác khấu trừ stock còn dùng atomic conditional
update để chỉ cập nhật khi vẫn còn đủ hàng:

```sql
UPDATE products
SET stock = stock - $1,
    updated_at = NOW()
WHERE id = $2
  AND stock >= $1
RETURNING id;
```

Các request tranh cùng sản phẩm phải chờ row lock. Khi request trước commit, request
sau đọc stock mới và nhận `409` nếu không còn đủ hàng. Product ID được lock theo thứ
tự tăng dần để giảm nguy cơ deadlock khi một order chứa nhiều sản phẩm.

### Idempotency và retry

`inventory_reservations.order_id` có unique constraint. Product còn dùng advisory
transaction lock theo `order_id`, vì vậy nhiều retry đồng thời của cùng một order chỉ
tạo một reservation và chỉ trừ stock một lần.

Nếu cùng `order_id` được gửi lại với user hoặc danh sách item khác, API trả `409`
thay vì âm thầm dùng reservation cũ.

```text
Order gọi reserve ── Product đã commit ── response bị timeout
       │
       └── retry cùng order_id ──► trả reservation cũ, không trừ lại stock
```

### Hủy order và compensation

Khi Order chuyển sang `CANCEL_PENDING`, nó gọi:

```http
POST /internal/inventory/reservations/:orderId/release
```

Product lock reservation, hoàn quantity và đổi trạng thái sang `RELEASED` trong một
transaction. Gọi release nhiều lần vẫn chỉ hoàn stock một lần. Order chỉ chuyển sang
`CANCELLED` sau khi release thành công.

### Consistency boundary

Không có distributed ACID transaction giữa Product, Order và Cart. Hệ thống sử dụng
Saga với trạng thái trung gian, idempotency và compensation:

```text
PENDING → RESERVED → PENDING_PAYMENT
                       │
                       └── CANCEL_PENDING → RELEASED → CANCELLED
```

Reservation có `expires_at`, nhưng phase hiện tại chưa có worker tự động thu hồi
reservation hết hạn. Worker/reconciliation và Payment event sẽ được triển khai ở
phase SQS/Payment. Checkout correctness không phụ thuộc dữ liệu stock trong Cart;
Product luôn là nguồn quyết định cuối cùng.

### API nội bộ và bảo mật

Các inventory API không được route qua public ALB:

- `POST /internal/inventory/reservations`
- `POST /internal/inventory/reservations/:orderId/release`

Order gửi `x-internal-api-key`; Product so sánh key theo constant time. Local dùng
giá trị trong `.env.development`, production nhận từ AWS Secrets Manager. Trên ECS,
Order gọi Product qua Service Connect/private DNS và security group chỉ cho phép
traffic từ Order service vào port Product.

Product đã có reservation sẽ được giữ bằng foreign key để bảo toàn lịch sử. Vì vậy
không nên hard-delete product đã tham gia order; bước tiếp theo phù hợp là chuyển API
xóa sản phẩm sang soft delete khi bổ sung lifecycle catalog.

## Audit

`categories` và `products` lưu `created_by`, `updated_by` theo user ID trong JWT.
Mọi thao tác `CREATE`, `UPDATE`, `DELETE` từ API được ghi vào bảng `audit_logs`, gồm
người thao tác, loại tài nguyên, dữ liệu trước và sau thay đổi. Thay đổi dữ liệu và
audit log dùng chung transaction để không xảy ra trường hợp chỉ một bên được lưu.
Không tạo foreign key đến `users` vì dữ liệu user thuộc database của auth-service.

## API

- `GET /health`
- `GET /api/categories`
- `POST /api/categories` (admin)
- `GET /api/products?page=1&limit=20&categoryId=1&search=mac&minPrice=0&maxPrice=50000000`
- `GET /api/products/:id`
- `POST /api/products` (admin)
- `PATCH /api/products/:id` (admin)
- `DELETE /api/products/:id` (admin)
- `POST /internal/inventory/reservations` (Order service)
- `POST /internal/inventory/reservations/:orderId/release` (Order service)
- `GET /api-docs` — giao diện Swagger UI

`GET /api/products` hỗ trợ tối đa 100 bản ghi mỗi trang.
