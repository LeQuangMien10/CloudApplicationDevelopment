# Digital Banking Simulator: Kế hoạch và phân công công việc

## 1. Các phase triển khai

| Phase | Nội dung | Thời gian |
|---|---|---|
| **Phase 1** | Xây base app theo đề *Simple Banking App*: đăng ký, đăng nhập, xem số dư, chuyển khoản nội bộ, lịch sử giao dịch, đăng xuất | 13/10 đến **24/10** |
| **Phase Cloud** | Đưa base app lên cloud: Docker, CI/CD, deploy. Chạy song song với Phase 1 và tiếp tục trong Phase 2 | Bắt đầu cùng Phase 1 |
| **Phase 2** | Các yêu cầu nâng cao còn lại để hoàn thiện sản phẩm | Chốt trong buổi họp 25/10 |

### Phase 1: base app (hạn 24/10)

- Lịch dự kiến:
  - **13/10 đến 14/10:** cả nhóm chốt ERD, API contract trên Swagger, quy ước Git.
  - **15/10 đến 19/10:** làm song song theo phân công. Frontend dùng dữ liệu giả theo API contract.
  - **20/10 đến 22/10:** frontend nối API thật, viết test, sửa lỗi.
  - **23/10 đến 24/10:** demo nội bộ, deploy bản Phase 1 lên cloud.
- Phase 1 làm sẵn các nền móng sau để Phase 2 chỉ cần mở rộng:
  - Schema có bảng `ledger_entries`, trạng thái giao dịch, trạng thái tài khoản.
  - Chuyển tiền dùng DB transaction và khóa `SELECT ... FOR UPDATE`.
  - Chống bấm trùng bằng Idempotency-Key (đề gốc mục 3.4).
- **Tiêu chí hoàn thành Phase 1:**
  - [ ] 6 tính năng core chạy đúng
  - [ ] Có test chứng minh chuyển tiền lỗi thì rollback
  - [ ] Chạy được bằng một lệnh `docker compose up`
  - [ ] Có seed data, Swagger, README, `.env.example`
  - [ ] CI báo thành công
  - [ ] Đã deploy được lên cloud

### Phase Cloud

- Chạy song song từ tuần đầu. Không đợi Phase 1 xong mới đóng gói.
- Phase 1: Dockerfile, docker-compose, CI, chọn cloud, cảnh báo ngân sách, deploy bản đầu tiên.
- Phase 2: hạ tầng bằng Terraform, tự động deploy, giám sát, backup.

### Phase 2: hoàn thiện sản phẩm (chốt trong buổi họp 25/10)

Đề xuất chia theo thứ tự ưu tiên:

- **2A, bắt buộc theo đề môn:** sổ cái và audit hoàn chỉnh, trạng thái giao dịch, đối soát, luật phát hiện bất thường, test chuyển tiền đồng thời.
- **2B, làm nếu kịp:** refresh token, OTP, hạn mức giao dịch, hoàn tiền.
- **2C, AI/ML:** mô hình phát hiện giao dịch bất thường.
- **Vận hành:** giám sát, load test, demo lỗi và khôi phục.

## 2. Phân công Phase 1

| Thành viên | Vai trò | Nhiệm vụ |
|---|---|---|
| **TV1: Miền** | Trưởng nhóm backend | Khởi tạo repo NestJS và cấu trúc module (Auth, User, Account, Transaction). Cấu hình TypeORM, migration, schema có cả `ledger_entries`. Seed script. Định dạng lỗi chung. Swagger, README, `.env.example`. Review PR |
| **TV2: Châu Anh** | Backend xác thực | Đăng ký: hash bcrypt, tự tạo tài khoản ngân hàng. Đăng nhập: JWT. JwtGuard, RolesGuard, validate DTO, không trả `password_hash`, CORS. API admin: xem danh sách user, khóa và mở. Sequence diagram đăng nhập |
| **TV3: Nhật** | Backend chuyển tiền | `GET /accounts/me`. `POST /transactions/transfer` gồm: một DB transaction, khóa theo thứ tự id, kiểm tra số tiền và tài khoản, Idempotency-Key. `GET /transactions` có phân trang. Test rollback và test chuyển tiền đồng thời. Sequence diagram chuyển khoản |
| **TV4: Tú** | Frontend | React + Vite, chặn trang khi chưa đăng nhập, Axios gắn JWT. Các trang: Login/Register, Dashboard, Chuyển khoản (sinh key và khóa nút khi đang gửi), Lịch sử. Chọn thư viện quản lý state và ghi lý do |
| **TV5: Hiếu** | Cloud và DevOps | Dockerfile, docker-compose, endpoint `/health`. GitHub Actions chạy lint, test, build. Chọn cloud, tạo tài khoản, đặt cảnh báo ngân sách. Deploy bản đầu tiên lên cloud |

**Lưu ý:**

- Mỗi người tự viết unit test cho phần của mình.
- Phần của Nhật nặng nhất. Miền hỗ trợ viết test đồng thời sau khi dựng xong repo khung.
- Quy ước Git:
  - Mỗi tính năng làm trên một nhánh riêng.
  - Merge vào `main` qua PR, cần ít nhất 1 người review và CI báo thành công.
- Ai đổi schema database hoặc API phải báo Miền để cập nhật Swagger.

## 3. Lịch họp

- **21h00, Chủ nhật 25/10:**
  - Rà soát tiêu chí hoàn thành Phase 1.
  - Chốt phạm vi và phân công Phase 2.
