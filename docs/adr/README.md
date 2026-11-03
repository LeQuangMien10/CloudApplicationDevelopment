# Architecture Decision Records

Mỗi quyết định kiến trúc quan trọng ghi thành một file `NNN-ten-quyet-dinh.md` theo mẫu dưới.

## Mẫu

```markdown
# ADR-NNN: <Tên quyết định>

- Trạng thái: Đề xuất | Đã chốt | Thay thế bởi ADR-xxx
- Ngày:

## Bối cảnh
Vấn đề cần quyết định, ràng buộc liên quan.

## Các phương án
1. ...
2. ...

## Quyết định
Chọn phương án nào.

## Lý do
Vì sao chọn.

## Đánh đổi
Mất gì, rủi ro gì.
```

## Danh sách

| ADR | Nội dung | Người viết | Tuần |
|---|---|---|---|
| 001 | Modular monolith hay microservices | TV1 | 6 |
| 002 | PostgreSQL hay NoSQL | TV1 | 6 |
| 003 | Chuyển tiền đồng bộ, việc nền bất đồng bộ | TV1 | 6 |
| 004 | Khóa bi quan hay khóa lạc quan khi chuyển tiền | TV1, TV3 | 6 |
| 005 | Sổ cái kép kèm cột số dư, bảo vệ sổ cái ở tầng DB | TV1, TV3 | 6 |
| 006 | Deploy: một máy EC2 chạy docker compose hay dịch vụ managed | TV5 | 6 |
| 007 | Hàng đợi bằng bảng outbox trong PostgreSQL hay Redis, Kafka | TV3 | 8 |
| 008 | Phát hiện bất thường bằng luật kết hợp Isolation Forest, không dùng LLM | TV1 | 11 |

Đặt tên file `NNN-ten-ngan.md`, ví dụ `001-modular-monolith.md`. Quyết định thay đổi thì viết ADR mới, ADR cũ đổi trạng thái thành "Thay thế bởi ADR-xxx".
