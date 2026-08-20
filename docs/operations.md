# Operations guide

## Observability

Mỗi service ghi structured logs vào log group riêng, kèm timestamp, level, service, request/correlation ID và error context; không log token, password hoặc PII nhạy cảm.

| Component | Metrics tối thiểu |
| --- | --- |
| ECS | CPU, memory, desired/running task count |
| ALB | request count, response time, target 4xx/5xx, healthy hosts |
| SQS | visible/in-flight messages, age of oldest message, DLQ depth |
| Lambda | invocations, errors, duration, throttles, concurrency |
| RDS | CPU, connections, storage, latency, freeable memory |

Alarm cho unavailable targets, 5xx bất thường, queue backlog/age, DLQ có message, Lambda errors và database capacity. Threshold phải dựa trên baseline sau load test.

## Scaling và failure testing

Bắt đầu ECS với `min=1`, `desired=1`, `max=4` cho môi trường học tập. Dùng k6 hoặc công cụ tương đương để tăng tải có kiểm soát; quan sát ALB latency, ECS CPU/memory, thời gian provision task và database. Scale application không tự động scale mọi dependency.

- Dừng Product và gọi `POST /api/orders`: xác minh timeout ngắn, response có kiểm soát và correlation ID.
- Dừng Payment: Order vẫn tạo được; SQS giữ backlog và worker xử lý khi phục hồi.
- Gửi poison message: retry hữu hạn rồi chuyển DLQ.
- Dừng task sau khi nhận message: message xuất hiện lại sau visibility timeout; idempotency ngăn tác dụng phụ trùng.
- Làm target fail health check: ALB ngừng route và ECS thay task.

## Debugging flows

### ALB trả 503

```text
Listener/rule → target group → target health → security groups
→ ECS service/events → task/container → application logs
```

### ECS task không khởi động

```text
ECS events → stopped reason → image/platform → ECR permission
→ execution role → subnet egress/endpoints → secrets → container logs
```

### Database không kết nối

```text
RDS status/endpoint → DNS → route/security group → port/TLS
→ credentials → connection limits → application logs
```

Không thay đổi ngẫu nhiên nhiều lớp cùng lúc; kiểm tra từ entry point đến dependency và ghi lại bằng chứng.

## Security checklist

- RDS và ECS tasks không có public IP trong kiến trúc mục tiêu.
- Security groups tham chiếu source SG; không mở database cho `0.0.0.0/0`.
- Mỗi service có task role riêng với least privilege; không hard-code AWS keys.
- Secret không nằm trong repository, image, task-definition plaintext hoặc logs.
- S3 Block Public Access bật; CloudFront dùng private origin access phù hợp.
- Image upload giới hạn key prefix, content type, size, expiry và quyền user.
- ECR image được scan và deploy bằng immutable tag/digest.
- Production-like entry point dùng HTTPS; bật encryption at rest/in transit khi hỗ trợ.

## Cost control

Chi phí đáng chú ý: NAT Gateway, ALB, RDS, Fargate, CloudWatch Logs và data transfer. Dùng AWS Budgets/cost alerts, resource tags và log retention từ đầu.

Khi tạm nghỉ:

- Đưa ECS desired count về `0`.
- Stop RDS khi phù hợp; snapshot/xóa khi nghỉ dài hạn.
- Xóa NAT Gateway và ALB không dùng; kiểm tra route table/EIP còn sót.
- Kiểm tra event source mappings, logs, snapshots và S3 objects vẫn có thể phát sinh phí.

## CI/CD safeguards

Pipeline chạy tests trước khi build, dùng image tag bất biến (commit SHA), không in secrets, chờ ECS ổn định và fail nếu health check không đạt. Ưu tiên GitHub Actions OIDC federation sang AWS thay cho access keys dài hạn.
