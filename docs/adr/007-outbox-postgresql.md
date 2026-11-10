# ADR-007: Hàng đợi bằng bảng outbox trong PostgreSQL

- Trạng thái: Đã chốt trong họp 03/11/2026, **TV3 rà soát khi làm F5**
- Ngày: 03/11/2026
- Người viết: TV1 viết bản nháp, TV3 hoàn thiện

## Bối cảnh

Chuyển tiền thành công cần báo cho worker để chạy luật phát hiện bất thường (ADR 003). Sự kiện không được mất khi backend chết ngay sau commit, và worker xử lý trùng không được tạo cảnh báo trùng. Bản thiết kế đầu chọn Redis và BullMQ.

## Các phương án

1. **Redis và BullMQ:** đẩy job sau khi commit.
2. **Bảng outbox trong PostgreSQL:** ghi sự kiện vào `outbox_events` trong cùng transaction với chuyển tiền, worker đọc bằng `SELECT ... FOR UPDATE SKIP LOCKED`.
3. **Kafka hoặc SQS.**

## Quyết định

Chọn phương án 2.

## Lý do

- Sự kiện ghi cùng transaction với chuyển tiền: commit thì có sự kiện, rollback thì không. Với phương án 1, backend chết giữa lúc commit và lúc đẩy job thì mất sự kiện, nên vẫn phải có outbox.
- Không thêm thành phần nào để vận hành, backup, giám sát.
- Tải nhỏ (khoảng 10.000 giao dịch mỗi ngày), PostgreSQL thừa sức.

## Đánh đổi

- Worker phải hỏi DB định kỳ, cảnh báo trễ vài giây. Chấp nhận được (ADR 003).
- Bảng outbox lớn dần, cần dọn các sự kiện đã xử lý.
- Rate limit (F9) không dùng Redis được nữa, phải đếm trong bộ nhớ backend. Đúng khi chạy một bản backend; nếu chạy nhiều bản thì phải cân nhắc lại.
