# SRS: yêu cầu phần mềm

Các con số là mục tiêu thiết kế, kiểm chứng theo cột "Cách kiểm chứng". Lý giải từng con số ở mục 5. Yêu cầu chức năng ở [FRS](../frs/README.md).

## 1. Yêu cầu phi chức năng

| Nhóm | Yêu cầu | Cách kiểm chứng |
|---|---|---|
| **Nhất quán** | Tổng tiền toàn hệ thống không đổi, không có số dư âm ở tài khoản thường | `SELECT sum(balance) FROM accounts` luôn bằng 0. CHECK trong DB. Test đồng thời. Đối soát hằng ngày |
| **Chống trùng** | Gửi lại cùng một yêu cầu chỉ tạo đúng một giao dịch | Header `Idempotency-Key`, test e2e gửi trùng |
| **Bảo mật** | JWT, phân quyền theo vai trò, khách A không xem được dữ liệu của khách B, rate limit, HTTPS, mã hóa DB | Test phân quyền, test truy cập chéo trả 404. Rate limit, HTTPS, mã hóa: tuần 6 đến 9 |
| **Bất biến** | Sổ cái và audit log chỉ thêm dòng | Trigger và phân quyền DB, test e2e thử sửa, xóa |
| **Truy vết** | Mỗi request có `requestId`, xuất hiện trong response, log và audit log | Header `X-Request-Id` |
| **Hiệu năng** | 95% lệnh chuyển tiền xong dưới 300 ms, đọc dưới 200 ms, ở mức tải 5× giờ cao điểm, tức 60 request/giây | Load test k6 tuần 10 |
| **Sẵn sàng** | 99,5% thời gian mỗi tháng | Uptime check, tuần 10 |
| **Khôi phục** | Mất tối đa 1 giờ dữ liệu, khôi phục trong 30 phút | Diễn tập khôi phục, tuần 9 |
| **Chi phí** | Dưới 30 USD mỗi tháng khi chạy demo | Cảnh báo ngân sách, báo cáo chi phí tuần 12 |

## 2. Tình huống lỗi đề bắt buộc

| Tình huống | Cách xử lý | Bằng chứng |
|---|---|---|
| Trừ tiền xong nhưng cộng tiền lỗi | Trừ và cộng nằm chung một DB transaction, lỗi thì rollback cả hai | `backend/test/rollback.e2e-spec.ts` |
| Client timeout rồi gửi lại | Server thấy key đã xử lý thì trả lại kết quả cũ | `backend/test/transfer.e2e-spec.ts` |
| Service chết giữa giao dịch | Transaction chưa commit thì PostgreSQL tự rollback. Job quét giao dịch treo (TV1): giao dịch `processing` quá 15 phút mà chưa có sổ cái thì chuyển `failed`, đã có sổ cái thì báo kiểm tra tay. Đối soát (F7) phát hiện mọi lệch còn sót | `backend/test/stuck-transactions.e2e-spec.ts`, `reconciliation.e2e-spec.ts`. Kịch bản kill container tuần 10 |
| Hai lệnh chuyển cùng lúc trên một tài khoản | Khóa dòng bằng `SELECT ... FOR UPDATE` theo thứ tự cố định | `backend/test/deadlock.e2e-spec.ts` |

## 3. Ràng buộc kỹ thuật

- Tiền dùng `numeric(18,2)`, truyền qua API dạng chuỗi, cộng trừ bằng SQL. Không dùng số thực.
- Lỗi có chung định dạng `{ code, message, requestId, details? }`.
- Schema chỉ đổi qua migration, `synchronize` luôn tắt.
- Backend chạy bằng user DB `bank_app`, chỉ migration mới dùng owner `bank`.
- Secret không nằm trong repo.

## 4. Giao diện với bên ngoài

| Giao diện | Tài liệu |
|---|---|
| REST API, tiền tố `/api`, Swagger tại `/api/docs` | [api.md](../api.md) |
| Database | [database.md](../database.md) |
| Hệ thống bên ngoài | Không có hệ thống ngân hàng bên ngoài, chuyển tiền chỉ trong nội bộ. Các dịch vụ phụ trợ (email, chấm điểm rủi ro, DNS, chứng chỉ) xem [kien-truc.md](../overview/kien-truc.md), mục 5 |

## 5. Truy vết NFR: cơ chế, metric, demo

Mỗi NFR được đảm bảo bằng cơ chế nào trong kiến trúc, đo bằng metric nào, kiểm chứng ra sao và thể hiện ở demo nào. Cột "Bằng chứng" là file test hoặc cấu hình trong repo. Sơ đồ các thành phần nhắc tới ở đây xem [kien-truc.md](../overview/kien-truc.md).

| NFR | Mục tiêu | Kiến trúc đảm bảo bằng | Metric | Cách đo, simulate | Demo bắt buộc | Bằng chứng | Tình trạng |
|---|---|---|---|---|---|---|---|
| **Nhất quán** | Tổng số dư bằng 0, không số dư âm ở tài khoản thường, lỗi giữa chừng không làm mất hay sinh tiền | Trừ, cộng, sổ cái trong **một DB transaction**. Khóa dòng theo thứ tự số tài khoản. Sổ cái kép. CHECK số dư không âm. Trigger hoãn tới lúc commit kiểm tra sổ cái cân. Đối soát hằng ngày | Số báo cáo đối soát `mismatch` (mục tiêu 0). Số deadlock, lấy từ cột `deadlocks` của `pg_stat_database`, so trước và sau load test (mục tiêu 0) | Giả lập lỗi ở từng bước của chuyển tiền. Chạy song song nhiều lệnh chuyển chéo. Đối soát sau mỗi lần load test | Concurrent transfer, Failure / recovery | `rollback.e2e-spec.ts`, `deadlock.e2e-spec.ts`, `reconciliation.e2e-spec.ts` | Đã chứng minh bằng test với lỗi ở các bước lưu giao dịch, sổ cái, idempotency, outbox, commit. Còn thiếu test làm lỗi đúng lệnh cộng tiền và bước ghi audit log |
| **Chống trùng** | Gửi lại cùng một yêu cầu chỉ tạo một giao dịch | Idempotency-Key lưu trong DB, giữ chỗ bằng `INSERT ... ON CONFLICT DO NOTHING` trong cùng transaction, so hash nội dung | Số giao dịch và số lần trừ tiền thêm khi gửi lại cùng key (mục tiêu 0) | Gửi lại cùng key. Gửi lại sau lỗi `422`, sau lỗi `500`. Cùng key khác nội dung. Gửi đồng thời 2 request cùng key, cả khi thành công và khi lỗi `422` | Duplicate request | `transfer.e2e-spec.ts` test 2, 3, 11, 20, 22, 23; `rollback.e2e-spec.ts` test 4 | Đã chứng minh |
| **Phân quyền** | Khách A không đọc, không thao tác được dữ liệu của khách B. 4 vai trò tách quyền | Token ngắn hạn. Mỗi request kiểm tra trạng thái user. Guard theo vai trò. Kiểm tra chủ sở hữu ở tầng nghiệp vụ, trả `404` thay vì `403` | Tỷ lệ request trái quyền bị chặn (mục tiêu 100%) | Gọi chéo tài khoản, sai vai trò, dùng token của user đã bị khóa | Security & audit review | `roles.e2e-spec.ts`, `transfer.e2e-spec.ts` test 5, `operator-accounts.e2e-spec.ts` | Đã chứng minh. Rate limit, khóa đăng nhập sai nhiều lần: tuần 9 |
| **Bất biến, truy vết** | Sổ cái và audit log không sửa, xóa được. Mọi thao tác quan trọng có log. Mỗi request có `requestId` | Trigger và quyền DB: user của app chỉ `SELECT`, `INSERT`. Audit log ghi trong transaction của thao tác. `requestId` có trong response, log và audit log | Số lần sửa, xóa bị từ chối. Tỷ lệ thao tác quan trọng có audit log | Thử `UPDATE`, `DELETE` bằng user của app. Tra audit log theo `requestId` | Security & audit review | `transfer.e2e-spec.ts` test 1b, `audit.e2e-spec.ts` | Đã chứng minh |
| **Mã hóa** | In transit và at rest | HTTPS kết thúc tại reverse proxy. DB và các service nội bộ không mở ra Internet. Mã hóa ổ đĩa của máy chủ | Chỉ cổng 80, 443 mở ra Internet. Ổ đĩa có mã hóa | Quét cổng từ bên ngoài. Kiểm tra chứng chỉ. Xem cấu hình ổ đĩa | Security & audit review | `infra/Caddyfile`, `docker-compose.yml` | In transit xong. **At rest chưa có:** bật mã hóa EBS, tuần 9 |
| **Hiệu năng** | 95% lệnh chuyển tiền dưới 300 ms, đọc dưới 200 ms, ở 60 request/giây | API stateless. Chuyển tiền chỉ khóa 2 dòng tài khoản. Việc nặng (chấm điểm, email, đối soát) chạy nền, không nằm trong request | p95, p99 latency. Throughput. Error rate. Thời gian chờ khóa | Load test 1×, 5×, 10× giờ cao điểm. Thêm kịch bản nhiều người cùng chuyển vào một tài khoản | Load test with latency / error metrics | Tuần 10 | Chưa đo |
| **Sẵn sàng** | 99,5% thời gian mỗi tháng | Container tự khởi động lại khi chết. Health check có kiểm tra DB. Deploy tự động. Luồng nền lỗi (worker, email, chấm điểm) không làm ngừng chuyển tiền | Uptime theo health check. Tỷ lệ lỗi 5xx | Uptime check mỗi phút. Kill từng container | Failure / recovery | `/api/health`, `restart: unless-stopped` trong `docker-compose.yml` | Cơ chế có. Đo tuần 10 |
| **Khôi phục** | Mất tối đa 1 giờ dữ liệu, khôi phục trong 30 phút | Backup DB định kỳ ra ngoài máy chủ. Diễn tập khôi phục. Job quét giao dịch treo | Thời gian khôi phục đo được. Lượng dữ liệu mất | Xóa DB rồi khôi phục từ backup. Kill backend giữa lúc chuyển tiền | Failure / recovery | `stuck-transactions.e2e-spec.ts` | Backup, diễn tập: tuần 9 |
| **Quan sát được** | Biết hệ thống có khỏe không, lỗi ở đâu, từ lúc nào trong 5 phút | Health check. `requestId` xuyên suốt. Dashboard 4 golden signals | Latency, traffic, errors, saturation | Xem dashboard trong lúc load test và kill container | Load test | Tuần 10 | Chưa có dashboard |
| **Chi phí** | Dưới 30 USD mỗi tháng khi chạy demo | Một máy chủ chạy toàn bộ, không dùng dịch vụ managed đắt tiền. Tắt máy khi không dùng | Chi phí tháng. Chi phí trên 1.000 giao dịch | Cảnh báo ngân sách. Báo cáo chi phí của nhà cung cấp cloud | | Tuần 12 | Cảnh báo ngân sách chưa bật |

### Các con số lấy từ đâu

- **60 request/giây** là 5 lần mức cao điểm 12 request/giây ước tính ở [BRD](../brd/README.md), mục 4.
- **p95 300 ms cho chuyển tiền:** chia ngân sách thời gian (latency budget) cho từng thành phần. Đây là ước tính để định hướng, số thật lấy từ load test tuần 10.

  | Thành phần | Ngân sách |
  |---|---|
  | Reverse proxy, web server | 10 ms |
  | Xác thực token, đọc trạng thái user | 20 ms |
  | Khóa 2 tài khoản, ghi số dư, giao dịch, sổ cái, audit log, commit | 150 ms |
  | Dự phòng, bao gồm chờ khóa khi tài khoản nóng | 120 ms |

- **99,5%** tương đương khoảng 3,6 giờ ngừng mỗi tháng (30 ngày × 24 giờ × 0,5%). Với một máy chủ, rủi ro chính là máy hỏng và downtime ngắn khi deploy. Khôi phục trong 30 phút thì vẫn chịu được vài sự cố mỗi tháng.
  - Lên 99,9% (khoảng 43 phút mỗi tháng) cần ít nhất 2 máy sau load balancer và database có bản dự phòng ở zone khác.
  - Chi phí khi đó vượt ngân sách, nên chưa chọn. Đánh đổi này ghi ở [ADR 006](../adr/006-deploy-ec2-docker-compose.md).
- **Mất tối đa 1 giờ dữ liệu, khôi phục 30 phút:** backup mỗi giờ, nên mất tối đa dữ liệu của 1 giờ. Khôi phục gồm dựng máy mới từ hướng dẫn hoặc IaC, rồi nạp backup. Thời gian thật lấy từ buổi diễn tập tuần 9.
- **30 USD mỗi tháng:** chủ yếu là chi phí một máy 2 GB RAM, ổ đĩa và IP tĩnh khi chạy liên tục. Cần kiểm lại bằng công cụ tính giá của AWS khi làm báo cáo chi phí tuần 12.
