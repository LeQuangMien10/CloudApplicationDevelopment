# SRS: yêu cầu phần mềm

Các số đánh dấu **(cần chốt)** là đề xuất, nhóm thống nhất rồi bỏ đánh dấu. Yêu cầu chức năng ở [FRS](../frs/README.md).

## 1. Yêu cầu phi chức năng

| Nhóm | Yêu cầu | Cách kiểm chứng |
|---|---|---|
| **Nhất quán** | Tổng tiền toàn hệ thống không đổi, không có số dư âm ở tài khoản thường | `SELECT sum(balance) FROM accounts` luôn bằng 0. CHECK trong DB. Test đồng thời |
| **Chống trùng** | Gửi lại cùng một yêu cầu chỉ tạo đúng một giao dịch | Header `Idempotency-Key`, test e2e gửi trùng |
| **Bảo mật** | JWT, phân quyền theo vai trò, khách A không xem được dữ liệu của khách B, rate limit, HTTPS, mã hóa DB | Test phân quyền, test truy cập chéo trả 404. Rate limit, HTTPS, mã hóa: tuần 6 đến 9 |
| **Bất biến** | Sổ cái và audit log chỉ thêm dòng | Trigger và phân quyền DB, test e2e thử sửa, xóa |
| **Truy vết** | Mỗi request có `requestId`, xuất hiện trong response, log và audit log | Header `X-Request-Id` |
| **Hiệu năng** | 95% lệnh chuyển tiền xong dưới 300 ms, đọc dưới 200 ms, ở mức tải 5× giờ cao điểm, tức 60 request/giây **(cần chốt)** | Load test k6 tuần 10 |
| **Sẵn sàng** | 99,5% thời gian mỗi tháng **(cần chốt)** | Uptime check, tuần 10 |
| **Khôi phục** | Mất tối đa 1 giờ dữ liệu, khôi phục trong 30 phút **(cần chốt)** | Diễn tập khôi phục, tuần 9 |
| **Chi phí** | Dưới 30 USD mỗi tháng khi chạy demo **(cần chốt)** | Cảnh báo ngân sách, báo cáo chi phí tuần 12 |

## 2. Tình huống lỗi đề bắt buộc

| Tình huống | Cách xử lý | Bằng chứng |
|---|---|---|
| Trừ tiền xong nhưng cộng tiền lỗi | Trừ và cộng nằm chung một DB transaction, lỗi thì rollback cả hai | `backend/test/rollback.e2e-spec.ts` |
| Client timeout rồi gửi lại | Server thấy key đã xử lý thì trả lại kết quả cũ | `backend/test/transfer.e2e-spec.ts` |
| Service chết giữa giao dịch | Transaction chưa commit thì PostgreSQL tự rollback. Job quét giao dịch treo **(cần chốt người làm)** | Kịch bản kill container tuần 10 |
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
| Hệ thống bên ngoài | Không có. Chuyển tiền chỉ trong nội bộ |
