# BRD: yêu cầu nghiệp vụ

## 1. Bài toán

Ngân hàng số mô phỏng cần một backend cho khách hàng quản lý tài khoản và chuyển tiền nội bộ **an toàn, chính xác tuyệt đối và truy vết được**. Sai số dư hoặc trừ tiền hai lần gây thiệt hại tài chính và mất niềm tin.

## 2. Mục tiêu

| Mục tiêu | Thể hiện bằng |
|---|---|
| Tiền không sai | Tổng tiền toàn hệ thống không đổi, không có số dư âm ở tài khoản thường |
| Không trừ hai lần | Gửi lại cùng một yêu cầu chỉ tạo một giao dịch |
| Phân quyền chặt | Khách A không xem được dữ liệu của khách B |
| Truy vết được | Mọi thao tác quan trọng có nhật ký, không ai sửa được |
| Vận hành được | Chạy trên cloud, có CI/CD, giám sát, tính chi phí |

## 3. Người dùng

| Vai trò | Nhu cầu |
|---|---|
| **Customer** | Đăng ký, xem số dư, chuyển tiền, xem lịch sử của chính mình |
| **Operator** | Khóa, mở tài khoản ngân hàng; nạp tiền mô phỏng; xử lý giao dịch bị gắn cờ |
| **Auditor** | Chỉ đọc: audit log, báo cáo đối soát, giao dịch |
| **Admin** | Quản lý user, toàn quyền xem |

## 4. Quy mô dự kiến

Số giả định, dùng để chọn kiến trúc và đặt mức load test:

| Chỉ số | Giá trị |
|---|---|
| Khách hàng đăng ký | 50.000 |
| Khách hoạt động mỗi ngày | 5.000 |
| Request mỗi ngày | Khoảng 50.000 (10 request mỗi khách), trong đó khoảng 10.000 lệnh chuyển tiền |
| Trung bình | Khoảng 0,6 request/giây |
| Giờ cao điểm (×20, ngày lương, cuối tháng) | Khoảng 12 request/giây |

Đặc điểm: đọc nhiều (số dư, lịch sử) nhưng ghi phải tuyệt đối đúng. Điểm nóng là nhiều người cùng chuyển vào một tài khoản.

## 5. Phạm vi

**Trong phạm vi:** 7 use case của đề, đặc tả ở [FRS](../frs/README.md).

**Ngoài phạm vi:** giao dịch tài chính thật, chuyển liên ngân hàng, đa tiền tệ, ứng dụng mobile.

**Làm thêm nếu còn thời gian:** hạn mức theo ngày, refresh token, OTP, hoàn tiền.

## 6. Canvas tóm tắt

| Ô | Nội dung |
|---|---|
| Business | Chuyển tiền nội bộ an toàn, đúng tuyệt đối, truy vết được |
| Users | Customer, Operator, Auditor, Admin |
| Requirements | 7 use case ([FRS](../frs/README.md)) |
| NFR | Nhất quán, chống trùng, bảo mật, bất biến, truy vết ([SRS](../srs/README.md)) |
| Workload | Cao điểm khoảng 12 request/giây |
| Data | PostgreSQL: tài khoản, giao dịch, sổ cái kép, audit log ([database.md](../database.md)) |
| Architecture | Modular monolith và worker chạy nền ([kien-truc.md](../overview/kien-truc.md), ADR 001, 003) |
| Cloud | AWS, một máy EC2 chạy docker compose ở giai đoạn này (ADR 006) |
| Security | JWT, phân quyền 4 vai trò, sổ cái và audit log bảo vệ ở tầng DB, HTTPS |
| Cost | Dưới 30 USD mỗi tháng khi demo **(cần chốt)** |
