# Auth Service

Service xác thực cho hệ thống e-commerce microservices. Service cung cấp API đăng ký, đăng nhập, lấy thông tin người dùng hiện tại, làm mới token và đăng xuất.

## Tính năng

- Đăng ký tài khoản bằng email và mật khẩu.
- Mã hóa mật khẩu với `bcrypt` (12 salt rounds).
- Xác thực bằng JWT access token và refresh token.
- Refresh token rotation: refresh token cũ bị thu hồi sau khi sử dụng.
- Lưu hash của refresh token trong PostgreSQL, không lưu token nguyên bản.
- Đăng xuất một phiên hoặc tất cả thiết bị.
- Health check bao gồm trạng thái kết nối cơ sở dữ liệu.
- Tài liệu OpenAPI 3.0 và giao diện Swagger UI để khám phá, thử nghiệm API.

## Công nghệ

- Node.js (ES Modules)
- Express 5
- PostgreSQL
- `jsonwebtoken`
- `bcrypt`
- OpenAPI 3.0, `swagger-ui-express` và `yaml`

## Cấu trúc thư mục

```text
auth-service/
├── docs/
│   └── openapi.yaml            # Đặc tả OpenAPI của service
├── migrations/                 # Schema và script chạy migration
├── src/
│   ├── config/                 # Cấu hình môi trường, PostgreSQL và Swagger
│   ├── controllers/            # Xử lý request/response
│   ├── middlewares/            # Xác thực và xử lý lỗi
│   ├── repositories/           # Truy cập dữ liệu
│   ├── routes/                 # Khai báo endpoint
│   ├── services/               # Nghiệp vụ xác thực
│   ├── utils/                  # JWT và hash token
│   ├── app.js                  # Cấu hình Express
│   └── server.js               # Khởi động HTTP server
└── package.json
```

## Yêu cầu

- Node.js hỗ trợ ES Modules và chế độ `--watch` (khuyến nghị Node.js 20+).
- PostgreSQL đang hoạt động và có sẵn một database cho service.

## Cài đặt và chạy

Từ thư mục `services/auth-service`:

```bash
npm install
```

Tạo file `.env`:

```env
PORT=3001
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=auth_db
DB_USER=postgres
DB_PASSWORD=postgres

JWT_ACCESS_SECRET=replace-with-a-long-random-secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=replace-with-another-long-random-secret
JWT_REFRESH_EXPIRES_IN=30d
```

`JWT_ACCESS_SECRET` và `JWT_REFRESH_SECRET` là bắt buộc và nên dùng hai giá trị mạnh, khác nhau. Không commit file `.env` hoặc secret thật lên Git.

Chạy migration:

```bash
npm run migrate
```

Khởi động service ở chế độ development:

```bash
npm run dev
```

Hoặc chạy ở chế độ thông thường:

```bash
npm start
```

Mặc định service lắng nghe tại `http://localhost:3001`.

## Tài liệu Swagger

Sau khi khởi động service, truy cập Swagger UI tại:

```text
http://localhost:3001/api-docs
```

Swagger UI hỗ trợ:

- Xem toàn bộ endpoint, request body, response và mã lỗi.
- Gửi request thử trực tiếp từ trình duyệt.
- Nhập access token bằng nút **Authorize** để gọi các API yêu cầu xác thực như `GET /api/v1/auth/me` và `POST /api/v1/auth/logout-all`.

Đặc tả OpenAPI được quản lý tập trung tại:

```text
docs/openapi.yaml
```

Khi thêm hoặc thay đổi API, cần cập nhật file YAML này để tài liệu đồng bộ với route và controller. Service đọc file khi khởi động, vì vậy cần khởi động lại service sau khi sửa tài liệu.

File `src/config/swagger.js` đọc và parse YAML; `src/app.js` phục vụ giao diện tại `/api-docs`.

## Biến môi trường

| Biến | Bắt buộc | Mặc định | Mô tả |
| --- | --- | --- | --- |
| `PORT` | Không | `3001` | Cổng HTTP của service |
| `NODE_ENV` | Không | `development` | Môi trường chạy ứng dụng |
| `DB_HOST` | Có | — | Host PostgreSQL |
| `DB_PORT` | Không | `5432` | Cổng PostgreSQL |
| `DB_NAME` | Có | — | Tên database |
| `DB_USER` | Có | — | Người dùng database |
| `DB_PASSWORD` | Có | — | Mật khẩu database |
| `JWT_ACCESS_SECRET` | Có | — | Secret ký access token |
| `JWT_ACCESS_EXPIRES_IN` | Không | `15m` | Thời hạn access token |
| `JWT_REFRESH_SECRET` | Có | — | Secret ký refresh token |
| `JWT_REFRESH_EXPIRES_IN` | Không | `30d` | Thời hạn refresh token |

## API

Base URL: `http://localhost:3001/api/v1/auth`

Đặc tả request/response đầy đủ và chức năng thử API có tại [Swagger UI](http://localhost:3001/api-docs).

Các endpoint được bảo vệ yêu cầu header:

```http
Authorization: Bearer <access-token>
```

### Health check

```http
GET /health
```

Phản hồi thành công (`200`):

```json
{
  "status": "ok",
  "service": "auth-service",
  "database": "connected"
}
```

Nếu không kết nối được PostgreSQL, endpoint trả về `503` với `database` là `disconnected`.

### Đăng ký

```http
POST /api/v1/auth/register
Content-Type: application/json
```

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Mật khẩu phải có ít nhất 8 ký tự. Email được loại bỏ khoảng trắng ở hai đầu và chuyển về chữ thường.

Phản hồi thành công (`201`):

```json
{
  "message": "User registered successfully",
  "data": {
    "id": "1",
    "email": "user@example.com",
    "is_active": true,
    "created_at": "2026-08-20T00:00:00.000Z"
  }
}
```

### Đăng nhập

```http
POST /api/v1/auth/login
Content-Type: application/json
```

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Phản hồi thành công (`200`):

```json
{
  "message": "Login successful",
  "data": {
    "accessToken": "<access-token>",
    "refreshToken": "<refresh-token>",
    "tokenType": "Bearer",
    "accessTokenExpiresIn": "15m",
    "refreshTokenExpiresIn": "30d"
  }
}
```

### Lấy thông tin người dùng hiện tại

Yêu cầu access token.

```http
GET /api/v1/auth/me
Authorization: Bearer <access-token>
```

Phản hồi thành công (`200`):

```json
{
  "data": {
    "id": "1",
    "email": "user@example.com",
    "is_active": true,
    "created_at": "2026-08-20T00:00:00.000Z",
    "updated_at": "2026-08-20T00:00:00.000Z"
  }
}
```

### Làm mới token

```http
POST /api/v1/auth/refresh
Content-Type: application/json
```

```json
{
  "refreshToken": "<refresh-token>"
}
```

Phản hồi trả về một cặp access token và refresh token mới có cùng cấu trúc với dữ liệu đăng nhập. Refresh token đã gửi sẽ bị thu hồi và không thể sử dụng lại.

### Đăng xuất một phiên

```http
POST /api/v1/auth/logout
Content-Type: application/json
```

```json
{
  "refreshToken": "<refresh-token>"
}
```

Phản hồi thành công (`200`):

```json
{
  "message": "Logout successful"
}
```

Endpoint này thu hồi phiên gắn với refresh token được cung cấp.

### Đăng xuất tất cả thiết bị

Yêu cầu access token.

```http
POST /api/v1/auth/logout-all
Authorization: Bearer <access-token>
```

Phản hồi thành công (`200`):

```json
{
  "message": "Logged out from all devices successfully"
}
```

Endpoint này thu hồi toàn bộ refresh session đang hoạt động của người dùng. Các access token đã phát hành vẫn hợp lệ cho đến khi hết hạn.

## Mã lỗi thường gặp

| HTTP status | Trường hợp |
| --- | --- |
| `400` | Thiếu dữ liệu bắt buộc hoặc mật khẩu quá ngắn |
| `401` | Sai thông tin đăng nhập, token không hợp lệ, hết hạn hoặc đã bị thu hồi |
| `403` | Tài khoản đã bị vô hiệu hóa |
| `409` | Email đã tồn tại |
| `500` | Lỗi nội bộ service |
| `503` | Health check không kết nối được PostgreSQL |

Lỗi được trả về theo dạng:

```json
{
  "message": "Mô tả lỗi"
}
```

## Kiểm thử nhanh bằng cURL

```bash
# Health check
curl http://localhost:3001/health

# Đăng ký
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"password123"}'

# Đăng nhập
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"password123"}'

# Lấy thông tin người dùng
curl http://localhost:3001/api/v1/auth/me \
  -H 'Authorization: Bearer <access-token>'
```

## Ghi chú bảo mật

- Access token có issuer `auth-service` và audience `ecommerce-api`.
- Refresh token có issuer và audience là `auth-service`.
- Refresh token được định danh bằng `jti`; database chỉ lưu SHA-256 hash của token.
- Nên dùng HTTPS ở API gateway/reverse proxy trong môi trường production.
- Nên định kỳ dọn các refresh session đã hết hạn hoặc bị thu hồi khi triển khai production.
