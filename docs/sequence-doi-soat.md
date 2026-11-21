# Sequence diagram: Đối soát (F7)

> Phụ trách: TV1 Miền. Admin chạy tay qua `POST /api/reconciliation/run`, hoặc chạy định kỳ mỗi ngày bằng `run-reconciliation.js`. Cả hai gọi chung `ReconciliationService.run()`.

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    participant Cron as Cron / Worker (F5)
    participant API as ReconciliationController
    participant Guard as JwtAuthGuard, RolesGuard
    participant Service as ReconciliationService
    participant DB as PostgreSQL

    alt Admin chạy tay
        Admin->>API: POST /reconciliation/run
        API->>Guard: JWT hợp lệ, role admin?
        Guard-->>API: Sai thì 401 / 403
        API->>Service: run(manual, admin)
    else Chạy định kỳ mỗi ngày
        Cron->>Service: node dist/reconciliation/run-reconciliation.js<br/>run(scheduled)
    end

    Service->>DB: BEGIN ISOLATION LEVEL REPEATABLE READ
    Service->>DB: pg_try_advisory_xact_lock
    alt Đang có lần đối soát khác
        DB-->>Service: false
        Service->>DB: ROLLBACK
        Service-->>API: 409 RECONCILIATION_IN_PROGRESS
    else Lấy được khóa
        Note over Service,DB: Mỗi kiểm tra là một câu SQL, đọc trên snapshot của transaction
        Service->>DB: (2) count, sum(balance) của accounts
        Service->>DB: (1) balance so với tổng credit - debit<br/>và balance_after dòng sổ cái mới nhất
        Service->>DB: (3) số dòng sổ cái của từng giao dịch,<br/>giao dịch processing quá 15 phút
        Service->>Service: status = ok nếu cả 3 đạt, cắt details còn 100 mục
        Service->>DB: INSERT reconciliation_reports
        opt Chạy tay
            Service->>DB: INSERT audit_logs (reconciliation_run)
        end
        Service->>DB: COMMIT
        alt status = mismatch
            Service->>Service: Log warn
        end
        Service-->>API: 201 báo cáo
        Service-->>Cron: mã thoát 0 (ok) hoặc 2 (mismatch)
    end
```

## Đối soát phát hiện được gì

Đối soát là lớp kiểm tra độc lập. Nó đứng sau các lớp chặn đã có: transaction của chuyển tiền, ràng buộc và trigger trong DB.

| Tình huống | Vì sao có thể xảy ra | Kiểm tra phát hiện | Test e2e |
|---|---|---|---|
| Số dư bị sửa thẳng trong DB, tổng toàn hệ thống lệch | Sửa tay, lỗi code cập nhật số dư mà không ghi sổ cái | (1) tài khoản lệch, (2) tổng khác 0 | 3 |
| Hai tài khoản lệch bù trừ nhau, tổng vẫn bằng 0 | Sửa tay cả hai bên | (1) từng tài khoản | 2 |
| Giao dịch `completed` thiếu hoặc lệch sổ cái | Trigger lúc commit chỉ áp dụng cho chuyển khoản, không áp dụng cho nạp tiền (`deposit`) | (3) `ledger_missing_or_unbalanced` | 4 |
| Giao dịch `failed`, `processing` lại có dòng sổ cái | DB không chặn trường hợp này | (3) `ledger_on_not_completed` | |
| Giao dịch treo ở `processing` | Service chết giữa chừng ở các luồng sau này có lưu trạng thái trung gian. Chuyển khoản hiện tại chạy trong một transaction nên chết giữa chừng là rollback, không để lại `processing` | (3) `stuck_processing` sau 15 phút | 5 |
| `balance_after` của dòng sổ cái mới nhất sai | Sửa sổ cái ở chế độ bảo trì | (1) so với `lastBalanceAfter` | |

## Khi chính việc đối soát gặp sự cố

| Tình huống | Xử lý | Test e2e |
|---|---|---|
| Đối soát chạy đúng lúc đang có chuyển tiền | Mỗi kiểm tra là một câu SQL nên không báo lệch giả. Không khóa bảng, chuyển tiền không bị chặn | 8 |
| Hai lần đối soát cùng lúc | Advisory lock, lần sau nhận `409`, script thoát mã 1 | 6 |
| DB lỗi giữa chừng | Transaction rollback, không có báo cáo dở dang. Script thoát mã 1 để cron báo lỗi | |
| Lộ credential của app | `banking_app` chỉ `SELECT`, `INSERT`, không sửa, xóa được báo cáo cũ | 7 |
| Quá nhiều mục lệch | `details` giữ 100 mục mỗi loại và bật `truncated`, các cột đếm vẫn đúng | Unit test |

## Lịch chạy

- Tạm thời dùng cron trên EC2, ví dụ 2 giờ sáng mỗi ngày: `0 2 * * * cd ~/CloudApplicationDevelopment && docker compose exec -T backend node dist/reconciliation/run-reconciliation.js`.
- Khi worker (F5) xong thì worker gọi `ReconciliationService.run({ trigger: 'scheduled' })` mỗi ngày, bỏ cron.
- Mã thoát 2 (lệch) là tín hiệu để cảnh báo. Gửi email cảnh báo qua outbox làm sau, cùng phần email của worker.
