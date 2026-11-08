# Phase 0: thiết kế

> Tổng kết lại sau khi đã làm.

## Cấu trúc repo

Monorepo gồm `backend/`, `frontend/`, `infra/`, `docs/`, để một PR có thể sửa cả code và tài liệu.

## Khung backend

- NestJS chạy ES modules, tiền tố `/api`, Swagger tại `/api/docs`.
- Module: `auth`, `users`, `accounts`, `transactions`, `common`, `database`. Mỗi module một người phụ trách.
- `HttpExceptionFilter` và `AppException`: mọi lỗi có dạng `{ code, message, requestId, details? }`.
- `RequestIdMiddleware`: mỗi request có `X-Request-Id`.

## Database

- PostgreSQL 16, cổng dev 5433 để không trùng PostgreSQL đã cài sẵn.
- `synchronize` tắt, schema chỉ đổi qua migration. Entity khớp với migration.
- Dựng sẵn `ledger_entries`, `idempotency_keys`, các trạng thái giao dịch và tài khoản, để Phase 2 chỉ cần mở rộng.
- Seed tạo tài khoản quỹ `000000000000`, nên tổng số dư mọi tài khoản luôn bằng 0.

## Quyết định kiến trúc

[ADR 001](../adr/001-modular-monolith.md), [002](../adr/002-postgresql.md), [003](../adr/003-dong-bo-va-bat-dong-bo.md), [005](../adr/005-so-cai-kep.md).
