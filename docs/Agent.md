# Quy trình cho AI agent

Áp dụng cho mọi AI agent làm việc trong repo. Quy ước kỹ thuật: [Claude.md](Claude.md).

## Trước khi làm

1. Đọc `spec.md`, `design.md`, `task.md` của phase đang làm.
2. Tra [api.md](api.md), [database.md](database.md) và ADR liên quan. Không tự đổi một quyết định đã có ADR, nếu cần đổi thì viết ADR mới.
3. Xác định module đang sửa thuộc ai ở [phân công](plan/phan-cong-cong-viec.md). Sửa module của người khác thì ghi rõ trong PR để người đó review.

## Khi làm

- Mỗi việc một nhánh `feat/<việc>` hoặc `fix/<việc>`, tách từ `main` mới nhất.
- Mỗi PR một việc, nên dưới khoảng 400 dòng.
- Commit theo Conventional Commits, viết tiếng Việt.
- Không tự mở rộng phạm vi ngoài việc được giao.
- Đổi API hoặc schema thì sửa `docs/api.md`, `docs/database.md` trong cùng PR.

## Trước khi mở PR

```bash
npm run lint && npm test && npm run build
npm run test:e2e
```

- Mọi lệnh phải đạt. Có migration thì chạy thử cả lên và revert.
- Thay đổi logic có test mới. Thêm bước vào kịch bản kiểm thử khi có tính năng mới.
- Báo đúng kết quả đã chạy. Bước nào chưa chạy thì ghi là chưa chạy.
- Cập nhật tình trạng trong `task.md`.

## Cần con người xác nhận

Merge PR, đổi ruleset, deploy, thao tác trên dữ liệu thật, xóa nhánh hoặc dữ liệu.
