# Phase 2: yêu cầu

Tính năng nâng cao, bảo mật và AI, tuần 7 đến tuần 12. Chốt trong buổi họp 03/11/2026. Phần Cloud xem [phase-cloud](../phase-cloud/spec.md).

**Hai yêu cầu chưa có người làm** (cần chốt): Operator nạp tiền mô phỏng (UC1) và job quét giao dịch treo ở `processing`. Đề xuất: Châu Anh và Nhật, tuần 8.

Phần thiết kế API và bảng dưới đây là bản dự kiến để mọi người làm thống nhất. Người phụ trách được chỉnh khi làm, nhưng phải cập nhật [api.md](../api.md), [database.md](../database.md) trong cùng PR.

## Phân quyền sau Phase 2

| Việc | customer | operator | auditor | admin |
|---|---|---|---|---|
| Xem số dư, chuyển khoản, lịch sử của mình | Có | | | |
| Khóa, mở user (đăng nhập) | | | | Có |
| Khóa, mở tài khoản ngân hàng | | Có | | Có |
| Xem, xử lý cảnh báo bất thường | | Có | Chỉ xem | Có |
| Xem audit log, báo cáo đối soát | | | Có | Có |
| Xem giao dịch của mọi tài khoản | | Có | Có | Có |

Auditor chỉ đọc, không có API ghi nào.

**Phân biệt hai loại khóa:**
- **Khóa user** (`users.status = locked`): user không đăng nhập được, token cũ bị từ chối. Admin làm, đã có từ Phase 1.
- **Khóa tài khoản ngân hàng** (`accounts.status = frozen`): user vẫn đăng nhập, xem số dư được, nhưng tài khoản không chuyển đi và không nhận tiền được. Operator làm khi nghi ngờ gian lận (F3).

## F1. Vai trò Operator, Auditor (Châu Anh, tuần 7)

- Migration thêm `operator`, `auditor` vào enum `user_role`.
- Seed thêm `operator@bank.local`, `auditor@bank.local`.
- Áp dụng bảng phân quyền ở trên bằng `@Roles()` có sẵn. Mỗi API mới có test: đúng vai trò thì được, sai vai trò thì `403`.

## F2. Audit log (Châu Anh, tuần 7)

- Bảng `audit_logs`: `id`, `actor_id`, `actor_role`, `action`, `target_type`, `target_id`, `request_id`, `ip`, `metadata` (jsonb), `created_at`.
- **Chỉ thêm dòng**, làm giống `ledger_entries`: trigger chặn sửa, xóa; `banking_app` chỉ có `SELECT`, `INSERT`.
- Các hành động ghi log:
  - Đăng ký, đăng nhập thành công, đăng nhập thất bại.
  - Chuyển khoản thành công và thất bại.
  - Khóa, mở user; khóa, mở tài khoản ngân hàng.
  - Xử lý cảnh báo bất thường.
- Log của thao tác có thay đổi dữ liệu phải ghi **trong cùng DB transaction** với thao tác đó. Châu Anh làm `AuditService`, các module khác gọi.
- Không ghi mật khẩu, token vào `metadata`.
- API: `GET /api/audit-logs?actorId=&action=&from=&to=&requestId=&page=&limit=`, cho auditor và admin.

## F3. Khóa, mở tài khoản ngân hàng (Châu Anh, tuần 7)

- API: `PATCH /api/operator/accounts/:id/status`, body `{ "status": "frozen" | "active", "reason": "..." }`, cho operator và admin.
- Không đổi được tài khoản quỹ `000000000000`. `reason` bắt buộc khi khóa.
- Ghi audit log.
- Chuyển khoản đã chặn tài khoản không `active` từ Phase 1 (`SENDER_ACCOUNT_NOT_ACTIVE`, `TARGET_ACCOUNT_NOT_ACTIVE`), không cần sửa logic chuyển khoản.

## F4. Lưu giao dịch thất bại (Nhật, tuần 7)

- Lỗi nghiệp vụ khi chuyển khoản (không đủ số dư, tài khoản bị khóa) thì sau khi rollback, lưu một giao dịch `failed` kèm `failure_reason` trong một transaction riêng.
- Không ghi sổ cái cho giao dịch `failed`. Response trả về vẫn là `422` như hiện tại.
- Chỉ lưu khi tài khoản nguồn hợp lệ và thuộc user. Lỗi validate, sai chủ tài khoản thì không lưu.
- Lịch sử giao dịch hiển thị cả giao dịch `failed`.
- Các điểm đã chốt khi làm:
  - Chỉ lưu với `INSUFFICIENT_FUNDS`, `SENDER_ACCOUNT_NOT_ACTIVE`, `TARGET_ACCOUNT_NOT_ACTIVE`. `SAME_ACCOUNT` và đích không tồn tại không lưu được vì vi phạm ràng buộc của bảng `transactions`.
  - Lưu luôn `Idempotency-Key` với response `422`: gửi lại cùng key nhận lại đúng lỗi, không sinh thêm giao dịch `failed`.
  - Giao dịch `failed` chỉ bên gửi thấy. Bên nhận không thấy trong lịch sử và nhận `404` khi xem chi tiết.
  - Ghi audit log `transfer_completed` và `transfer_failed`.
  - Test: `backend/test/transfer.e2e-spec.ts` (test 10 đến 17). Collection Postman: `backend/test/postman/transactions.postman_collection.json`.

## F5. Outbox và worker (Nhật, tuần 8)

- Bảng `outbox_events`: `id`, `event_type`, `payload` (jsonb), `status` (`pending`, `done`, `failed`), `attempts`, `available_at`, `created_at`, `processed_at`.
- Chuyển khoản thành công ghi sự kiện `TRANSFER_COMPLETED` **trong cùng DB transaction**, nên sự kiện không bị mất.
- Worker là process riêng cùng codebase (`node dist/worker.js`), có service riêng trong `docker-compose.yml` (Hiếu hỗ trợ).
- Worker lấy sự kiện bằng `SELECT ... FOR UPDATE SKIP LOCKED`, lỗi thì thử lại có backoff, quá số lần thì đánh dấu `failed`.
- Xử lý một sự kiện hai lần không được tạo cảnh báo trùng.

## F6. Luật phát hiện bất thường (Nhật, tuần 8)

- Worker chấm sự kiện chuyển khoản theo luật, **không chặn** chuyển khoản.
- Luật tối thiểu, ngưỡng để trong cấu hình:

| Mã luật | Điều kiện |
|---|---|
| `LARGE_AMOUNT` | Số tiền lớn hơn nhiều lần trung bình các giao dịch trước của tài khoản |
| `HIGH_VELOCITY` | Hơn N giao dịch trong 5 phút |
| `NEW_PAYEE_LARGE` | Người nhận lần đầu và số tiền lớn |
| `DRAIN_ACCOUNT` | Chuyển đi hơn 90% số dư |

- Bảng `fraud_flags`: `id`, `transaction_id`, `rule_code`, `score`, `status` (`open`, `confirmed`, `dismissed`), `reviewed_by`, `reviewed_at`, `note`, `created_at`.
- API cho operator:
  - `GET /api/operator/fraud-flags?status=&page=&limit=`
  - `PATCH /api/operator/fraud-flags/:id`, body `{ "status": "confirmed" | "dismissed", "note": "..." }`. Ghi audit log.

## F7. Đối soát (Miền, tuần 8)

- Các kiểm tra:
  - Số dư mỗi tài khoản bằng tổng credit trừ tổng debit trong sổ cái, và bằng `balance_after` của dòng sổ cái mới nhất.
  - Tổng số dư mọi tài khoản bằng 0.
  - Mỗi giao dịch `completed` có đúng 2 dòng sổ cái.
- Worker chạy mỗi ngày một lần, lưu kết quả vào `reconciliation_reports`. Có thêm lệnh chạy tay.
- API: `GET /api/reconciliation/reports`, `POST /api/reconciliation/run`, cho auditor (chỉ xem) và admin.

## F8. Màn hình Operator, Auditor (Tú, tuần 8)

- Chặn trang theo vai trò.
- Operator: danh sách cảnh báo và xử lý cảnh báo, khóa và mở tài khoản.
- Auditor: xem audit log có bộ lọc, xem báo cáo đối soát.
- Giao diện gọi đúng API trong `docs/api.md`.

## F9. Rate limit, khóa đăng nhập (Châu Anh, tuần 9)

- Rate limit bằng `@nestjs/throttler`: đăng nhập tối đa 5 lần mỗi phút cho mỗi IP, chuyển khoản tối đa 30 lần mỗi phút cho mỗi user. Vượt thì trả `429 RATE_LIMITED`.
- Sai mật khẩu 5 lần trong 15 phút thì tạm khóa đăng nhập 15 phút. Ghi audit log.

## F10. Threat model (Châu Anh, Hiếu hỗ trợ, tuần 9)

- Top 5 rủi ro, mỗi rủi ro có biện pháp đã làm và bằng chứng (test, cấu hình, ảnh chụp). Lưu ở `docs/threat-model.md`.

## AI (tuần 11)

| Việc | Người làm |
|---|---|
| Sinh dữ liệu giao dịch giả lập có nhãn bình thường, gian lận | Nhật |
| Isolation Forest bằng Python, dịch vụ chấm điểm | Miền, Nhật |
| So sánh 2 cấu hình bằng precision, recall. ADR lý do không dùng LLM | Miền |

Dịch vụ chấm điểm lỗi hoặc chậm thì worker chỉ dùng luật cố định, chuyển khoản không bị ảnh hưởng.
