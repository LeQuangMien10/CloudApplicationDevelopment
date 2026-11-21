# Tổng quan dự án

**Digital Banking Simulator** là bài tập lớn Project 4 của môn Phát triển ứng dụng điện toán đám mây: backend ngân hàng số mô phỏng cho các thao tác tài khoản và chuyển tiền nội bộ. Chỉ mô phỏng, không có giao dịch tài chính thật.

**Trọng tâm:** tiền không được sai, không bị trừ hai lần, phân quyền chặt, mọi thao tác truy vết được.

| Thành phần | Công nghệ | Tình trạng |
|---|---|---|
| Backend | NestJS 12, TypeORM | Chạy được |
| Database | PostgreSQL 16 | Chạy được |
| Frontend | React, Vite | Chạy được, màn hình Operator, Auditor tuần 8 |
| Đóng gói, CI | Docker, GitHub Actions | Xong |
| Cloud | AWS EC2, Caddy HTTPS | Đã deploy, tự động deploy đang làm |
| Worker, phát hiện bất thường | Cùng codebase backend | Tuần 8 |

- Kiến trúc chi tiết theo khung System Architecture: [kien-truc.md](kien-truc.md)
- NFR nối với cơ chế, metric và demo: [SRS, mục 5](../srs/README.md#5-truy-vết-nfr-cơ-chế-metric-demo)
- Cách chạy trên máy: [README gốc](../../README.md)
- Toàn bộ tài liệu: [docs/README.md](../README.md)
