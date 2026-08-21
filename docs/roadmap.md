# Deployment roadmap

Mỗi phase phải có đầu ra kiểm chứng được. Không tạo toàn bộ AWS resources ngay từ đầu.

## Phase 0 — Local application

Dựng Auth, Product, Cart và Order service, Dockerfile, health endpoint và Docker Compose. Kiểm tra REST API, container network và service-to-service calls.

## Phase 1 — AWS network

Tạo VPC, subnets ở hai Availability Zones, route tables, Internet Gateway và security groups. Giải thích được đường đi ingress/egress trước khi deploy.

## Phase 2 — ECR

Tạo repository theo service, build/tag/push image và xác minh image digest.

## Phase 3 — ECS

Deploy Product service đầu tiên lên Fargate. Phân biệt cluster, task definition, task, service, execution role và task role.

## Phase 4 — ALB

Tạo ALB, listener, target group và `/health`; gọi Product API qua DNS của ALB.

## Phase 5 — Multiple services

Deploy Auth, Product, Cart, Order và path-based routing. Đây là milestone public API đầu tiên.

## Phase 6 — Databases

Tạo PostgreSQL và DynamoDB; kết nối Auth/Cart/Order với PostgreSQL, Product với DynamoDB. Xác minh backup, connectivity và data ownership.

## Phase 7 — Secrets

Đưa database credentials và JWT secret vào Secrets Manager; thu hẹp IAM và bảo đảm secret không xuất hiện trong Git/logs.

## Phase 8 — Private architecture

Đưa ECS và RDS vào private subnets; kiểm tra image pull, logs, secrets và outbound access qua NAT/VPC endpoints.

## Phase 9 — User service

Thêm User service và database/schema do service sở hữu.

## Phase 10 — SQS

Tạo `payment-queue`, `payment-dlq`, redrive policy và test visibility timeout/retry.

## Phase 11 — Payment worker

Deploy Payment service; kiểm tra duplicate delivery và idempotency.

## Phase 12 — Notification

Tạo `notification-queue`, Lambda và event source mapping; kiểm tra retry/error behavior.

## Phase 13 — S3 uploads

Implement presigned URL cho avatar/product images; validate type, size, ownership và CORS.

## Phase 14–15 — Frontend delivery

Build Vue/React, upload static assets lên private S3 và serve qua CloudFront. Cấu hình SPA fallback và cache invalidation hoặc versioned assets.

## Phase 16 — Observability

Thêm structured logs, correlation/request ID, metrics, dashboard, alarms và retention policy.

## Phase 17 — Auto Scaling

Cấu hình min/desired/max tasks và target tracking; load test để quan sát scale-out/scale-in, cooldown và giới hạn downstream.

## Phase 18 — Failure testing

Thử task crash, unhealthy target, unavailable database/Product/Payment, SQS retry và DLQ. Ghi lại expected behavior và recovery steps.

## Phase 19 — CI/CD

GitHub Actions chạy tests, build immutable image tag, push ECR, tạo task definition revision và deploy ECS. Thêm rollback khi deployment không ổn định.

## Tiêu chí hoàn tất phase

Một phase chỉ hoàn tất khi có thể giải thích vấn đề dịch vụ giải quyết, đường đi network/IAM, cách quan sát, chi phí, failure mode và cách khôi phục—not chỉ khi console hiển thị trạng thái xanh.
