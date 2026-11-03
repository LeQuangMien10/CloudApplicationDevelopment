# Database (Phase 1)

PostgreSQL 16. Schema tạo bởi các migration trong `backend/src/database/migrations/`: `InitSchema` tạo bảng, `EnforceTransferLedgerIntegrity` và `RestrictLedgerMutation` thêm trigger và phân quyền bảo vệ sổ cái.

```mermaid
erDiagram
  users ||--o{ accounts : "sở hữu"
  accounts ||--o{ transactions : "gửi / nhận"
  transactions ||--|{ ledger_entries : "2 bút toán"
  accounts ||--o{ ledger_entries : ""
  users ||--o{ idempotency_keys : ""
  transactions |o--o| idempotency_keys : ""
```

## Các bảng

| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `users` | id, full_name, email, password_hash, role, status | role: customer, admin. status: active, locked |
| `accounts` | id, user_id, account_number, balance, currency, status, is_system, version | status: active, frozen, closed |
| `transactions` | id, type, status, from_account_id, to_account_id, amount, description, failure_reason, initiated_by, completed_at | type: transfer, deposit. status: processing, completed, failed |
| `ledger_entries` | id, transaction_id, account_id, direction, amount, balance_after | Sổ cái kép, chỉ thêm dòng |
| `idempotency_keys` | (user_id, key), request_hash, transaction_id, response_code, response_body, expires_at | Chống gửi trùng |

## Quy tắc quan trọng

- **Tiền:** `numeric(18,2)`, không dùng float.
- **Sổ cái kép:** mỗi giao dịch completed có đúng 1 dòng `debit` cho tài khoản gửi và 1 dòng `credit` cho tài khoản nhận, cùng số tiền.
- **Tài khoản quỹ** `000000000000` (`is_system = true`) là nguồn tiền khi nạp tiền, được phép âm. Vì vậy tổng số dư mọi tài khoản luôn bằng 0. Dùng để kiểm tra nhanh: `SELECT sum(balance) FROM accounts;`
- **Ràng buộc trong DB**, là lớp bảo vệ cuối cùng nếu code có lỗi:
  - số dư tài khoản thường không âm
  - số tiền giao dịch lớn hơn 0
  - tài khoản gửi khác tài khoản nhận
  - số tài khoản đúng 12 chữ số
  - mỗi giao dịch không có 2 dòng sổ cái cùng chiều
- **Idempotency:** khóa chính `(user_id, key)` đảm bảo cùng user gửi cùng key chỉ được ghi một lần.
- **Sổ cái chỉ thêm dòng (TV3):**
  - Trigger chặn `UPDATE`, `DELETE`, `TRUNCATE` trên `ledger_entries`.
  - Trigger kiểm tra lúc commit: giao dịch transfer `completed` phải có đúng 1 dòng debit, 1 dòng credit, đúng số tiền và đúng tài khoản. Sai thì cả transaction bị hủy.

## User database

| User | Dùng cho | Quyền |
|---|---|---|
| `bank` (`DB_USER`) | Migration, seed, dọn dữ liệu test, DBeaver/pgAdmin | Chủ schema |
| `bank_app` (`DB_APP_USER`) | Backend khi chạy | Role `banking_app`: đọc, thêm, sửa các bảng nghiệp vụ; với `ledger_entries` chỉ `SELECT`, `INSERT` |

- Tạo hoặc cập nhật `bank_app`: `npm run db:app-user`, chạy sau `migration:run`. Docker tự chạy bước này khi container khởi động.
- **Migration tạo bảng mới phải tự `GRANT` cho `banking_app`**, nếu không backend sẽ lỗi `permission denied`.
- Muốn sửa hoặc xóa sổ cái (dọn dữ liệu test, xử lý sự cố) phải dùng user thuộc role `ledger_maintainer` và bật `app.ledger_maintenance` trong transaction. Xem `backend/test/support/owner-data-source.ts`.

## Để dành cho Phase 2

- Đối soát số dư `accounts.balance` với `balance_after` trong sổ cái
- Chặn đổi trạng thái giao dịch đã `completed`
- Bảng `audit_logs`, `fraud_flags`, `reconciliation_reports`
- Thêm vai trò operator, auditor (`ALTER TYPE user_role ADD VALUE ...`)
