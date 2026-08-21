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
- `GET /api-docs` — giao diện Swagger UI

`GET /api/products` hỗ trợ tối đa 100 bản ghi mỗi trang.
