# Infra

Phụ trách: **TV5 Hiếu**. Thư mục đang trống.

## Việc Phase 1

- `backend/Dockerfile`, `frontend/Dockerfile`, bổ sung service vào `docker-compose.yml` ở thư mục gốc
- Endpoint `GET /api/health` trong backend
- GitHub Actions (`.github/workflows/`): chạy `npm ci`, `npm run lint`, `npm test`, `npm run build` cho backend và frontend
- Chọn cloud, tạo tài khoản, đặt cảnh báo ngân sách
- Deploy bản đầu tiên lên cloud

## Ghi chú cho deploy

- Backend đọc cấu hình từ biến môi trường, danh sách ở `.env.example`
- Database trên cloud: đặt `DB_SSL=true` nếu dịch vụ yêu cầu SSL
- Trước khi chạy bản mới: `npm run migration:run` trong thư mục backend
- Lần đầu deploy: `npm run db:app-user` (chạy bằng `DB_USER` owner, cần quyền CREATEROLE) để tạo `DB_APP_USER`. Container backend chỉ nhận `DB_APP_USER/DB_APP_PASSWORD`, không cấp `DB_USER/DB_PASSWORD` của owner
- Migration tạo bảng mới phải tự `GRANT` cho role `banking_app`, nếu không backend sẽ bị `permission denied`
- Đặt Terraform và script hạ tầng trong thư mục này ở Phase 2
