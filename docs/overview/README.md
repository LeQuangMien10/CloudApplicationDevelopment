# Tổng quan dự án

**Digital Banking Simulator** là bài tập lớn Project 4 của môn Phát triển ứng dụng điện toán đám mây: backend ngân hàng số mô phỏng cho các thao tác tài khoản và chuyển tiền nội bộ. Chỉ mô phỏng, không có giao dịch tài chính thật.

**Trọng tâm:** tiền không được sai, không bị trừ hai lần, phân quyền chặt, mọi thao tác truy vết được.

| Thành phần | Công nghệ | Tình trạng |
|---|---|---|
| Backend | NestJS 12, TypeORM | Chạy được |
| Database | PostgreSQL 16 | Chạy được |
| Frontend | React, Vite | Đang hoàn thiện |
| Đóng gói, CI | Docker, GitHub Actions | Backend xong, frontend đang làm |
| Cloud | AWS EC2 | Chưa deploy |
| Worker, phát hiện bất thường | Cùng codebase backend | Tuần 8 |

- Kiến trúc chi tiết: [kien-truc.md](kien-truc.md)
- Cách chạy trên máy: [README gốc](../../README.md)
- Toàn bộ tài liệu: [docs/README.md](../README.md)
