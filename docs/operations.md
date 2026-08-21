# Operations guide

Tài liệu này tách rõ những gì có thể vận hành ở local hiện tại và các thực hành AWS là mục tiêu cho phase sau. Không giả định ECS, ALB, SQS, Lambda, CloudWatch hay CI/CD đã tồn tại trong repository.

## Local runbook hiện tại

### Khởi động và kiểm tra

Khởi động Auth, Product, Cart rồi Order theo hướng dẫn trong README của từng service. Mỗi service dùng PostgreSQL database/user riêng và lắng nghe ở các port sau:

| Service | Port | Health check |
| --- | --- | --- |
| Auth | `3001` | `GET http://localhost:3001/health` |
| Product | `3002` | `GET http://localhost:3002/health` |
| Cart | `3003` | `GET http://localhost:3003/health` |
| Order | `3004` | `GET http://localhost:3004/health` |

Health check chạy `SELECT 1` trên database. Response `200` nghĩa là service và database đang kết nối; `503` nghĩa là database không truy cập được. Swagger UI có ở `/api-docs` của mỗi service.

Mỗi service hiện bind `0.0.0.0`. Đây chỉ phù hợp cho local development trong mạng tin cậy. Không mở trực tiếp Product/Cart port ra Internet, vì `/internal/*` chưa được cô lập bằng network layer; chúng chỉ yêu cầu shared `INTERNAL_API_KEY`.

### Kiểm tra nhanh

Chạy test unit hiện có trong từng service:

```bash
cd services/auth-service && npm test
cd services/product-service && npm test
cd services/cart-service && npm test
cd services/order-service && npm test
```

Các test này chưa thay thế test end-to-end với bốn service và PostgreSQL thật. Các tình huống checkout cần kiểm tra trước khi deploy được liệt kê trong [Checkout consistency](checkout-consistency.md#minimum-verification-scenarios).

### Recovery checkout thủ công

Chưa có worker tự retry hoặc reconciliation. Khi một dependency lỗi, retry từ client/vận hành phải giữ nguyên `Idempotency-Key` cho cùng checkout intent:

| Quan sát | Hành động hiện tại |
| --- | --- |
| Order `PENDING` | Retry `POST /api/orders` với cùng key để reserve/finalize tiếp. |
| Order `PENDING_PAYMENT`, `cart_consumed=false` | Retry checkout với cùng key để Cart consume lại idempotently. |
| Order `CANCEL_PENDING` | Retry `POST /api/orders/:id/cancel` để Product release reservation. |
| Order `FAILED` | Không retry cùng intent; user cập nhật cart rồi tạo key mới. |

Không tự ý sửa stock, reservation hoặc cart record trực tiếp trong database. Điều đó có thể phá invariant idempotency giữa ba service.

## Security snapshot

- `.env.development` được version control và chỉ có placeholder local; không dùng chúng làm production secret.
- `JWT_ACCESS_SECRET` phải giống nhau ở Auth, Product, Cart và Order. `INTERNAL_API_KEY` phải giống nhau ở Product, Cart và Order.
- `INTERNAL_API_KEY` là shared secret, không phải mTLS, IAM service identity hay per-service credential.
- Không log password, refresh token, JWT access token hoặc internal API key.
- Không có Docker Compose, AWS secret manager, TLS termination, security group hay private service discovery trong implementation hiện tại.

## Mục tiêu vận hành AWS

Sau khi local integration, concurrency và recovery đã được kiểm chứng, kiến trúc mục tiêu sẽ bổ sung:

- ALB chỉ route public API; internal endpoint không có listener rule public.
- ECS/RDS ở private subnet, Service Connect/Cloud Map hoặc private DNS cho Order → Product/Cart, TLS và security group theo source.
- Secrets Manager cho credential production; task role/execution role least privilege.
- Structured log, correlation ID, metrics, alarm, tracing, load/failure test và CI/CD.
- Transactional Outbox, SQS, Payment worker, Notification Lambda, retry và DLQ.

Thứ tự triển khai và tiêu chí bằng chứng cho các phần này ở [Roadmap](roadmap.md).
