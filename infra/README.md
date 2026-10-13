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
- Đặt Terraform và script hạ tầng trong thư mục này ở Phase 2
