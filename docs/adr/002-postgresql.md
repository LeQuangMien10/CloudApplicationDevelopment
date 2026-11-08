# ADR-002: PostgreSQL làm database chính

- Trạng thái: Đã chốt
- Ngày: 13/10/2026
- Người viết: TV1

## Bối cảnh

Dữ liệu là tài khoản, giao dịch, sổ cái: có quan hệ chặt và cần nhất quán mạnh. Cần khóa dòng khi chuyển tiền đồng thời, kiểu số chính xác cho tiền, ràng buộc ở tầng DB làm lớp bảo vệ cuối.

## Các phương án

1. **PostgreSQL**
2. **MySQL**
3. **MongoDB**
4. **DynamoDB**

## Quyết định

Chọn PostgreSQL 16.

## Lý do

- Transaction ACID, `SELECT ... FOR UPDATE`, kiểu `numeric(18,2)` cho tiền.
- **Ràng buộc và trigger ở tầng DB:** CHECK số dư không âm, số tiền lớn hơn 0, khóa chính cho Idempotency-Key, trigger chặn sửa, xóa sổ cái và audit log, phân quyền từng bảng cho user của backend. Nhờ đó dù code có lỗi, dữ liệu sai vẫn bị DB từ chối.
- Có `jsonb` cho response idempotency và metadata audit, không cần thêm DB khác.
- Có bản managed trên mọi cloud (AWS RDS, GCP Cloud SQL) khi cần nâng cấp.
- MySQL cũng đáp ứng phần lớn nhưng nhóm quen PostgreSQL hơn, và constraint trigger kiểm tra lúc commit (ADR 005) chỉ có ở PostgreSQL. MongoDB và DynamoDB không hợp với dữ liệu quan hệ chặt và giao dịch nhiều dòng.

## Đánh đổi

- Scale ngang khó hơn NoSQL. Chấp nhận được với tải dự kiến. Khi đọc nhiều có thể thêm read replica cho lịch sử, nhưng **không đọc số dư từ replica** vì số dư cần nhất quán mạnh.
- Logic nằm một phần trong trigger SQL, khó đọc hơn code. Mỗi trigger có test e2e và ghi chú trong [database.md](../database.md).
