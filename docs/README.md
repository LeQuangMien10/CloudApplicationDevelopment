# Tài liệu dự án

Toàn bộ tài liệu là **bản đang hoàn thiện**, sửa cùng code qua Pull Request. Phần `phase0`, `phase1` được viết lại sau khi đã làm, để tổng kết.

```
docs/
  overview/     tổng quan, kiến trúc
  docker/       đóng gói và chạy bằng Docker
  brd/          yêu cầu nghiệp vụ
  srs/          yêu cầu phần mềm, chỉ tiêu đo được
  frs/          đặc tả chức năng từng use case
  plan/         kế hoạch 10 tuần, phân công
  adr/          các quyết định kiến trúc
  Claude.md     hướng dẫn cho Claude Code
  Agent.md      quy trình làm việc cho AI agent
  phase0/       khởi tạo dự án
  phase1/       ứng dụng nền
  phase2/       tính năng nâng cao
  phase-cloud/  đưa lên cloud, chạy song song
  api.md, database.md, sequence-*.md
```

Mỗi thư mục phase có `spec.md` (cần làm gì), `design.md` (thiết kế kỹ thuật), `task.md` (việc và tình trạng).

| Tài liệu | Trả lời câu hỏi | Tình trạng |
|---|---|---|
| [overview/](overview/README.md) | Dự án là gì, ghép từ những phần nào | Đã có |
| [docker/](docker/README.md) | Chạy hệ thống bằng Docker thế nào | Đã có, phần frontend đang làm |
| [brd/](brd/README.md) | Vì sao làm, cho ai, phạm vi đến đâu | Đã có |
| [srs/](srs/README.md) | Hệ thống phải đạt chỉ tiêu gì | Bản nháp, còn số cần chốt |
| [frs/](frs/README.md) | Từng chức năng chạy thế nào, lỗi gì | Đã có |
| [plan/](plan/README.md) | Ai làm gì, khi nào | Đã có |
| [adr/](adr/README.md) | Vì sao chọn cách này | 001 đến 005 đã có, 006 và 007 bản nháp |
| [api.md](api.md), [database.md](database.md) | API và dữ liệu | Đã có |
| [sequence đăng nhập](sequence-dang-nhap.md), [sequence chuyển khoản](sequence-chuyen-tien.md) | Luồng xử lý từng bước | Đã có |
| [Claude.md](Claude.md), [Agent.md](Agent.md) | AI làm việc trong repo thế nào | Đã có |
| [phase0/](phase0/spec.md), [phase1/](phase1/spec.md) | Đã làm gì, ra sao | Tổng kết lại |
| [phase2/](phase2/spec.md), [phase-cloud/](phase-cloud/spec.md) | Sắp làm gì | Đang làm |
