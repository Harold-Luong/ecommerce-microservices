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
- `GET /api-docs`

Tất cả API `/api/cart` yêu cầu access token. Tổng tiền trả về chỉ là giá tham khảo;
Order service phải kiểm tra lại sản phẩm, giá và stock khi checkout.
