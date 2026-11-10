# Hướng dẫn cho Claude Code

Monorepo Digital Banking Simulator. Quy trình làm một việc: [Agent.md](Agent.md). Tài liệu: [README.md](README.md).

## Cấu trúc

- `backend/`: NestJS 12 chạy ES modules, TypeORM, PostgreSQL 16, Vitest, oxlint
- `frontend/`: React, Vite
- `infra/`, `.github/`, `docker-compose.yml`: Docker, CI, cloud
- `docs/`: tài liệu

## Lệnh (trong `backend/`)

```bash
npm run build
npm run lint
npm test
npm run test:e2e          # cần DB đã migrate, tạo bank_app và seed
npm run migration:run
npm run db:app-user
npm run seed
npm run db:reset          # XÓA HẾT dữ liệu rồi tạo lại
```

DB dev ở cổng **5433**: `docker compose up -d db`.

## Quy ước bắt buộc

- **Import nội bộ có đuôi `.js`** vì backend là ES modules.
- **Tiền:** `numeric(18,2)`, kiểu `string` trong TypeScript, cộng trừ bằng SQL (`balance = balance - :amount`). Không dùng `number`.
- **Lỗi nghiệp vụ:** `throw new AppException(code, message, status)`. Mã mới phải thêm vào bảng lỗi trong `docs/api.md`.
- **Phân quyền:** `@UseGuards(JwtAuthGuard, RolesGuard)` và `@Roles(...)`. Dữ liệu của người khác trả `404`.
- **Không trả entity thô có quan hệ** ra API. Chỉ chọn đúng trường cần, không làm lộ số dư, email của người khác.
- **Trong một DB transaction không thử lại bằng try/catch:** sau một lỗi cả transaction bị hủy. Dùng `INSERT ... ON CONFLICT DO NOTHING` (`.orIgnore()`).
- **Audit log** của thao tác thay đổi dữ liệu ghi bằng `AuditService.log(manager, ...)` trong cùng transaction.

## Database

- Schema chỉ đổi qua migration. Entity phải khớp migration: `typeorm migration:generate --dryrun` báo không có thay đổi.
- **Bảng mới phải `GRANT` cho role `banking_app`.** Bảng chỉ thêm dòng thì chỉ cấp `SELECT`, `INSERT`.
- `ledger_entries`, `audit_logs` chỉ thêm dòng, không viết code sửa, xóa hai bảng này.

## Không được làm

- Commit `.env` hay secret.
- Commit thẳng vào `main`.
- Chạy `db:reset` trên DB có dữ liệu cần giữ.
