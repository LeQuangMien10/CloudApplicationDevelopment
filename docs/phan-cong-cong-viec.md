# Digital Banking Simulator: Kế hoạch và phân công Phase 2

Chốt trong buổi họp tối 03/11/2026. Phân công Phase 1 xem phụ lục ở cuối file.

Nguyên tắc của đề: *"Build less, but design, implement, measure and defend it well"*. Làm đúng và đo được các phần đề bắt buộc trước, phần làm thêm để sau.

## 1. Tình trạng các phase

| Phase | Nội dung | Tình trạng |
|---|---|---|
| **Phase 1** | Base app: đăng ký, đăng nhập, số dư, chuyển khoản, lịch sử, đăng xuất | Backend xong. Frontend hoàn thiện trong tuần 6 |
| **Phase Cloud** | Docker, CI/CD, deploy, giám sát, backup | Docker và CI backend xong. Deploy làm trong tuần 6 |
| **Phase 2** | Tính năng nâng cao, bảo mật, vận hành, AI | Tuần 7 đến tuần 12 |

Đã làm sớm trong Phase 1: chặn sửa, xóa sổ cái bằng trigger và tách user DB `bank_app`.

## 2. Các quyết định đã chốt

| # | Nội dung | Quyết định |
|---|---|---|
| 1 | Cloud | AWS. Bước đầu dùng 1 máy EC2 chạy `docker compose`, Caddy làm HTTPS. Chuyển sang RDS chỉ khi có credit |
| 2 | Hàng đợi cho worker | Bảng outbox trong PostgreSQL, worker đọc định kỳ. Không dùng Redis, Kafka |
| 3 | AI | Luật kết hợp Isolation Forest, không dùng LLM. Lý do ghi vào ADR |
| 4 | Làm thêm (2B) | Chỉ hạn mức giao dịch theo ngày, làm ở tuần 12 nếu dư thời gian |
| 5 | Phân công | Như mục 4, có một điều chỉnh: trạng thái tài khoản chuyển cho Châu Anh |
| 6 | Quy ước làm việc | Như mục 6 |

## 3. Lịch theo tuần

| Tuần | Thời gian | Việc chính | Output |
|---|---|---|---|
| 6 | 02/11 đến 08/11 | Hoàn thành frontend Phase 1. Frontend vào Docker và CI. Deploy cloud, HTTPS, cảnh báo ngân sách, tự động deploy. ADR 001 đến 005. **Họp tối thứ Bảy 07/11:** thống nhất báo cáo tuần, chốt demo Phase 1 | URL chạy trên cloud, CI/CD, `docs/adr/` |
| 7 | 09/11 đến 15/11 | **Thứ Hai 09/11: báo cáo trực tiếp trên lớp**, slide HTML và demo Phase 1. Vai trò Operator, Auditor. Audit log. Khóa, mở tài khoản ngân hàng. Lưu giao dịch `failed` | API mới kèm test phân quyền, bảng `audit_logs` |
| 8 | 16/11 đến 22/11 | Outbox và worker. Luật phát hiện bất thường. Đối soát. Màn hình Operator, Auditor | Demo gắn cờ, báo cáo đối soát |
| 9 | 23/11 đến 29/11 | Rate limit, khóa đăng nhập sai nhiều lần. Secret, mã hóa. Threat model. Backup và thử khôi phục | Threat model, demo bảo mật và audit |
| 10 | 30/11 đến 06/12 | Dashboard giám sát, SLO. Load test 1×, 5×, 10×. Test 1.000 lệnh đồng thời. Kill container và khôi phục | Báo cáo tải, báo cáo khôi phục |
| 11 | 07/12 đến 13/12 | Dữ liệu giả lập có nhãn. Isolation Forest. So sánh "chỉ luật" với "luật kết hợp Isolation Forest" | Dịch vụ chấm điểm rủi ro, báo cáo đánh giá |
| 12 | 14/12 đến 20/12 | Đóng băng tính năng, sửa lỗi. Mô hình chi phí. Chạy lại 5 demo. Hạn mức theo ngày nếu dư thời gian | Bản ổn định, báo cáo chi phí |
| 13 | 21/12 đến 27/12 | Báo cáo cuối kỳ, slide, video demo, bảo vệ | Báo cáo, slide, video |

## 4. Phân công

| Thành viên | Vai trò | Việc Phase 2 | Tuần |
|---|---|---|---|
| **TV1: Miền** | Trưởng nhóm backend | ADR 001 đến 005, cập nhật ADR các tuần sau. Đối soát (F7). Phân tích kết quả load test. Chủ trì đánh giá AI. Review PR, báo cáo tuần, giữ tài liệu chung | 6, 8, 10, 11 |
| **TV2: Châu Anh** | Xác thực, phân quyền, audit | Vai trò Operator, Auditor (F1). Audit log (F2). Khóa, mở tài khoản ngân hàng (F3). Rate limit, khóa đăng nhập (F9). Threat model (F10) | 7, 9 |
| **TV3: Nhật** | Giao dịch và phát hiện bất thường | Lưu giao dịch `failed` (F4). Outbox và worker (F5). Luật phát hiện bất thường (F6). Test 1.000 lệnh đồng thời. Sinh dữ liệu giả lập cho AI | 7, 8, 10, 11 |
| **TV4: Tú** | Frontend | Hoàn thành frontend Phase 1 trước thứ Sáu 06/11. Màn hình Operator, Auditor (F8). Video demo | 6, 8, 13 |
| **TV5: Hiếu** | Cloud và DevOps | Frontend vào Docker và CI. Deploy cloud, HTTPS, CD, cảnh báo ngân sách. Backup và khôi phục. IaC. Dashboard giám sát, SLO, load test. Báo cáo chi phí | 6, 9, 10, 12 |

- Miền hỗ trợ Hiếu phần load test và chi phí.
- Mô hình Isolation Forest viết bằng Python, Miền và Nhật làm chung.
- F3 sửa trong module `accounts` của Nhật, nên Nhật review PR này.
- Slide và demo cho buổi báo cáo 09/11: chốt người làm trong buổi họp thứ Bảy 07/11.

## 5. Yêu cầu từng tính năng

Phần thiết kế API và bảng dưới đây là bản dự kiến để mọi người làm thống nhất. Người phụ trách được chỉnh khi làm, nhưng phải cập nhật [api.md](api.md), [database.md](database.md) trong cùng PR.

### Phân quyền sau Phase 2

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

### F1. Vai trò Operator, Auditor (Châu Anh, tuần 7)

- Migration thêm `operator`, `auditor` vào enum `user_role`.
- Seed thêm `operator@bank.local`, `auditor@bank.local`.
- Áp dụng bảng phân quyền ở trên bằng `@Roles()` có sẵn. Mỗi API mới có test: đúng vai trò thì được, sai vai trò thì `403`.

### F2. Audit log (Châu Anh, tuần 7)

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

### F3. Khóa, mở tài khoản ngân hàng (Châu Anh, tuần 7)

- API: `PATCH /api/operator/accounts/:id/status`, body `{ "status": "frozen" | "active", "reason": "..." }`, cho operator và admin.
- Không đổi được tài khoản quỹ `000000000000`. `reason` bắt buộc khi khóa.
- Ghi audit log.
- Chuyển khoản đã chặn tài khoản không `active` từ Phase 1 (`SENDER_ACCOUNT_NOT_ACTIVE`, `TARGET_ACCOUNT_NOT_ACTIVE`), không cần sửa logic chuyển khoản.

### F4. Lưu giao dịch thất bại (Nhật, tuần 7)

- Lỗi nghiệp vụ khi chuyển khoản (không đủ số dư, tài khoản bị khóa) thì sau khi rollback, lưu một giao dịch `failed` kèm `failure_reason` trong một transaction riêng.
- Không ghi sổ cái cho giao dịch `failed`. Response trả về vẫn là `422` như hiện tại.
- Chỉ lưu khi tài khoản nguồn hợp lệ và thuộc user. Lỗi validate, sai chủ tài khoản thì không lưu.
- Lịch sử giao dịch hiển thị cả giao dịch `failed`.

### F5. Outbox và worker (Nhật, tuần 8)

- Bảng `outbox_events`: `id`, `event_type`, `payload` (jsonb), `status` (`pending`, `done`, `failed`), `attempts`, `available_at`, `created_at`, `processed_at`.
- Chuyển khoản thành công ghi sự kiện `TRANSFER_COMPLETED` **trong cùng DB transaction**, nên sự kiện không bị mất.
- Worker là process riêng cùng codebase (`node dist/worker.js`), có service riêng trong `docker-compose.yml` (Hiếu hỗ trợ).
- Worker lấy sự kiện bằng `SELECT ... FOR UPDATE SKIP LOCKED`, lỗi thì thử lại có backoff, quá số lần thì đánh dấu `failed`.
- Xử lý một sự kiện hai lần không được tạo cảnh báo trùng.

### F6. Luật phát hiện bất thường (Nhật, tuần 8)

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

### F7. Đối soát (Miền, tuần 8)

- Các kiểm tra:
  - Số dư mỗi tài khoản bằng tổng credit trừ tổng debit trong sổ cái, và bằng `balance_after` của dòng sổ cái mới nhất.
  - Tổng số dư mọi tài khoản bằng 0.
  - Mỗi giao dịch `completed` có đúng 2 dòng sổ cái.
- Worker chạy mỗi ngày một lần, lưu kết quả vào `reconciliation_reports`. Có thêm lệnh chạy tay.
- API: `GET /api/reconciliation/reports`, `POST /api/reconciliation/run`, cho auditor (chỉ xem) và admin.

### F8. Màn hình Operator, Auditor (Tú, tuần 8)

- Chặn trang theo vai trò.
- Operator: danh sách cảnh báo và xử lý cảnh báo, khóa và mở tài khoản.
- Auditor: xem audit log có bộ lọc, xem báo cáo đối soát.
- Giao diện gọi đúng API trong `docs/api.md`.

### F9. Rate limit, khóa đăng nhập (Châu Anh, tuần 9)

- Rate limit bằng `@nestjs/throttler`: đăng nhập tối đa 5 lần mỗi phút cho mỗi IP, chuyển khoản tối đa 30 lần mỗi phút cho mỗi user. Vượt thì trả `429 RATE_LIMITED`.
- Sai mật khẩu 5 lần trong 15 phút thì tạm khóa đăng nhập 15 phút. Ghi audit log.

### F10. Threat model (Châu Anh, Hiếu hỗ trợ, tuần 9)

- Top 5 rủi ro, mỗi rủi ro có biện pháp đã làm và bằng chứng (test, cấu hình, ảnh chụp). Lưu ở `docs/threat-model.md`.

### Cloud và vận hành (Hiếu)

| Việc | Tuần |
|---|---|
| Dockerfile frontend, service frontend trong compose, job CI frontend | 6 |
| EC2, Caddy HTTPS, cảnh báo ngân sách, tự động deploy khi merge `main` | 6 |
| Tách bước migration khỏi container backend, secret ngoài repo | 9 |
| Backup DB tự động, thử khôi phục và đo thời gian | 9 |
| IaC (Terraform) cho phần hạ tầng đang dùng | 9 |
| Dashboard theo 4 golden signals, SLO | 10 |
| Load test 1×, 5×, 10× bằng k6 (Miền phân tích) | 10 |
| Kịch bản kill container và khôi phục | 10 |
| Mô hình chi phí, chi phí mỗi giao dịch (Miền hỗ trợ) | 12 |

### AI (tuần 11)

| Việc | Người làm |
|---|---|
| Sinh dữ liệu giao dịch giả lập có nhãn bình thường, gian lận | Nhật |
| Isolation Forest bằng Python, dịch vụ chấm điểm | Miền, Nhật |
| So sánh 2 cấu hình bằng precision, recall. ADR lý do không dùng LLM | Miền |

Dịch vụ chấm điểm lỗi hoặc chậm thì worker chỉ dùng luật cố định, chuyển khoản không bị ảnh hưởng.

## 6. Quy ước làm việc

- Mỗi việc một GitHub Issue, gắn người làm và tuần. Theo dõi trên GitHub Projects.
- **Mở PR sớm**, dạng draft cũng được. Mỗi PR một việc, nên dưới khoảng 400 dòng thay đổi.
- **Hạn PR là tối thứ Sáu** để kịp review trước báo cáo thứ Hai.
- Ai đổi API hoặc schema thì cập nhật `docs/api.md`, `docs/database.md` trong cùng PR.
- **Migration tạo bảng mới phải `GRANT` cho `banking_app`.** Bảng chỉ thêm dòng (`audit_logs`) thì chỉ cấp `SELECT`, `INSERT`.
- Merge `main` vào nhánh của mình ít nhất 2 lần mỗi tuần. CI phải xanh trước khi merge.
- Mỗi tính năng có test, và có bước kiểm thử trong `docs/kiem-thu-phase-1.md` (sau đổi tên thành kịch bản kiểm thử chung).
- Ai chậm hơn 2 ngày so với hạn thì báo nhóm để chia lại việc.
- Kiểm tra `git config user.email` đúng email GitHub.

## 7. Năm demo bắt buộc cuối kỳ

| Demo | Tuần | Người chính |
|---|---|---|
| Chuyển tiền đồng thời | 10 | Nhật |
| Chống gửi trùng | Đã có, chạy lại tuần 12 | Nhật |
| Lỗi và khôi phục | 10 | Hiếu |
| Bảo mật và audit | 9 | Châu Anh |
| Load test có latency và tỷ lệ lỗi | 10 | Hiếu, Miền |

## 8. Lịch họp

- **Tối thứ Bảy 07/11:** thống nhất báo cáo tuần và slide HTML cho buổi báo cáo trên lớp 09/11, chốt bản demo Phase 1, phân công người trình bày.
- Các tuần sau (đề xuất): họp ngắn trước mỗi báo cáo thứ Hai, chốt lịch cụ thể trong buổi họp 07/11.

## Phụ lục: phân công Phase 1

| Thành viên | Vai trò | Nhiệm vụ |
|---|---|---|
| **TV1: Miền** | Trưởng nhóm backend | Khởi tạo repo NestJS và cấu trúc module (Auth, User, Account, Transaction). Cấu hình TypeORM, migration, schema có cả `ledger_entries`. Seed script. Định dạng lỗi chung. Swagger, README, `.env.example`. Review PR |
| **TV2: Châu Anh** | Backend xác thực | Đăng ký: hash bcrypt, tự tạo tài khoản ngân hàng. Đăng nhập: JWT. JwtGuard, RolesGuard, validate DTO, không trả `password_hash`, CORS. API admin: xem danh sách user, khóa và mở. Sequence diagram đăng nhập |
| **TV3: Nhật** | Backend chuyển tiền | `GET /accounts/me`. `POST /transactions/transfer` gồm: một DB transaction, khóa theo thứ tự id, kiểm tra số tiền và tài khoản, Idempotency-Key. `GET /transactions` có phân trang. Test rollback và test chuyển tiền đồng thời. Sequence diagram chuyển khoản |
| **TV4: Tú** | Frontend | React + Vite, chặn trang khi chưa đăng nhập, Axios gắn JWT. Các trang: Login/Register, Dashboard, Chuyển khoản (sinh key và khóa nút khi đang gửi), Lịch sử. Chọn thư viện quản lý state và ghi lý do |
| **TV5: Hiếu** | Cloud và DevOps | Dockerfile, docker-compose, endpoint `/health`. GitHub Actions chạy lint, test, build. Chọn cloud, tạo tài khoản, đặt cảnh báo ngân sách. Deploy bản đầu tiên lên cloud |
