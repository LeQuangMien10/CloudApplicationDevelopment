# ADR-004: Khóa bi quan khi chuyển tiền

- Trạng thái: Đã chốt
- Ngày: 23/10/2026
- Người viết: TV1, TV3

## Bối cảnh

Nhiều lệnh chuyển có thể cùng lúc đụng một tài khoản, nhất là tài khoản nhận nhiều tiền. Nếu hai lệnh cùng đọc số dư rồi cùng trừ, số dư có thể sai hoặc âm. Hai lệnh chuyển chéo A→B và B→A có thể gây deadlock.

## Các phương án

1. **Khóa bi quan:** `SELECT ... FOR UPDATE` hai tài khoản trong transaction, khóa theo thứ tự cố định.
2. **Khóa lạc quan:** cột `version`, cập nhật kèm điều kiện version, xung đột thì thử lại.
3. **Mức cô lập SERIALIZABLE:** để PostgreSQL phát hiện xung đột, client thử lại khi lỗi.

## Quyết định

Chọn phương án 1. **Khóa theo thứ tự số tài khoản tăng dần**, để mọi lệnh khóa hai tài khoản theo cùng một thứ tự và không thể chờ vòng tròn.

Bản thiết kế ban đầu ghi "khóa theo thứ tự id". Khi làm, TV3 dùng thứ tự số tài khoản, vì request chuyển tiền chỉ gửi số tài khoản đích, không gửi id. Cả hai đều là thứ tự cố định nên đều tránh được deadlock.

## Lý do

- Tranh chấp cao ở tài khoản nóng thì khóa lạc quan phải thử lại nhiều lần, có thể chậm hơn và phức tạp hơn khóa bi quan.
- SERIALIZABLE đúng nhưng mọi xung đột đều thành lỗi phải thử lại, khó dự đoán độ trễ.
- Khóa bi quan dễ hiểu, dễ kiểm chứng. Số dư còn được cập nhật bằng SQL (`balance = balance - :amount`) và có CHECK không âm trong DB làm lớp bảo vệ thứ hai.

**Đã kiểm chứng:**
- `test/deadlock.e2e-spec.ts`: 5 vòng, mỗi vòng 10 lệnh A→B và 10 lệnh B→A chạy đồng thời. Không deadlock, số dư về đúng.
- Thử tay 40 lệnh chuyển chéo đồng thời giữa 2 tài khoản: số dư đúng, không âm, tổng tiền không đổi.

## Đánh đổi

- Các lệnh vào cùng một tài khoản phải xếp hàng chờ nhau. Throughput tối đa của một tài khoản nóng bị giới hạn. Sẽ đo trong load test tuần 10.
- Giữ khóa trong suốt transaction, nên transaction phải ngắn: không gọi dịch vụ ngoài trong lúc giữ khóa.
- Nếu dư thời gian: làm thêm bản khóa lạc quan để so sánh throughput trên cùng kịch bản.
