# FRS: đặc tả chức năng

Đặc tả 7 use case của đề. Request, response chi tiết ở [api.md](../api.md). Mã lỗi đầy đủ ở mục "Định dạng lỗi" của tài liệu đó.

| UC | Chức năng | Tình trạng |
|---|---|---|
| UC1 | Quản lý khách hàng và tài khoản | Backend xong, nạp tiền mô phỏng chưa làm |
| UC2 | Xem số dư | Backend xong |
| UC3 | Chuyển tiền nội bộ | Backend xong |
| UC4 | Lịch sử giao dịch | Backend xong |
| UC5 | Trạng thái giao dịch | `completed` xong, lưu `failed` đang làm (F4) |
| UC6 | Audit trail | Xong phần đăng ký, đăng nhập, khóa user và tài khoản. Ghi log chuyển tiền đang làm (F4) |
| UC7 | Phát hiện giao dịch đáng ngờ | Tuần 8, AI tuần 11 |

Giao diện frontend đang hoàn thiện.

## UC1. Quản lý khách hàng và tài khoản

**Đăng ký** (`POST /api/auth/register`, công khai)
- Họ tên ít nhất 2 ký tự. Email hợp lệ, chuyển về chữ thường. Mật khẩu ít nhất 8 ký tự, có chữ và số.
- Tạo user và 1 tài khoản VND số dư 0 trong cùng một DB transaction. Số tài khoản 12 chữ số, tự sinh, trùng thì sinh lại.
- Mật khẩu lưu bằng bcrypt. Ghi audit log.
- Lỗi: `409 EMAIL_ALREADY_EXISTS`, `400 VALIDATION_ERROR`.

**Đăng nhập** (`POST /api/auth/login`, công khai)
- Trả JWT sống 15 phút. Đăng xuất làm ở frontend bằng cách xóa token.
- Sai email và sai mật khẩu trả cùng một lỗi để tránh dò email.
- Mỗi request kiểm tra trạng thái user trong DB, nên user bị khóa thì token đã cấp cũng bị từ chối.
- Lỗi: `401 INVALID_CREDENTIALS`, `401 USER_LOCKED`.

**Khóa, mở user** (`PATCH /api/admin/users/:id/status`, Admin)
- Admin không tự khóa chính mình (`422 CANNOT_LOCK_SELF`). Ghi audit log.

**Khóa, mở tài khoản ngân hàng** (`PATCH /api/operator/accounts/:id/status`, Operator và Admin)
- Chỉ nhận `frozen` hoặc `active`. Khi khóa bắt buộc có lý do, tối đa 500 ký tự.
- Tài khoản bị khóa vẫn đăng nhập và xem số dư được, nhưng không chuyển đi và không nhận tiền được.
- Không đổi được tài khoản quỹ (`422 CANNOT_MODIFY_SYSTEM_ACCOUNT`) và tài khoản đã đóng (`422 ACCOUNT_CLOSED`).
- Gọi đúng trạng thái hiện có trả `200`, không ghi log trùng. Đổi trạng thái và audit log nằm trong cùng DB transaction.

**Nạp tiền mô phỏng** (Operator): chưa làm, hiện tiền mẫu được tạo bằng seed **(cần chốt người làm)**.

## UC2. Xem số dư

`GET /api/accounts/me`, người đã đăng nhập. Chỉ trả tài khoản của chính mình: `id`, số tài khoản, số dư, loại tiền, trạng thái.

## UC3. Chuyển tiền nội bộ

`POST /api/transactions/transfer`, Customer, bắt buộc header `Idempotency-Key`.

**Điều kiện hợp lệ**
- Số tiền là chuỗi, lớn hơn 0, tối đa 16 chữ số phần nguyên và 2 chữ số thập phân.
- `Idempotency-Key` tối đa 64 ký tự. Nội dung tối đa 140 ký tự, không bắt buộc.
- Tài khoản nguồn thuộc người gọi, khác tài khoản đích. Cả hai `active`. Đủ số dư.

**Luồng chính** (xem [sequence](../sequence-chuyen-tien.md))
1. Mở DB transaction, giữ chỗ key bằng `INSERT ... ON CONFLICT DO NOTHING`.
2. Khóa hai tài khoản theo thứ tự số tài khoản tăng dần.
3. Kiểm tra trạng thái và số dư sau khi đã khóa.
4. Cập nhật số dư bằng SQL, ghi giao dịch `completed`, ghi 2 dòng sổ cái, lưu response vào key.
5. Commit. Lỗi ở bất kỳ bước nào thì rollback toàn bộ.

**Gửi lại**
- Cùng key, cùng nội dung: trả lại đúng response cũ, không trừ tiền lần hai.
- Cùng key, khác nội dung: `409 IDEMPOTENCY_CONFLICT`.

**Lỗi:** `400 IDEMPOTENCY_KEY_REQUIRED`, `404 SENDER_ACCOUNT_NOT_FOUND`, `404 TARGET_ACCOUNT_NOT_FOUND`, `422 SAME_ACCOUNT`, `422 INSUFFICIENT_FUNDS`, `422 SENDER_ACCOUNT_NOT_ACTIVE`, `422 TARGET_ACCOUNT_NOT_ACTIVE`.

## UC4. Lịch sử giao dịch

`GET /api/transactions`, Customer.
- Gồm tiền vào và tiền ra, mới nhất trước. `page` từ 1, `limit` mặc định 20, tối đa 100.
- Lọc theo `from`, `to`, `accountId`. Không truyền `accountId` thì lấy tài khoản đầu tiên của người gọi.
- Tài khoản không thuộc người gọi: `404 ACCOUNT_NOT_FOUND`.

`GET /api/transactions/:id`: chỉ bên gửi và bên nhận xem được, người khác nhận `404 TRANSACTION_NOT_FOUND`.

## UC5. Trạng thái giao dịch

Trạng thái: `processing`, `completed`, `failed`. Hiện lệnh chuyển thành công ghi thẳng `completed`, lệnh lỗi không lưu. F4 bổ sung lưu `failed` kèm lý do trong transaction riêng, không ghi sổ cái, xem [phase2/spec.md](../phase2/spec.md).

## UC6. Audit trail

- Ghi lại ai làm gì, lúc nào, từ đâu: `actor`, `action`, `target`, `request_id`, `ip`, `metadata`.
- Hành động đã ghi: đăng ký, đăng nhập thành công và thất bại, khóa và mở user, khóa và mở tài khoản.
- Không ghi mật khẩu, token. Bảng chỉ thêm dòng, được trigger và phân quyền DB bảo vệ.
- Tra cứu: `GET /api/audit-logs`, Auditor và Admin, lọc theo `actorId`, `action`, `from`, `to`, `requestId`.

## UC7. Phát hiện giao dịch đáng ngờ

Chưa làm, tuần 8. Worker chấm giao dịch theo luật, gắn cờ cho Operator xem xét, **không tự động chặn**. Luật và API dự kiến ở [phase2/spec.md](../phase2/spec.md), mục F6. Tuần 11 bổ sung Isolation Forest.
