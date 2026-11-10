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

| ADR | Nội dung | Trạng thái | Người viết |
|---|---|---|---|
| [001](001-modular-monolith.md) | Modular monolith thay vì microservices | Đã chốt | TV1 |
| [002](002-postgresql.md) | PostgreSQL làm database chính | Đã chốt | TV1 |
| [003](003-dong-bo-va-bat-dong-bo.md) | Chuyển tiền đồng bộ, việc nền bất đồng bộ | Đã chốt | TV1 |
| [004](004-khoa-bi-quan.md) | Khóa bi quan khi chuyển tiền | Đã chốt | TV1, TV3 |
| [005](005-so-cai-kep.md) | Sổ cái kép kèm cột số dư, bảo vệ ở tầng DB | Đã chốt | TV1, TV3 |
| [006](006-deploy-ec2-docker-compose.md) | Deploy lên một máy EC2 chạy docker compose | Chờ TV5 bổ sung | TV1, TV5 |
| [007](007-outbox-postgresql.md) | Hàng đợi bằng bảng outbox trong PostgreSQL | Chờ TV3 bổ sung | TV1, TV3 |
| 008 | Phát hiện bất thường bằng luật kết hợp Isolation Forest, không dùng LLM | Viết ở tuần 11 | TV1 |

Đặt tên file `NNN-ten-ngan.md`. Quyết định thay đổi thì viết ADR mới, ADR cũ đổi trạng thái thành "Thay thế bởi ADR-xxx".
