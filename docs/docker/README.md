# Docker

Cách hệ thống được đóng gói và chạy bằng Docker. Deploy lên cloud xem [infra/README.md](../../infra/README.md) và [phase-cloud](../phase-cloud/spec.md).

## Các service trong `docker-compose.yml`

| Service | Image | Cổng trên máy | Ghi chú |
|---|---|---|---|
| `db` | `postgres:16-alpine` | 5433 | Dữ liệu lưu ở volume `pgdata` |
| `backend` | Build từ `backend/Dockerfile` | 3000 | Chờ `db` healthy rồi mới chạy |
| `frontend` | Build từ `frontend/Dockerfile` | 8080 | Đang làm ở nhánh `feat/frontend-docker`, chưa có trên `main` |

## Lệnh thường dùng

```bash
docker compose up -d --build                             # build và chạy
docker compose exec backend node dist/database/seed.js   # dữ liệu mẫu, chạy lần đầu
curl http://localhost:3000/api/health                    # kiểm tra
docker compose logs -f backend                           # xem log
docker compose down                                      # tắt, giữ dữ liệu
docker compose down -v                                   # tắt và xóa dữ liệu
docker compose up -d db                                  # chỉ chạy DB để dev backend trên máy
```

## Image backend

- Build nhiều bước trên `node:22-slim`, bước cuối chỉ giữ thư viện chạy và `dist`, chạy bằng user `node`.
- Khi container khởi động: chạy migration, tạo hoặc cập nhật user `bank_app`, rồi mới start app.
- `HEALTHCHECK` gọi `GET /api/health`. DB không phản hồi thì API trả `503`.

## Biến môi trường

Không có `.env` vẫn chạy được, compose dùng giá trị mặc định cho dev. Trên cloud bắt buộc đổi `DB_PASSWORD`, `DB_APP_PASSWORD`, `JWT_SECRET`. Danh sách biến ở `.env.example`.

Trong container, backend gọi DB qua `db:5432`, nên `DB_HOST`, `DB_PORT` trong `.env` chỉ có tác dụng khi chạy backend trực tiếp trên máy.

## Lỗi hay gặp

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| `password authentication failed for user "bank_app"` | Chạy backend trên máy mà chưa tạo user app | `npm run db:app-user` |
| Cổng 5433 hoặc 3000 đã dùng | Có chương trình khác chiếm cổng | Đổi `DB_PORT` hoặc `PORT` trong `.env` |
| Đăng nhập tài khoản mẫu bị sai | Chưa seed | Chạy lệnh seed ở trên |
