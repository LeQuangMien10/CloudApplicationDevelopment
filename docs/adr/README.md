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

## Dự kiến

| ADR | Nội dung |
|---|---|
| 001 | Modular monolith hay microservices |
| 002 | PostgreSQL hay NoSQL |
| 003 | Chuyển tiền đồng bộ, việc nền bất đồng bộ |
| 004 | Khóa bi quan hay khóa lạc quan khi chuyển tiền |
| 005 | Sổ cái kép kèm cột số dư |
