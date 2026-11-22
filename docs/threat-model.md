# Threat model — Digital Banking Simulator

Phụ trách: TV2 Châu Anh (F10 Phase 2), Hiếu bổ sung bằng chứng hạ tầng. Cập nhật: 22/11/2026.

Phạm vi: backend API + database (PostgreSQL 16) và quy trình vận hành liên quan. Frontend chỉ là bề mặt gọi API — mọi biện pháp bảo mật đặt ở backend/DB. Mô hình triển khai tham chiếu: 1 instance EC2, Docker Compose, Caddy làm reverse proxy HTTPS (xem [adr/006-deploy-ec2-docker-compose.md](adr/006-deploy-ec2-docker-compose.md)).

Mỗi rủi ro trình bày theo khung: **Mô tả → Tác nhân/tấn công → Biện pháp đã làm → Bằng chứng → Khoảng trống còn lại**. Bằng chứng dẫn đường dẫn file + tên test đang xanh trong CI; ảnh chụp demo sống ở mục "Kịch bản demo" cuối tài liệu.

> Thứ tự merge: các test của rủi ro #1 nằm trên nhánh `feat/rate-limit-login-lockout` (F9, nộp tuần 9 trước hạn 27/11). Merge PR F9 **trước** khi dùng tài liệu này làm bằng chứng chính thức; trước đó các đường dẫn F9 ghi kèm tên nhánh.

---

## 1. Brute force / credential stuffing

**Mô tả:** Kẻ tấn công đoán mật khẩu hàng loạt trên `POST /api/auth/login`, hoặc dùng danh sách mật khẩu bị rò rỉ (credential stuffing) thử từng email.

**Tác nhân:** Bất kỳ ai truy cập được API (endpoint công khai). Tần suất cao, tự động.

**Biện pháp đã làm:**
- Mật khẩu băm bcrypt cost 12 (`BCRYPT_COST` trong `backend/src/auth/auth.service.ts`) — mỗi lần đoán tốn ~hàng trăm ms CPU của kẻ tấn công, không giải mã được ngược.
- Rate limit đăng nhập **5 lần/phút theo IP** bằng `@nestjs/throttler` (`LoginThrottlerGuard`), ngưỡng chỉnh qua `RATE_LIMIT_LOGIN_PER_MIN` không phải sửa code.
- Khóa đăng nhập **sai 5 lần trong 15 phút theo email** (`login_attempts`, `423 LOGIN_TEMPORARILY_LOCKED` kèm `retryAfter`) — chặn cả khi kẻ tấn công đổi IP. Kiểm tra khóa chạy **trước** bcrypt để không đốt CPU bcrypt của server. Đăng nhập thành công giữa chừng đưa bộ đếm về 0 (người dùng thật không bị khóa vĩnh viễn).
- Lỗi đăng nhập không phân biệt sai email hay sai mật khẩu (`INVALID_CREDENTIALS`) và luôn chạy so khớp với hash giả khi email không tồn tại — chống dò email và timing attack.
- Mỗi lần bị khóa ghi audit log `auth_login_locked` — có bằng chứng điều tra sau sự cố.

**Bằng chứng:** (nhánh `feat/rate-limit-login-lockout`, F9)
- `backend/test/login-ip-rate-limit.e2e-spec.ts` — "lần thứ 6 trong một phút từ cùng IP → 429 RATE_LIMITED kèm details.retryAfter"; "client đến từ X-Forwarded-For khác nhau không bị trừ vào chung một bucket" (trust proxy 1 hop trong `backend/src/app.setup.ts` để `req.ip` là IP client thật khi đứng sau Caddy)
- `backend/test/login-lockout.e2e-spec.ts` — 4 test: khóa sau 5 lần sai dù đúng mật khẩu vẫn 423; dòng cũ ngoài cửa sổ 15 phút không bị đếm; thành công giữa chừng reset bộ đếm; khi đã khóa, đúng lẫn sai mật khẩu đều 423 (không tiết lộ mật khẩu đúng)
- `backend/test/audit.e2e-spec.ts` — "audit log không chứa mật khẩu dù đăng nhập sai nhiều lần"
- Mức bcrypt: `backend/src/auth/auth.service.ts:19` (`BCRYPT_COST = 12`)

**Khoảng trống còn lại:** Chưa có WAF/challenge (CAPTCHA) cho lưu lượng phân tán nhiều IP; storage của throttler in-memory, restart container là mất bộ đếm (chấp nhận với 1 instance — quyết định trong kế hoạch F9). Kiểm tra khóa theo email không khóa transaction: hai request sai đăng nhập đồng thời đều đọc được cùng một `count` trước khi dòng mới được ghi (TOCTOU) — bunga ấm rộng bị giới hạn bởi rate limit theo IP (5/phút, block 60s), chấp nhận. Bảng `login_attempts` không có job dọn (truy vấn luôn giới hạn cửa sổ 15 phút) — tăng trưởng vô hạn, cân nhắc partition/retention khi chạy thật. Sau tuần 8-9, cân nhắc: storage shared (Redis) nếu scale nhiều instance.

---

## 2. Token bị đánh cắp dùng tiếp

**Mô tả:** Kẻ tấn công lấy được JWT của nạn nhân (máy nhiễm mã độc, log lộ token, rò rỉ localStorage) và dùng token đó gọi API như nạn nhân.

**Tác nhân:** Kẻ có token hợp lệ nhưng không phải chủ token; hoặc chính chủ tài khoản bị khóa cần bị chặn ngay.

**Biện pháp đã làm:**
- Token ngắn hạn: `JWT_EXPIRES_IN=15m` — cửa sổ lạm dụng tối đa 15 phút kể cả khi token rò rỉ.
- **Mỗi request** `JwtStrategy.validate()` tra lại `users.status` trong DB: user bị khóa thì token đã cấp trước đó cũng bị từ chối ngay (`401 USER_LOCKED`) — khóa tài khoản là thu hồi token tức thì, không cần blacklist.
- Role cũng đọc từ DB mỗi request (không tin vào claim trong token) — hạ quyền có hiệu lực ngay.
- Secret JWT qua biến môi trường, không commit (`.env` bị ignore, có `.env.example` riêng).

**Bằng chứng:**
- Kiểm tra trạng thái mỗi request: `backend/src/auth/jwt.strategy.ts` (validate → `user.status !== ACTIVE` → `USER_LOCKED`)
- `backend/test/app.e2e-spec.ts` — "admin khóa rồi mở lại user; user bị khóa không đăng nhập được" (token cũ bị từ chối)
- `backend/test/audit.e2e-spec.ts` — "admin khóa/mở user ghi USER_LOCKED, USER_UNLOCKED kèm actor là admin"

**Khoảng trống còn lại:** Không có cơ chế thu hồi từng token riêng lẻ (logout mọi thiết bị) — chỉ thu hồi được bằng khóa toàn bộ user. localStorage trên frontend dễ bị XSS đọc hơn HttpOnly cookie — ghi nhận, đánh giá lại khi làm giai đoạn AI/giám sát.

---

## 3. Đặc quyền vượt cấp (privilege escalation)

**Mô tả:** Customer tự gọi API staff (khóa user, khóa tài khoản, đọc audit log); auditor tự tay đổi dữ liệu; ai đó tự đăng ký thành operator/auditor/admin.

**Tác nhân:** Người dùng nội bộ hoặc kẻ chiếm được tài khoản customer, thử các endpoint không thuộc mình (horizontal + vertical escalation).

**Biện pháp đã làm:**
- 4 vai trò `customer < operator < auditor < admin` (F1); role nằm trong DB, kiểm tra mỗi request.
- Mọi endpoint nhạy cảm khai báo `@Roles()` + `@UseGuards(JwtAuthGuard, RolesGuard)`; RolesGuard đọc cả cấp method lẫn cấp class.
- Chỉ seed tạo operator/auditor; `POST /auth/register` luôn tạo `customer` — không ai tự nâng vai trò được.
- Auditor chỉ đọc: được tra cứu tài khoản (Issue #11, không có `balance`) nhưng bị chặn mọi API ghi.
- Dữ liệu người khác trả `404` thay vì `403` ở API customer (không tiết lộ sự tồn tại) — quy ước trong `docs/CLAUDE.md`.

**Bằng chứng:**
- `backend/test/roles.e2e-spec.ts` — "operator và auditor không được gọi API khóa user (chỉ admin)", "đăng ký mới vẫn chỉ tạo customer, không tự nâng vai trò được"
- `backend/test/audit.e2e-spec.ts` — "phân quyền API tra cứu: auditor đọc được, operator/customer bị 403"
- `backend/test/operator-accounts.e2e-spec.ts` — "phân quyền: operator và admin được, customer và auditor bị 403"
- Endpoint tra cứu staff (nhánh `feat/operator-account-lookup`, Issue #11): auditor 200 không có `balance`, customer 403
- Guard: `backend/src/auth/roles.guard.ts`

**Khoảng trống còn lại:** Chưa có kiểm thử tự động quét "mọi endpoint × mọi vai trò" — matrix 403 được kiểm thử thủ công theo từng endpoint khi thêm mới. Cân nhắc sinh test matrix từ Swagger sau khi các F6/F7 merge.

---

## 4. Nhân viên / kẻ xâm nhập DB sửa sổ cái, audit log

**Mô tả:** Người có quyền truy cập DB (nhân viên vận hành, thông tin đăng nhập DB rò rỉ từ backend) sửa hoặc xóa `ledger_entries`/`audit_logs` để che giấu giao dịch gian lận.

**Tác nhân:** Insider (người vận hành), hoặc kẻ chiếm được credential của `bank_app` — người dùng runtime của backend.

**Biện pháp đã làm:**
- **Tách user DB:** backend chạy bằng `bank_app` (role `banking_app`), owner `bank` chỉ dùng cho migration/seed/dọn test — credential app lộ cũng không sửa được những bảng bảo vệ.
- `banking_app` chỉ có `SELECT, INSERT` trên `ledger_entries` và `audit_logs`; `PUBLIC` bị `REVOKE ALL` — **không có quyền UPDATE/DELETE ngay từ tầng phân quyền**.
- Trigger `prevent_ledger_entry_mutation` / `prevent_audit_log_mutation` chặn UPDATE/DELETE/TRUNCATE **kể cả với owner**, trừ khi thành viên role `ledger_maintainer`/`audit_maintainer` bật `app.ledger_maintenance`/`app.audit_maintenance` trong transaction (cửa thoát có kiểm soát cho xử lý sự cố).
- Hàm trigger cố định `search_path` (pg_temp xếp cuối) chống search_path attack.
- Bảng `login_attempts` (F9) cũng append-only bằng GRANT (chỉ `SELECT, INSERT`).

**Bằng chứng:**
- Migration: `backend/src/database/migrations/1760500000002-RestrictLedgerMutation.ts`, `backend/src/database/migrations/1760600000002-CreateAuditLogs.ts`
- `backend/test/audit.e2e-spec.ts` — "bảo vệ DB: bank_app không có quyền UPDATE/DELETE, owner bị trigger chặn"
- Quy ước: `docs/database.md` (mục "Sổ cái chỉ thêm dòng", "Audit log chỉ thêm dòng", "User database")
- Kiểm tra tay: `docs/phase1/kiem-thu-phase-1.md` mục 6.3–6.5 (`UPDATE audit_logs` bằng `bank` bị trigger chặn; bằng `bank_app` lỗi permission denied)
- Ảnh chụp demo: mục "Kịch bản demo" bước 5 dưới đây

**Khoảng trống còn lại:** Owner `bank` vẫn là điểm tin cậy duy nhất có thể mở khóa trigger (theo thiết kế — cần cho dọn dữ liệu test). Chưa có log riêng cho việc bật `app.ledger_maintenance`/`app.audit_maintenance` — ai bật cửa thoát thì DB không ghi lại; cân nhắc event log Postgres (`log_statement`) trên môi trường thật.

---

## 5. Ghi đè lịch sử giao dịch / mất audit trail

**Mô tả:** Một lỗi ứng dụng (hoặc trục trặc hạ tầng) làm giao dịch ghi nửa vời: trừ tiền người gửi mà không cộng người nhận, hoặc thao tác đổi dữ liệu mà không để lại vết audit.

**Tác nhân:** Bug trong code nghiệp vụ, lỗi giữa chừng (crash, mất kết nối DB), hoặc race giữa hai request đồng thời.

**Biện pháp đã làm:**
- **Double-entry + trigger đối chứng lúc commit:** mỗi giao dịch transfer `completed` phải có đúng 1 dòng debit + 1 dòng credit, đúng số tiền, đúng tài khoản — sai thì cả transaction bị hủy (`EnforceTransferLedgerIntegrity`).
- **Audit log ghi trong cùng DB transaction** với thao tác: rollback thì log cũng rollback, không tồn tại "đổi dữ liệu mà không có log" hay "có log mà không có dữ liệu" (`AuditService.log(manager, ...)`).
- **Idempotency-Key** trên chuyển khoản: cùng key chỉ ghi một lần, gửi lại sau lỗi vẫn an toàn; lỗi ghi nào giữa chừng cũng rollback toàn bộ.
- Khóa dòng theo thứ tự (`FOR UPDATE`, `FOR KEY SHARE` theo thứ tự số tài khoản) chống deadlock khi hai chiều chuyển đồng thời.
- Giao dịch lỗi nghiệp vụ được lưu `failed` kèm `failureReason` (F4) — thất bại cũng để lại vết, không biến mất.

**Bằng chứng:**
- `backend/test/rollback.e2e-spec.ts` — 5 test rollback (lỗi lưu Transaction, IdempotencyKey, COMMIT, LedgerEntry) + "gửi lại cùng Idempotency-Key sau khi lỗi vẫn thành công"
- `backend/test/audit.e2e-spec.ts` — "luồng auth ghi đủ audit log", "bảo vệ DB..." (log không sửa được ở bảng 4)
- `backend/test/deadlock.e2e-spec.ts` — chuyển tiền đồng thời hai chiều không deadlock, tổng số dư vẫn 0
- `backend/test/operator-accounts.e2e-spec.ts` — "mọi thao tác khóa/mở đều để lại audit log đúng action và lý do"; "khóa lại tài khoản đang frozen: 200 idempotent, không ghi log trùng"
- Migration đối chứng sổ cái: `backend/src/database/migrations/1760500000000-EnforceTransferLedgerIntegrity.ts`

**Khoảng trống còn lại:** Đối soát toàn sổ (`SELECT sum(balance)`, so đếm 2 bút toán/giao dịch) hiện là kiểm tra tay trong `kiem-thu-phase-1.md` mục 6 — F7 (TV1, tuần 8) sẽ tự động hóa. Chưa có backup tự động + kiểm tra khôi phục cho môi trường thật (Hiếu — hạ tầng).

---

## Kịch bản demo "Bảo mật và audit" (tuần 9, luyện trước khi báo cáo)

Mỗi bước đều có audit log hiện ra để chứng minh truy vết. Chuẩn bị: backend chạy local (`npm run start:dev`), DB đã `db:reset`, Swagger mở ở `http://localhost:3000/api/docs`, một cửa sổ psql sẵn sàng (`docker compose exec db psql -U bank -d banking`).

| # | Hành động trên sân khấu | Điều khán giả thấy |
|---|---|---|
| 1 | Brute force: đăng nhập sai mật khẩu của một email 6 lần liên tiếp | 5 lần đầu `401 INVALID_CREDENTIALS`, lần 6 `429 RATE_LIMITED` kèm `retryAfter` (rate limit theo IP) |
| 2 | **Chờ ~60 giây hết block IP**, rồi đặt lại mật khẩu đúng, đăng nhập vào email vừa sai đủ 5 lần | `423 LOGIN_TEMPORARILY_LOCKED` dù mật khẩu ĐÚNG — khóa theo email vẫn giữ (F9). Chú ý: làm ngay sau bước 1 (chưa hết 60s) sẽ thấy `429` trước vì chặn theo IP thắng — đây không phải lỗi, giải thích cho khán giả hoặc tăng `RATE_LIMIT_LOGIN_PER_MIN` như các test e2e |
| 3 | psql: `SELECT action, metadata FROM audit_logs ORDER BY created_at DESC LIMIT 10;` | Chuỗi `auth_login_failed` × 5 → `auth_login_locked` → (khi hết khóa) `auth_login_success` — truy vết đầy đủ |
| 4 | Admin khóa user qua Swagger; user đó gọi `GET /api/auth/me` bằng token cũ | Token bị từ chối ngay `401 USER_LOCKED`; audit log có `user_locked` kèm actor là admin (rủi ro #2) |
| 5 | Operator khóa tài khoản ngân hàng kèm `reason`; user đó xem số dư rồi chuyển tiền | Vẫn đăng nhập và xem số dư được, nhưng chuyển đi/nhận vào đều `422 ...NOT_ACTIVE`; audit log có `account_frozen` kèm reason (F3) |
| 6 | Chống sửa log: `UPDATE audit_logs SET action='hack';` bằng user `bank_app`, rồi bằng owner `bank` | User app: lỗi `permission denied` ngay ở tầng phân quyền. Owner: trigger chặn `audit_logs are append-only` errcode `55000` (rủi ro #4) |
| 7 | Auditor truy vấn `GET /api/audit-logs?action=auth_login_locked&...` có bộ lọc; customer gọi cùng API | Auditor thấy log; customer nhận `403 FORBIDDEN` (rủi ro #3) |

Sau demo, chụp ảnh từng bước đưa vào slide báo cáo; tài liệu này là nguồn dẫn đường dẫn test để đối chiếu "demo nói gì — test chứng minh điều đó".

## Việc tiếp theo (rà soát lại sau tuần 9)

- ~~Cấu hình `trust proxy` cho Express sau Caddy~~ — **đã làm trong F9**: `app.setup.ts` bật `trust proxy = 1`, có test `X-Forwarded-For` chứng minh hai client khác nhau không dùng chung bucket.
- Thêm test matrix "mọi endpoint × mọi vai trò" sinh từ Swagger (rủi ro #3).
- Log việc bật `app.ledger_maintenance` / `app.audit_maintenance` ở môi trường thật (rủi ro #4).
- Backup tự động + diễn tập khôi phục (Hiếu — hạ tầng).
