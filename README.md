# AWS E-commerce Microservices

Dự án thực hành xây dựng và triển khai một hệ thống thương mại điện tử theo kiến trúc microservices trên AWS. Trọng tâm hiện tại là tính nhất quán của checkout khi Auth, Product, Cart và Order có database riêng; các phần AWS, Payment và Notification được triển khai theo roadmap sau khi luồng local đã được kiểm chứng.

> Trạng thái hiện tại: Auth, Product, Cart và Order là Node.js/Express service đã có source code, migration, OpenAPI và Swagger UI. Chưa có Docker Compose, AWS infrastructure, Payment worker hoặc Notification Lambda.

## Phạm vi

| Service | Port | Trách nhiệm hiện tại | Storage sở hữu |
| --- | --- | --- |
| Auth | `3001` | Đăng ký, đăng nhập, refresh/logout, JWT và role `user`/`admin` | PostgreSQL: users, refresh sessions |
| Product | `3002` | Categories, products, audit log và inventory reservation | PostgreSQL: categories, products, audit logs, reservations |
| Cart | `3003` | Giỏ hàng theo user và consume item sau checkout | PostgreSQL: carts, cart items, cart consumptions |
| Order | `3004` | Checkout Saga, order snapshot, cancel/compensation | PostgreSQL: orders, order items |

User, Payment và Notification là các service dự kiến cho phase sau, chưa có source code trong repository. Frontend cũng chưa được khởi tạo.

## Checkout hiện tại

```text
Browser
  │ JWT + Idempotency-Key
  ▼
Order service
  ├── đọc cart bằng JWT của user
  ├── lưu Order PENDING và cart snapshot
  ├── reserve inventory tại Product bằng Order UUID
  ├── lưu price/name snapshot, chuyển PENDING_PAYMENT
  └── consume đúng quantity tại Cart bằng cùng Order UUID
```

Product là nguồn quyết định cuối cùng cho stock; Cart chỉ hiển thị dữ liệu tham khảo.
Không có distributed transaction giữa ba database. Tính nhất quán đến từ local transaction, idempotency key, row locking, retry và compensation. Xem [Checkout consistency](docs/checkout-consistency.md) để biết flow và failure mode chi tiết.

Khi chạy local, mỗi service lắng nghe trên `0.0.0.0` ở port riêng. Product và Cart chưa có network boundary tách public route với internal route: endpoint `/internal/*` vẫn có thể được gọi bởi bất kỳ client nào chạm được service port, nhưng yêu cầu `x-internal-api-key`. Không expose các port này ra Internet và không gửi key đó cho frontend.

## Kiến trúc AWS mục tiêu

```text
Browser ──► CloudFront ──► S3 (frontend)
   │
   └──────► ALB ──► ECS services
                         ├──► PostgreSQL / DynamoDB / S3
                         ├──► service-to-service HTTP
                         └──► SQS ──► Payment worker
                                      └──► SQS ──► Notification Lambda
```

ECS tasks và database hướng tới private subnets. ALB là public entry point; quyền truy cập AWS của application đến từ IAM task role, còn secret được inject khi ECS khởi chạy task. Đây là mục tiêu triển khai, chưa phải infrastructure đã tồn tại. Xem [Architecture](docs/architecture.md) để biết ranh giới giữa local implementation và AWS target.

## Cấu trúc repository hiện tại và mục tiêu

```text
ecommerce-microservices/
├── services/
│   ├── auth-service/
│   ├── product-service/
│   ├── cart-service/
│   ├── order-service/
├── docs/
└── README.md
```

`frontend/`, `user-service/`, `payment-service/`, `notification-service/`, `infrastructure/`, `.github/workflows/` và Docker Compose là cấu trúc mục tiêu, chưa phải đầy đủ trạng thái repository hiện tại.

## Chạy local

Cần một PostgreSQL instance có database/user riêng cho từng service. Làm theo hướng dẫn trong README của từng service, theo thứ tự khuyến nghị:

1. [Auth service](services/auth-service/README.md): migrate, seed rồi chạy service.
2. [Product service](services/product-service/README.md): migrate, seed rồi chạy service.
3. [Cart service](services/cart-service/README.md): migrate, seed rồi chạy service.
4. [Order service](services/order-service/README.md): migrate rồi chạy service.

Mỗi service tự nạp `.env.development` khi dùng script `*:dev`. Các file này chỉ chứa placeholder cho local và được version control có chủ đích; không được dùng làm secret production. `JWT_ACCESS_SECRET` phải giống nhau ở Auth/Product/Cart/Order; `INTERNAL_API_KEY` phải giống nhau ở Product, Cart và Order.

Repository hiện chưa có `docker-compose.yml`, vì vậy không dùng `docker compose up --build` ở thời điểm này.

Swagger UI sau khi service chạy:

| Service | URL |
| --- | --- |
| Auth | `http://localhost:3001/api-docs` |
| Product | `http://localhost:3002/api-docs` |
| Cart | `http://localhost:3003/api-docs` |
| Order | `http://localhost:3004/api-docs` |

## Tài liệu

- [Architecture](docs/architecture.md): ranh giới service, ownership, local implementation và AWS target.
- [Checkout consistency](docs/checkout-consistency.md): Saga, idempotency, concurrency, compensation và recovery hiện tại.
- [Roadmap](docs/roadmap.md): phần đã hoàn thành và thứ tự triển khai tiếp theo.
- [Operations](docs/operations.md): runbook local hiện tại và mục tiêu vận hành AWS.

## Definition of done cho giai đoạn hiện tại

- Checkout cùng `Idempotency-Key` không tạo order/reservation/cart consumption trùng.
- Nhiều checkout tranh cùng stock không làm tồn kho âm hoặc oversell.
- Lỗi tạm thời giữ trạng thái Saga để retry; lỗi nghiệp vụ được ghi nhận rõ ràng.
- Hủy order hoàn stock một lần và có thể retry an toàn.
- Contract public/internal được đồng bộ trong README và OpenAPI của từng service.

## Nguyên tắc học

Với mỗi AWS service: hiểu vấn đề → cấu hình → kiểm thử → cố tình làm hỏng → debug qua logs/metrics → đánh giá security và cost → cuối cùng mới automation.
