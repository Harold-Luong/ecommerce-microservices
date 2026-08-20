# AWS E-commerce Microservices

Dự án thực hành xây dựng và triển khai một hệ thống thương mại điện tử theo kiến trúc microservices trên AWS. Mục tiêu là hiểu cách application, container, network, database, messaging, security, monitoring, scaling và CI/CD phối hợp với nhau—not chỉ dừng ở việc API trả về `200 OK`.

> Trạng thái hiện tại: repository đang ở giai đoạn thiết kế và lập kế hoạch; mã nguồn ứng dụng và hạ tầng chưa được khởi tạo.

## Phạm vi

| Service | Trách nhiệm chính | Runtime / storage dự kiến |
| --- | --- | --- |
| Auth | Đăng ký, đăng nhập, refresh token, logout | ECS Fargate, PostgreSQL |
| User | Hồ sơ, địa chỉ, avatar, preferences | ECS Fargate, PostgreSQL, S3 |
| Product | Sản phẩm, danh mục, tồn kho, hình ảnh | ECS Fargate, DynamoDB, S3 |
| Order | Tạo và tra cứu đơn hàng | ECS Fargate, PostgreSQL, SQS |
| Payment | Xử lý payment giả lập bất đồng bộ | ECS Fargate, SQS, DLQ |
| Notification | Nhận event và gửi thông báo | Lambda, SQS |

Frontend dự kiến dùng Vue 3 hoặc React; backend dự kiến dùng Node.js và Express. Các lựa chọn này chưa được cố định cho đến khi mã nguồn được khởi tạo.

## Kiến trúc tổng quan

```text
Browser ──► CloudFront ──► S3 (frontend)
   │
   └──────► ALB ──► ECS services
                         ├──► PostgreSQL / DynamoDB / S3
                         ├──► service-to-service HTTP
                         └──► SQS ──► Payment worker
                                      └──► SQS ──► Notification Lambda
```

ECS tasks và database hướng tới private subnets. ALB là public entry point; quyền truy cập AWS của application đến từ IAM task role, còn secret được inject khi ECS khởi chạy task. Xem [Architecture](docs/architecture.md) để biết thiết kế chi tiết.

## Cấu trúc repository dự kiến

```text
ecommerce-microservices/
├── frontend/
├── services/
│   ├── auth-service/
│   ├── user-service/
│   ├── product-service/
│   ├── order-service/
│   ├── payment-service/
│   └── notification-service/
├── infrastructure/
├── docs/
├── .github/workflows/
└── docker-compose.yml
```

Đây là cấu trúc mục tiêu, không phải mô tả trạng thái hiện tại của repository.

## Bắt đầu

Giai đoạn đầu tiên là dựng Auth, Product và Order service, sau đó chạy local:

```bash
docker compose up --build
```

Lệnh này chỉ khả dụng sau khi Phase 0 hoàn tất. Không deploy đồng thời toàn bộ kiến trúc; triển khai từng phase, kiểm thử và quan sát failure mode trước khi chuyển tiếp.

## Tài liệu

- [Architecture](docs/architecture.md): ranh giới service, data ownership, API và luồng request/event.
- [Roadmap](docs/roadmap.md): thứ tự triển khai từ local đến CI/CD.
- [Operations](docs/operations.md): security, observability, scaling, failure testing, debugging và cost control.

## Definition of done

- Deploy đủ sáu service với network và IAM hợp lý; RDS không public và secret không nằm trong source code.
- Route request đúng qua ALB; giao tiếp nội bộ không vòng qua Internet.
- Payment qua SQS có retry, DLQ và idempotency; notification chạy bằng Lambda.
- Upload image trực tiếp lên S3 bằng presigned URL; frontend được serve qua CloudFront.
- Có logs, metrics, alarms, load test, failure test và CI/CD tới ECS.
- Lần theo được một request từ browser qua network, IAM, service, storage và log liên quan.

## Nguyên tắc học

Với mỗi AWS service: hiểu vấn đề → cấu hình → kiểm thử → cố tình làm hỏng → debug qua logs/metrics → đánh giá security và cost → cuối cùng mới automation.
