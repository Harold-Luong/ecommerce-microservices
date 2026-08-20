# Architecture

Tài liệu này mô tả kiến trúc mục tiêu. Việc triển khai thực tế được chia nhỏ trong [Roadmap](roadmap.md).

## Service boundaries

Mỗi service sở hữu dữ liệu của mình. Có thể dùng chung một RDS instance để tiết kiệm chi phí học tập, nhưng Auth, User và Order phải dùng database/schema riêng; service không truy vấn trực tiếp bảng do service khác sở hữu.

### Auth service

- API: `POST /api/auth/register`, `/login`, `/refresh`, `/logout`.
- Lưu user credentials và auth sessions trong PostgreSQL.
- Chạy trên ECS Fargate; dùng Secrets Manager cho database credentials và JWT secret.

### User service

- API: `GET|PATCH /api/users/me`, `GET|POST /api/users/me/addresses`.
- Lưu profile, address, preferences và `avatar_key` trong PostgreSQL.
- Cấp presigned URL để browser upload avatar trực tiếp lên S3.

### Product service

- API: `GET|POST /api/products`, `GET|PATCH|DELETE /api/products/:id`.
- Lưu product, category và inventory trong DynamoDB để thực hành partition key, sort key, query và GSI.
- Xác định access patterns và key design trước khi tạo table.

### Order service

- API: `POST /api/orders`, `GET /api/orders`, `GET /api/orders/:id`.
- Gọi Product đồng bộ để kiểm tra sản phẩm, lưu order trong PostgreSQL, rồi publish payment request vào SQS.
- Cần timeout và error mapping rõ ràng để tránh cascading failure.

### Payment và Notification

- Payment là ECS worker, không public qua ALB; consume `payment-queue`, xử lý idempotent rồi publish sang `notification-queue`.
- Notification là Lambda được trigger từ queue; thực hành event source mapping, retry, execution role và CloudWatch Logs.

## Request routing

ALB internet-facing nằm trong ít nhất hai public subnets. Mỗi public service có target group và health check `GET /health` riêng:

| Path pattern | Target group |
| --- | --- |
| `/api/auth/*` | Auth |
| `/api/users/*` | User |
| `/api/products/*` | Product |
| `/api/orders/*` | Order |

Health endpoint trả `200` và `{"status":"ok"}` khi process sẵn sàng. Readiness nên phản ánh dependency thiết yếu nhưng tránh biến lỗi tạm thời thành restart loop.

## Network

```text
VPC 10.0.0.0/16
├── Public A       10.0.1.0/24  ┐ ALB, NAT Gateway
├── Public B       10.0.2.0/24  ┘
├── Private App A  10.0.11.0/24 ┐ ECS tasks
├── Private App B  10.0.12.0/24 ┘
├── Private DB A   10.0.21.0/24 ┐ RDS subnet group
└── Private DB B   10.0.22.0/24 ┘
```

- Public route `0.0.0.0/0` tới Internet Gateway.
- Private app egress ban đầu qua NAT Gateway; về sau cân nhắc VPC endpoints cho ECR, S3, Logs, Secrets Manager và dịch vụ cần dùng.
- ALB SG nhận `80/443`; ECS SG chỉ nhận app port từ ALB SG; RDS SG chỉ nhận `5432` từ SG của client hợp lệ.
- Mục tiêu dùng HTTPS; HTTP-only chỉ phù hợp với phase học tập tạm thời.

Traffic nội bộ không đi qua public Internet. Order gọi Product qua private DNS bằng ECS Service Connect hoặc Cloud Map, ví dụ `http://product.internal:3000`.

## Storage và upload

- PostgreSQL: dữ liệu giao dịch của Auth, User, Order.
- DynamoDB: Product theo access patterns đã thiết kế.
- S3: frontend, avatar, product images; database chỉ lưu object key.
- CloudFront: phân phối frontend và image từ private S3 origins khi phù hợp.

```text
Browser ──request URL──► User/Product service
Browser ◄──presigned URL───────────────┘
Browser ───────PUT object────────────► S3
```

Backend validate content type, size, key prefix và quyền user trước khi cấp URL.

## Messaging và consistency

```text
Order ──► payment-queue ──► Payment worker
               └── failures after maxReceiveCount ──► payment-dlq
Payment ──► notification-queue ──► Lambda
```

Visibility timeout phải dài hơn thời gian xử lý dự kiến. Consumer lưu idempotency key (ví dụ `paymentId`) vì SQS standard queue có at-least-once delivery. Triển khai production-like cần giải quyết tính nguyên tử giữa ghi state và publish event, ví dụ transactional outbox.

## IAM và deployment

- Task execution role: ECS agent pull ECR image, gửi logs và lấy secret khai báo trong task definition.
- Task role: quyền AWS SDK của application với DynamoDB, SQS hoặc S3.
- Lambda execution role: quyền đọc SQS, ghi logs và gọi dependency cần thiết.
- Không đặt long-lived access keys trong container; áp dụng least privilege theo service.

```text
Source → tests → Docker image → ECR → task definition revision
       → ECS rolling deployment → health checks → traffic
```
