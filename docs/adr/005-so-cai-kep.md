# ADR-005: Sổ cái kép kèm cột số dư, bảo vệ ở tầng DB

- Trạng thái: Đã chốt
- Ngày: 13/10/2026, bổ sung phần bảo vệ ở tầng DB ngày 01/11/2026
- Người viết: TV1, TV3

## Bối cảnh

Cần biết số dư hiện tại nhanh, đồng thời phải chứng minh được số dư đến từ đâu và lịch sử không bị sửa.

## Các phương án

1. **Chỉ cột `balance`:** cập nhật trực tiếp, lịch sử lấy từ bảng giao dịch.
2. **Chỉ sổ cái:** số dư tính bằng tổng các dòng sổ cái mỗi lần đọc.
3. **Sổ cái kép kèm cột `balance`:** mỗi giao dịch ghi 1 dòng debit và 1 dòng credit vào `ledger_entries`, đồng thời cập nhật `balance` trong cùng transaction.

## Quyết định

Chọn phương án 3. Thêm tài khoản quỹ `000000000000` (được phép âm) làm nguồn của tiền nạp, nên **tổng số dư mọi tài khoản luôn bằng 0**.

Bảo vệ sổ cái ở tầng DB:
- Trigger chặn `UPDATE`, `DELETE`, `TRUNCATE` trên `ledger_entries`.
- Trigger kiểm tra lúc commit: giao dịch `completed` phải có đúng 1 debit và 1 credit cân nhau, đúng tài khoản.
- Backend chạy bằng user `bank_app` chỉ có quyền `SELECT`, `INSERT` trên sổ cái. User owner `bank` chỉ dùng cho migration.

## Lý do

- Phương án 1 không chứng minh được số dư đúng, không đối soát được.
- Phương án 2 đọc số dư chậm dần khi sổ cái lớn, và việc khóa khi chuyển tiền phức tạp hơn.
- Phương án 3 đọc số dư nhanh, sổ cái là nguồn để đối soát (F7): số dư phải bằng tổng credit trừ tổng debit.
- Bảo vệ ở tầng DB nghĩa là dù code có lỗi hoặc lộ mật khẩu DB của backend, sổ cái vẫn không sửa, xóa được.

## Đánh đổi

- Hai nguồn số liệu có thể lệch nếu có lỗi. Đối soát định kỳ (F7) để phát hiện.
- Mỗi lệnh chuyển ghi thêm 2 dòng, DB lớn nhanh hơn. Không đáng kể ở quy mô dự án.
- Thêm bước vận hành: phải chạy `npm run db:app-user`, và mỗi migration tạo bảng mới phải tự `GRANT` cho `banking_app`.
- `bank_app` vẫn cập nhật được `accounts.balance` (cần cho chuyển tiền). Đối soát là lớp phát hiện cho trường hợp này.
