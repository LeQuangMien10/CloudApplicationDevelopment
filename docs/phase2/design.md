# Phase 2: thiết kế

API dự kiến: [api.md](../api.md), mục "API Phase 2". Thay đổi schema: [database.md](../database.md), mục "Phase 2".

## Phân quyền

Thêm vai trò `operator`, `auditor`, áp dụng bằng `@Roles()`. Bảng phân quyền ở [spec.md](spec.md).

## Audit log (đã làm)

- `AuditService.log(manager, entry)` ghi trong cùng transaction với thao tác.
- `AuditService.logStandalone(entry)` dùng khi không có transaction bao ngoài, lỗi ghi log không làm hỏng nghiệp vụ.
- `requestId`, `ip` lấy qua `AsyncLocalStorage` gắn ở `RequestIdMiddleware`.
- Bảng được bảo vệ giống sổ cái: `banking_app` chỉ có `SELECT`, `INSERT`, trigger chặn sửa, xóa.

## Worker và phát hiện bất thường (tuần 8)

Theo [ADR 003](../adr/003-dong-bo-va-bat-dong-bo.md), [ADR 007](../adr/007-outbox-postgresql.md):

1. Chuyển tiền ghi sự kiện vào `outbox_events` trong cùng transaction.
2. Worker là process riêng cùng codebase, lấy sự kiện bằng `SELECT ... FOR UPDATE SKIP LOCKED`.
3. Chấm theo luật, ghi `fraud_flags`. Xử lý một sự kiện hai lần không tạo cảnh báo trùng.
4. Lỗi thì thử lại có backoff, quá số lần thì đánh dấu `failed`.

## Đối soát (tuần 8)

Worker chạy mỗi ngày, so số dư với sổ cái, kiểm tra tổng số dư bằng 0 và mỗi giao dịch `completed` đủ 2 dòng sổ cái. Lưu vào `reconciliation_reports`.

## AI (tuần 11)

Luật kết hợp Isolation Forest, viết bằng Python, chỉ gắn cờ. Dịch vụ chấm điểm lỗi hoặc chậm thì worker chỉ dùng luật cố định. Lý do không dùng LLM sẽ ghi ở ADR 008.
