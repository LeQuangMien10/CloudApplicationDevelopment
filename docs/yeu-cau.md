# Yêu cầu hệ thống

Bản chốt yêu cầu của nhóm, trình bày theo Cloud Architecture Canvas (bài 1). Thay cho file docx "Chốt yêu cầu và thiết kế" dùng ở giai đoạn đầu. Các con số đánh dấu **(cần chốt)** là đề xuất, nhóm thống nhất rồi bỏ đánh dấu.

## 1. Bài toán

Ngân hàng số mô phỏng cần một backend cho khách hàng quản lý tài khoản và chuyển tiền nội bộ **an toàn, chính xác tuyệt đối và truy vết được**. Sai số dư hoặc trừ tiền hai lần gây thiệt hại tài chính và mất niềm tin.

- **Sản phẩm:** MVP hướng production, chạy trên cloud, có CI/CD, bảo mật, giám sát và tính chi phí.
- **Trọng tâm:** tiền không được sai, không bị trừ hai lần, phân quyền chặt, mọi thao tác truy vết được.
- **Ngoài phạm vi:** giao dịch tài chính thật, chuyển liên ngân hàng, đa tiền tệ, ứng dụng mobile.

## 2. Người dùng

| Vai trò | Được làm |
|---|---|
| **Customer** | Đăng ký, đăng nhập, xem số dư, chuyển tiền, xem lịch sử của chính mình |
| **Operator** | Khóa, mở tài khoản ngân hàng; nạp tiền mô phỏng; xử lý giao dịch bị gắn cờ |
| **Auditor** | Chỉ đọc: audit log, báo cáo đối soát, giao dịch |
| **Admin** | Quản lý user (khóa, mở), toàn quyền xem |

Bảng phân quyền chi tiết theo từng API: [phan-cong-cong-viec.md](phan-cong-cong-viec.md), mục 5.

## 3. Yêu cầu chức năng (7 use case của đề)

| UC | Nội dung | Phase | Tình trạng |
|---|---|---|---|
| UC1 | **Quản lý khách hàng và tài khoản:** đăng ký, đăng nhập, mỗi khách tự có 1 tài khoản VND. Trạng thái tài khoản `active`, `frozen`, `closed`, chỉ `active` mới giao dịch. Operator nạp tiền mô phỏng | 1, 2 | Đăng ký, đăng nhập xong. Khóa tài khoản: PR F3. Nạp tiền mô phỏng: **(cần chốt người làm)** |
| UC2 | **Xem số dư:** chỉ xem tài khoản của mình | 1 | Xong |
| UC3 | **Chuyển tiền nội bộ** theo số tài khoản đích. Số tiền lớn hơn 0, tối đa 2 chữ số thập phân, không vượt số dư, không chuyển cho chính mình, đích tồn tại và `active`. Trừ, cộng, ghi giao dịch trong một DB transaction | 1 | Xong |
| UC4 | **Lịch sử giao dịch:** tiền vào, tiền ra, phân trang, lọc theo thời gian | 1 | Xong |
| UC5 | **Trạng thái giao dịch:** `processing`, `completed`, `failed`. Giao dịch lỗi vẫn được lưu kèm lý do | 1, 2 | `completed` xong. Lưu `failed`: F4 tuần 7 |
| UC6 | **Audit trail:** ai làm gì, lúc nào, từ đâu. Không ai sửa, xóa được | 2 | PR F2 |
| UC7 | **Phát hiện giao dịch đáng ngờ:** gắn cờ cho Operator xem xét, không tự động chặn | 2 | F6 tuần 8, AI tuần 11 |

Làm thêm nếu còn thời gian: hạn mức theo ngày. Refresh token, OTP, hoàn tiền chỉ làm khi dư thời gian.

## 4. Yêu cầu phi chức năng

| Nhóm | Yêu cầu | Cách kiểm chứng |
|---|---|---|
| **Nhất quán** | Tổng tiền toàn hệ thống không đổi, không có số dư âm ở tài khoản thường | `SELECT sum(balance) FROM accounts` luôn bằng 0. Ràng buộc CHECK trong DB. Test đồng thời |
| **Chống trùng** | Gửi lại cùng một yêu cầu chỉ tạo đúng một giao dịch | Header `Idempotency-Key`, test e2e gửi trùng |
| **Bảo mật** | JWT, phân quyền theo vai trò, khách A không xem được dữ liệu của khách B, rate limit đăng nhập và chuyển tiền, HTTPS, mã hóa DB | Test phân quyền, test truy cập chéo trả 404 |
| **Bất biến** | Sổ cái và audit log chỉ thêm dòng | Trigger và phân quyền DB, test e2e thử sửa, xóa |
| **Truy vết** | Mỗi request có `requestId`, xuất hiện trong response, log và audit log | Header `X-Request-Id` |
| **Hiệu năng** | 95% lệnh chuyển tiền xong dưới 300 ms, xem số dư và lịch sử dưới 200 ms, ở mức tải 5× giờ cao điểm **(cần chốt)** | Load test k6 tuần 10 |
| **Sẵn sàng** | 99,5% thời gian mỗi tháng **(cần chốt)**. Chạy một máy, không có dự phòng nhiều zone | Uptime check, tuần 10 |
| **Khôi phục** | Mất tối đa 1 giờ dữ liệu (RPO), khôi phục trong 30 phút (RTO) **(cần chốt)** | Backup DB mỗi giờ, diễn tập khôi phục tuần 9 |
| **Chi phí** | Dưới 30 USD mỗi tháng khi chạy demo, tắt khi không dùng **(cần chốt)** | Cảnh báo ngân sách AWS, báo cáo chi phí tuần 12 |

## 5. Workload

Số giả định, dùng để chọn kiến trúc và đặt mức load test:

| Chỉ số | Giá trị |
|---|---|
| Khách hàng đăng ký | 50.000 |
| Khách hoạt động mỗi ngày | 5.000 |
| Request mỗi ngày | Khoảng 50.000 (10 request mỗi khách), trong đó khoảng 10.000 lệnh chuyển tiền |
| Trung bình | Khoảng 0,6 request/giây |
| Giờ cao điểm (×20, ngày lương, cuối tháng) | Khoảng 12 request/giây |
| Mức load test | 1× = 12, 5× = 60, 10× = 120 request/giây |

**Tính chất:** OLTP, đọc nhiều (số dư, lịch sử) nhưng ghi phải tuyệt đối đúng (chuyển tiền). Khối lượng nhỏ.
**Điểm nóng:** nhiều người cùng chuyển vào một tài khoản (ví dụ tài khoản cửa hàng) gây tranh chấp khóa. Đây là kịch bản của test đồng thời.

## 6. Tình huống lỗi đề bắt buộc

| Tình huống | Cách xử lý | Bằng chứng |
|---|---|---|
| Trừ tiền xong nhưng cộng tiền lỗi | Trừ và cộng nằm chung một DB transaction, lỗi thì rollback cả hai | `test/rollback.e2e-spec.ts`: giả lập lỗi ở 4 điểm |
| Client timeout rồi gửi lại | Client gửi kèm `Idempotency-Key`, server thấy key đã xử lý thì trả lại kết quả cũ | `test/transfer.e2e-spec.ts` case 2, 3 |
| Service chết giữa giao dịch | Transaction chưa commit thì PostgreSQL tự rollback. Giao dịch kẹt ở `processing` được job định kỳ chuyển sang `failed` **(cần chốt người làm)** | Kịch bản kill container tuần 10 |
| Hai lệnh chuyển cùng lúc trên một tài khoản | Khóa dòng tài khoản bằng `SELECT ... FOR UPDATE`, khóa theo thứ tự cố định để tránh deadlock | `test/deadlock.e2e-spec.ts`: 100 lệnh chuyển chéo, không deadlock |

## 7. Canvas tóm tắt

| Ô | Nội dung |
|---|---|
| Business | Chuyển tiền nội bộ an toàn, đúng tuyệt đối, truy vết được |
| Users | Customer, Operator, Auditor, Admin |
| Requirements | 7 use case ở mục 3 |
| NFR | Nhất quán, chống trùng, bảo mật, bất biến, truy vết. Số đo ở mục 4 |
| Workload | Cao điểm khoảng 12 request/giây, đọc nhiều, ghi phải đúng |
| Data | PostgreSQL: tài khoản, giao dịch, sổ cái kép, audit log ([database.md](database.md)) |
| Architecture | Modular monolith và worker chạy nền ([kien-truc.md](kien-truc.md), ADR 001, 003) |
| Cloud | AWS, một máy EC2 chạy docker compose ở giai đoạn này (ADR 006) |
| Security | JWT, phân quyền 4 vai trò, sổ cái và audit log bảo vệ ở tầng DB, HTTPS |
| Cost | Dưới 30 USD mỗi tháng khi demo **(cần chốt)** |
