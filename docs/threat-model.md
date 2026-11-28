# Threat model: Digital Banking Simulator

Phụ trách: TV2 Châu Anh (F10 Phase 2), Hiếu bổ sung bằng chứng hạ tầng. Cập nhật: 28/11/2026.

**Phạm vi:** backend API, database PostgreSQL 16 và quy trình vận hành liên quan. Frontend chỉ là nơi gọi API, nên mọi biện pháp bảo mật đặt ở backend và database. Mô hình triển khai tham chiếu: một máy EC2 chạy Docker Compose, Caddy làm reverse proxy HTTPS ([ADR 006](adr/006-deploy-ec2-docker-compose.md)). Sơ đồ các thành phần: [kien-truc.md](overview/kien-truc.md).

**Cách làm** theo Bài 3: Asset → Threat → Attack surface → Risk → Control. Bảng tổng hợp ở mục 0 chọn ra 5 rủi ro quan trọng nhất. Mỗi rủi ro sau đó trình bày theo khung: **Mô tả, Tác nhân, Biện pháp đã làm, Bằng chứng, Khoảng trống còn lại**. Bằng chứng là đường dẫn file và tên test đang chạy trong CI; ảnh chụp demo nằm ở mục "Kịch bản demo" cuối tài liệu.

Bằng chứng của rủi ro 1 (F9) và của API tra cứu tài khoản cho staff (Issue #11) có trên `main` sau khi #17, #18 merge. Merge hai PR đó trước khi dùng tài liệu này làm bằng chứng chính thức.

---

## 0. Bảng tổng hợp 5 rủi ro chính

Mức rủi ro = khả năng xảy ra × mức tác động, mỗi thứ chia Thấp, Trung bình, Cao. Cột "Còn lại" là mức sau khi đã có biện pháp.

| # | Asset | Threat | Attack surface | Khả năng | Tác động | Control chính | Còn lại |
|---|---|---|---|---|---|---|---|
| 1 | Tài khoản khách hàng | Đoán mật khẩu hàng loạt, credential stuffing | `POST /api/auth/login`, công khai | Cao | Cao | bcrypt cost 12, rate limit theo IP, khóa đăng nhập theo email, thông báo lỗi không phân biệt | Thấp |
| 2 | Phiên đăng nhập | Token bị đánh cắp rồi dùng tiếp | Mọi API cần token, `localStorage` ở frontend | Trung bình | Cao | Token 15 phút, mỗi request kiểm tra trạng thái và vai trò trong DB | Trung bình |
| 3 | Chức năng của staff | Vượt quyền: customer gọi API staff, auditor sửa dữ liệu, tự nâng vai trò | API `/operator`, `/admin`, `/audit-logs`, `/reconciliation` | Trung bình | Cao | Guard theo vai trò ở mọi endpoint nhạy cảm, đăng ký luôn tạo customer, dữ liệu người khác trả `404` | Thấp |
| 4 | Sổ cái, audit log | Người có quyền vào DB sửa, xóa để che gian lận | Kết nối database, credential của ứng dụng | Thấp | Cao | User DB của ứng dụng chỉ `SELECT`, `INSERT`; trigger chặn sửa, xóa kể cả owner | Thấp |
| 5 | Số dư, lịch sử giao dịch | Ghi nửa chừng, mất vết audit khi có lỗi hoặc chạy đồng thời | Luồng chuyển tiền | Trung bình | Cao | Một DB transaction, sổ cái kép kiểm tra lúc commit, Idempotency-Key, audit log cùng transaction, đối soát hằng ngày | Thấp |

---

## 1. Brute force, credential stuffing

**Mô tả:** kẻ tấn công đoán mật khẩu hàng loạt trên `POST /api/auth/login`, hoặc dùng danh sách mật khẩu bị rò rỉ để thử từng email.

**Tác nhân:** bất kỳ ai truy cập được API, vì endpoint công khai. Tần suất cao, tự động.

**Biện pháp đã làm:**
- Mật khẩu băm bằng bcrypt cost 12 (`BCRYPT_COST` trong `backend/src/auth/auth.service.ts`). Mỗi lần đoán tốn khoảng vài trăm mili giây CPU, và không giải ngược được.
- Rate limit đăng nhập **5 lần mỗi phút theo IP** bằng `@nestjs/throttler` (`LoginThrottlerGuard`). Ngưỡng chỉnh qua `RATE_LIMIT_LOGIN_PER_MIN`, không phải sửa code.
- Backend lấy IP client thật khi đứng sau 2 lớp proxy (Caddy rồi nginx) nhờ `trust proxy` 2 lớp trong `backend/src/app.setup.ts`, chỉnh bằng `TRUST_PROXY_HOPS`. Nếu tin sai số lớp, mọi người dùng bị tính chung IP của proxy.
- Khóa đăng nhập khi **sai 5 lần trong 15 phút theo email** (bảng `login_attempts`, trả `423 LOGIN_TEMPORARILY_LOCKED` kèm `retryAfter`). Cách này chặn được cả khi kẻ tấn công đổi IP. Kiểm tra khóa chạy **trước** bcrypt để không tốn CPU của server. Đăng nhập thành công giữa chừng đưa bộ đếm về 0, nên người dùng thật không bị khóa mãi.
- Lỗi đăng nhập không phân biệt sai email hay sai mật khẩu (`INVALID_CREDENTIALS`), và luôn so khớp với một hash giả khi email không tồn tại, để chống dò email và timing attack.
- Mỗi lần bị khóa ghi audit log `auth_login_locked`, làm bằng chứng điều tra sau sự cố.

**Bằng chứng:**
- `backend/test/login-ip-rate-limit.e2e-spec.ts`:
  - "lần thứ 6 trong một phút từ cùng IP -> 429 RATE_LIMITED kèm details.retryAfter"
  - "client đến từ X-Forwarded-For khác nhau (sau reverse proxy) không bị trừ vào chung một bucket"
  - "đi qua Caddy rồi nginx: hai client khác nhau có chung IP proxy cuối vẫn tách bucket"
- `backend/test/login-lockout.e2e-spec.ts`, 4 test:
  - khóa sau 5 lần sai, đúng mật khẩu vẫn `423`
  - dòng cũ ngoài cửa sổ 15 phút không bị đếm
  - thành công giữa chừng đưa bộ đếm về 0
  - đã khóa thì đúng hay sai mật khẩu đều `423`, không lộ mật khẩu đúng
- `backend/test/audit.e2e-spec.ts`: "audit log không chứa mật khẩu dù đăng nhập sai nhiều lần".
- Mức bcrypt: `BCRYPT_COST = 12` trong `backend/src/auth/auth.service.ts`.

**Khoảng trống còn lại:**
- Chưa có WAF hay CAPTCHA cho lưu lượng phân tán từ nhiều IP.
- Bộ đếm của throttler nằm trong bộ nhớ, restart container là mất. Chấp nhận được với một máy chủ. Nếu chạy nhiều máy thì cần nơi lưu chung, ví dụ Redis.
- Kiểm tra khóa theo email không khóa transaction: hai request sai gửi đồng thời có thể cùng đọc một giá trị đếm trước khi dòng mới được ghi (TOCTOU). Phần vượt ngưỡng này nhỏ, vì rate limit theo IP vẫn giới hạn 5 lần mỗi phút. Chấp nhận.
- Bảng `login_attempts` chưa có job dọn. Truy vấn luôn giới hạn trong 15 phút nên không chậm đi, nhưng bảng tăng mãi. Cần chính sách giữ dữ liệu khi chạy thật.

---

## 2. Token bị đánh cắp rồi dùng tiếp

**Mô tả:** kẻ tấn công lấy được JWT của nạn nhân (máy nhiễm mã độc, log lộ token, rò rỉ `localStorage`) rồi dùng token đó gọi API như nạn nhân.

**Tác nhân:** người có token hợp lệ nhưng không phải chủ token; hoặc chính chủ tài khoản đã bị khóa, cần chặn ngay.

**Biện pháp đã làm:**
- Token ngắn hạn `JWT_EXPIRES_IN=15m`: token có rò rỉ thì cũng chỉ dùng được tối đa 15 phút.
- **Mỗi request**, `JwtStrategy.validate()` đọc lại `users.status` trong DB. User bị khóa thì token cấp trước đó cũng bị từ chối ngay (`401 USER_LOCKED`). Khóa tài khoản là thu hồi token tức thì, không cần danh sách đen.
- Vai trò cũng đọc từ DB ở mỗi request, không tin vào thông tin trong token. Hạ quyền có hiệu lực ngay.
- Secret JWT nằm trong biến môi trường, không commit. File `.env` bị ignore, repo chỉ có `.env.example`.

**Bằng chứng:**
- Kiểm tra trạng thái mỗi request: `backend/src/auth/jwt.strategy.ts`, hàm `validate`.
- `backend/test/app.e2e-spec.ts`: "admin khóa rồi mở lại user; user bị khóa không đăng nhập được", token cũ bị từ chối.
- `backend/test/audit.e2e-spec.ts`: "admin khóa/mở user ghi USER_LOCKED, USER_UNLOCKED kèm actor là admin".

**Khoảng trống còn lại:**
- Chưa thu hồi được từng token riêng lẻ (đăng xuất mọi thiết bị). Hiện chỉ thu hồi bằng cách khóa cả user.
- Token để trong `localStorage` ở frontend, dễ bị XSS đọc hơn cookie `HttpOnly`. Ghi nhận, đánh giá lại khi làm giai đoạn giám sát.

---

## 3. Vượt quyền (privilege escalation)

**Mô tả:** customer tự gọi API của staff (khóa user, khóa tài khoản, đọc audit log); auditor tự sửa dữ liệu; ai đó tự đăng ký thành operator, auditor hay admin.

**Tác nhân:** người dùng nội bộ, hoặc kẻ đã chiếm được tài khoản customer, thử gọi các endpoint không thuộc quyền của mình.

**Biện pháp đã làm:**
- 4 vai trò tách quyền (F1): customer, operator, auditor, admin. Đây không phải cấp bậc: auditor chỉ đọc, không có quyền ghi của operator. Vai trò nằm trong DB và được kiểm tra ở mỗi request.
- Mọi endpoint nhạy cảm khai báo `@Roles()` kèm `@UseGuards(JwtAuthGuard, RolesGuard)`. `RolesGuard` đọc khai báo ở cả method lẫn class.
- Chỉ seed tạo được operator, auditor. `POST /auth/register` luôn tạo `customer`, nên không ai tự nâng vai trò được.
- Auditor chỉ đọc: được tra cứu tài khoản (Issue #11, không có `balance`) và xem báo cáo đối soát, nhưng bị chặn mọi API ghi.
- Ở API của customer, dữ liệu của người khác trả `404` thay vì `403`, để không lộ là dữ liệu đó có tồn tại. Quy ước ghi trong `docs/Claude.md`.

**Bằng chứng:**
- `backend/test/roles.e2e-spec.ts`: "operator và auditor không được gọi API khóa user (chỉ admin)", "đăng ký mới vẫn chỉ tạo customer, không tự nâng vai trò được".
- `backend/test/audit.e2e-spec.ts`: "phân quyền API tra cứu: auditor đọc được, operator/customer bị 403".
- `backend/test/operator-accounts.e2e-spec.ts`: "phân quyền: operator và admin được, customer và auditor bị 403".
- `backend/test/operator-account-lookup.e2e-spec.ts` (Issue #11): auditor nhận `200` nhưng không có `balance`, customer bị `403`.
- `backend/test/reconciliation.e2e-spec.ts`: customer, operator không xem được báo cáo; auditor xem được nhưng không chạy được đối soát.
- Guard: `backend/src/auth/roles.guard.ts`.

**Khoảng trống còn lại:** chưa có test tự động quét toàn bộ "mọi endpoint × mọi vai trò". Hiện mỗi endpoint mới tự viết test phân quyền của mình. Có thể sinh bảng test này từ Swagger khi các API của F6 xong.

---

## 4. Người vào được DB sửa sổ cái, audit log

**Mô tả:** người có quyền truy cập database (nhân viên vận hành, hoặc ai đó lấy được thông tin đăng nhập DB của backend) sửa hoặc xóa `ledger_entries`, `audit_logs` để che giấu giao dịch gian lận.

**Tác nhân:** người trong nội bộ vận hành, hoặc kẻ chiếm được credential của `bank_app`, user database mà backend dùng khi chạy.

**Biện pháp đã làm:**
- **Tách user DB:** backend chạy bằng `bank_app` (role `banking_app`). Owner `bank` chỉ dùng cho migration, seed và dọn dữ liệu test. Lộ credential của ứng dụng cũng không sửa được các bảng được bảo vệ.
- `banking_app` chỉ có `SELECT`, `INSERT` trên `ledger_entries`, `audit_logs`, `reconciliation_reports`, `login_attempts`. `PUBLIC` bị `REVOKE ALL`. Như vậy **không có quyền `UPDATE`, `DELETE` ngay từ tầng phân quyền**.
- Trigger `prevent_ledger_entry_mutation`, `prevent_audit_log_mutation` chặn `UPDATE`, `DELETE`, `TRUNCATE` **kể cả với owner**. Ngoại lệ duy nhất: thành viên của role `ledger_maintainer` hoặc `audit_maintainer` bật `app.ledger_maintenance` hoặc `app.audit_maintenance` trong transaction. Đây là lối thoát có kiểm soát để xử lý sự cố.
- Hàm trigger cố định `search_path` (pg_temp xếp cuối) để chống tấn công qua `search_path`.
- Đối soát hằng ngày (F7) phát hiện số dư bị sửa thẳng trong DB mà không qua sổ cái, kể cả khi tổng số dư vẫn bằng 0.

**Bằng chứng:**
- Migration: `backend/src/database/migrations/1760500000002-RestrictLedgerMutation.ts`, `1760600000002-CreateAuditLogs.ts`.
- `backend/test/audit.e2e-spec.ts`: "bảo vệ DB: bank_app không có quyền UPDATE/DELETE, owner bị trigger chặn".
- `backend/test/transfer.e2e-spec.ts` test 1b: sổ cái chỉ cho `INSERT`.
- `backend/test/reconciliation.e2e-spec.ts` test 2, 3: phát hiện số dư bị sửa thẳng; test 7: ứng dụng không sửa, xóa được báo cáo đối soát.
- Quy ước: `docs/database.md`, các mục "Sổ cái chỉ thêm dòng", "Audit log chỉ thêm dòng", "User database".
- Kiểm tra tay: `docs/phase1/kiem-thu-phase-1.md` mục 6.3 đến 6.5.

**Khoảng trống còn lại:**
- Owner `bank` vẫn là điểm tin cậy duy nhất có thể mở khóa trigger. Đây là thiết kế có chủ đích, vì cần cho dọn dữ liệu test.
- DB chưa ghi lại ai bật `app.ledger_maintenance` hay `app.audit_maintenance`. Khi chạy thật nên bật log câu lệnh của PostgreSQL (`log_statement`).

---

## 5. Ghi nửa chừng, mất vết audit

**Mô tả:** lỗi ứng dụng hoặc sự cố hạ tầng làm giao dịch ghi nửa chừng: trừ tiền người gửi mà không cộng cho người nhận, hoặc dữ liệu bị đổi mà không để lại vết audit.

**Tác nhân:** lỗi trong code nghiệp vụ, lỗi giữa chừng (crash, mất kết nối DB), hoặc hai request chạy đồng thời.

**Biện pháp đã làm:**
- **Sổ cái kép, kiểm tra lúc commit:** mỗi chuyển khoản `completed` phải có đúng 1 dòng debit và 1 dòng credit, đúng số tiền, đúng tài khoản. Sai thì cả transaction bị hủy (`EnforceTransferLedgerIntegrity`).
- **Audit log ghi trong cùng DB transaction** với thao tác (`AuditService.log(manager, ...)`). Rollback thì log cũng rollback, nên không có chuyện đổi dữ liệu mà không có log, hay có log mà không có dữ liệu.
- **Idempotency-Key** cho chuyển khoản: cùng key chỉ ghi một lần, gửi lại sau lỗi vẫn an toàn, kể cả khi hai request cùng key đến đồng thời.
- Khóa dòng `SELECT ... FOR UPDATE` theo thứ tự số tài khoản, để hai lệnh chuyển ngược chiều nhau không deadlock.
- Giao dịch lỗi nghiệp vụ được lưu thành `failed` kèm `failureReason` (F4). Thất bại cũng để lại vết.
- Đối soát hằng ngày (F7) kiểm tra số dư với sổ cái, tổng số dư bằng 0, và sổ cái của từng giao dịch. Job quét giao dịch treo xử lý giao dịch kẹt ở `processing`.

**Bằng chứng:**
- `backend/test/rollback.e2e-spec.ts`, 7 test rollback với lỗi ở từng bước: trừ, cộng (test 7, đúng tình huống "trừ xong nhưng cộng lỗi"), lưu giao dịch, sổ cái, idempotency, audit log (test 8), outbox, commit. Test 4: gửi lại cùng Idempotency-Key sau khi lỗi vẫn thành công.
- `backend/test/transfer.e2e-spec.ts` test 22, 23: hai request cùng key gửi đồng thời chỉ tạo một giao dịch.
- `backend/test/deadlock.e2e-spec.ts`: chuyển tiền đồng thời hai chiều không deadlock, tổng số dư vẫn bằng 0.
- `backend/test/operator-accounts.e2e-spec.ts`: "mọi thao tác khóa/mở đều để lại audit log đúng action và lý do", "khóa lại tài khoản đang frozen: 200 idempotent, không ghi log trùng".
- `backend/test/reconciliation.e2e-spec.ts`, `backend/test/stuck-transactions.e2e-spec.ts`: đối soát và quét giao dịch treo.
- Migration kiểm tra sổ cái: `backend/src/database/migrations/1760500000000-EnforceTransferLedgerIntegrity.ts`.

**Khoảng trống còn lại:** đối soát và quét giao dịch treo đã có, nhưng chưa được gắn lịch chạy tự động cho tới khi worker (F5) xong. Chưa có backup tự động và diễn tập khôi phục (Hiếu, tuần 9).

---

## Kịch bản demo "Security & audit review"

Mỗi bước đều có audit log để chứng minh truy vết. Chuẩn bị: backend chạy local (`npm run start:dev`, đặt `TRUST_PROXY_HOPS=0` vì không có proxy phía trước), DB đã `db:reset`, Swagger mở ở `http://localhost:3000/api/docs`, một cửa sổ psql sẵn sàng (`docker compose exec db psql -U bank -d banking`).

| # | Hành động | Điều người xem thấy |
|---|---|---|
| 1 | Brute force: đăng nhập sai mật khẩu của một email 6 lần liên tiếp | 5 lần đầu `401 INVALID_CREDENTIALS`, lần 6 `429 RATE_LIMITED` kèm `retryAfter` (rate limit theo IP) |
| 2 | **Chờ khoảng 60 giây** cho hết chặn theo IP, rồi đăng nhập bằng mật khẩu đúng vào email vừa sai đủ 5 lần | `423 LOGIN_TEMPORARILY_LOCKED` dù mật khẩu đúng, vì khóa theo email vẫn còn (F9). Làm ngay sau bước 1 thì sẽ thấy `429` trước, do chặn theo IP được kiểm tra trước. Đây không phải lỗi; có thể giải thích, hoặc tăng `RATE_LIMIT_LOGIN_PER_MIN` như các test e2e |
| 3 | psql: `SELECT action, metadata FROM audit_logs ORDER BY created_at DESC LIMIT 10;` | Chuỗi `auth_login_failed` × 5, rồi `auth_login_locked`, và `auth_login_success` khi hết khóa |
| 4 | Admin khóa user qua Swagger; user đó gọi `GET /api/auth/me` bằng token cũ | Token bị từ chối ngay `401 USER_LOCKED`; audit log có `user_locked` với actor là admin (rủi ro 2) |
| 5 | Operator khóa tài khoản ngân hàng kèm `reason`; chủ tài khoản xem số dư rồi chuyển tiền | Vẫn đăng nhập và xem số dư được, nhưng chuyển đi hay nhận vào đều `422 ...NOT_ACTIVE`; audit log có `account_frozen` kèm lý do (F3) |
| 6 | Chống sửa log: `UPDATE audit_logs SET action='hack';` bằng user `bank_app`, rồi bằng owner `bank` | User của ứng dụng: lỗi `permission denied` ngay ở tầng phân quyền. Owner: trigger chặn `audit_logs are append-only`, mã lỗi `55000` (rủi ro 4) |
| 7 | Auditor gọi `GET /api/audit-logs?action=auth_login_locked`; customer gọi cùng API | Auditor thấy log; customer nhận `403 FORBIDDEN` (rủi ro 3) |

Sau demo, chụp ảnh từng bước để đưa vào slide báo cáo. Tài liệu này dùng để đối chiếu: demo cho thấy điều gì, test nào chứng minh điều đó.

## Việc tiếp theo

- Thêm bảng test "mọi endpoint × mọi vai trò" sinh từ Swagger (rủi ro 3).
- Ghi log việc bật `app.ledger_maintenance`, `app.audit_maintenance` khi chạy thật (rủi ro 4).
- Backup tự động và diễn tập khôi phục (Hiếu, hạ tầng).
- Gắn lịch chạy đối soát và quét giao dịch treo vào worker (F5).
