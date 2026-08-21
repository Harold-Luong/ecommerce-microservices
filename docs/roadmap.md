# Deployment roadmap

Mỗi phase có đầu ra kiểm chứng được. Trạng thái “đã có source code” không đồng nghĩa với “đã sẵn sàng production” hoặc “đã deploy AWS”.

## Trạng thái hiện tại

| Hạng mục | Trạng thái | Ghi chú |
| --- | --- | --- |
| Auth local | Đã có | JWT, refresh session, role, migration, seed, Swagger |
| Product local | Đã có | Catalog, audit, PostgreSQL inventory reservation |
| Cart local | Đã có | User cart và idempotent internal consume |
| Order local | Đã có | Checkout Saga, cancel compensation, Swagger |
| Cross-service integration suite | Chưa đủ | Cần test với Auth/Product/Cart/Order và database thật |
| Docker Compose | Chưa có | Root repository chưa có compose file |
| Product Dockerfile | Chưa có | Cần bổ sung nếu vẫn chọn containerize local |
| AWS infrastructure | Chưa bắt đầu | Không có VPC/ECS/RDS/ECR trong repository hiện tại |
| Payment / Notification | Chưa bắt đầu | Chưa có service, queue hoặc Lambda |

## Phase 0 — Local service foundation

Đã hoàn thành phần code cơ bản:

- Auth, Product, Cart, Order có migration, health endpoint, OpenAPI/Swagger.
- Product giữ stock bằng PostgreSQL transaction, row lock và reservation idempotent.
- Cart consume idempotent theo `order_id`.
- Order dùng `Idempotency-Key`, trạng thái Saga và compensation khi cancel.

Việc còn lại trước AWS:

1. Tạo test end-to-end chạy bốn service với PostgreSQL thật.
2. Kiểm tra parallel checkout cạnh tranh cùng stock và retry sau timeout.
3. Kiểm tra recovery cho `PENDING`, `CANCEL_PENDING` và `PENDING_PAYMENT` với `cart_consumed=false`.
4. Quyết định/bổ sung Docker Compose và Product Dockerfile nếu local container là mục tiêu học tập.
5. Thiết kế reservation expiry reaper/reconciliation trước khi có Payment.

## Phase 1 — Local reliability hardening

Thêm request/correlation ID, structured logs, contract/integration tests và runbook cho checkout recovery. Không chuyển sang AWS trước khi có bằng chứng rằng retry không làm trừ stock/cart nhiều lần.

## Phase 2 — AWS network

Tạo VPC, public/private subnet ở hai Availability Zones, route table, Internet Gateway, NAT Gateway và security group. Giải thích được ingress/egress trước khi deploy application.

## Phase 3 — RDS và Secrets Manager

Tạo RDS PostgreSQL và database/schema riêng cho Auth, Product, Cart, Order. Đưa production database credentials, JWT secret và internal credential vào Secrets Manager; không đưa secret thật vào Git hoặc image.

Product tiếp tục dùng PostgreSQL trong roadmap này. Chuyển sang DynamoDB chỉ được thực hiện sau một thiết kế inventory/concurrency mới và migration rõ ràng.

## Phase 4 — ECR và containerization

Tạo ECR repository theo service, bổ sung Dockerfile còn thiếu, build/tag image bằng commit SHA và xác minh image digest. Nếu dùng Compose local, dùng cùng image/build context với production khi hợp lý.

## Phase 5 — ECS và ALB

Deploy từng service lên Fargate. Bắt đầu bằng Product hoặc Auth, sau đó Cart/Order. Tạo target group, health check `/health`, listener rule cho public API và rollback khi deployment không ổn định.

## Phase 6 — Private service communication

Đưa ECS tasks và RDS vào private subnet. Dùng Service Connect/Cloud Map hoặc private DNS cho Order → Product/Cart; internal API không public qua ALB. Cấu hình TLS, security group theo source SG và credential rotation.

## Phase 7 — Payment, Outbox và SQS

Thêm `payment-queue`, DLQ, redrive policy và Transactional Outbox tại Order. Payment worker phải xử lý at-least-once delivery idempotently; kiểm tra failure sau khi business state commit nhưng trước/sau publish.

## Phase 8 — Notification

Tạo `notification-queue`, Notification Lambda và event source mapping. Kiểm tra retry, poison message, DLQ, execution role và CloudWatch Logs.

## Phase 9 — User và media upload

Thêm User service sở hữu profile/address/preferences. Cấp presigned URL để browser upload avatar/product image trực tiếp S3; kiểm tra ownership, key prefix, MIME type, size, CORS và expiry.

## Phase 10 — Frontend delivery

Build frontend, upload static assets lên private S3 và serve qua CloudFront. Cấu hình SPA fallback, cache-control và invalidation/versioned assets.

## Phase 11 — Observability, scaling và CI/CD

Thêm structured logs, metrics, dashboard, alarm, tracing/correlation ID, load test, auto scaling và GitHub Actions OIDC → AWS. Pipeline chạy test, build immutable image, push ECR, deploy task definition revision và rollback khi health check thất bại.

## Tiêu chí hoàn tất một phase

Một phase chỉ hoàn tất khi có thể chứng minh:

- vấn đề mà thành phần giải quyết;
- đường đi request, network và IAM;
- data ownership, retry và failure mode;
- cách quan sát/khôi phục;
- security/cost trade-off;
- kết quả test hoặc bằng chứng vận hành tương ứng.
