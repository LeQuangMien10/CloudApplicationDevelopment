# Infra

Phụ trách: **TV5 Hiếu**.

## Đã có (Phase 1)

| Thành phần | File | Ghi chú |
|---|---|---|
| Health check | `backend/src/health/health.controller.ts` | `GET /api/health` trả `{ status: 'ok', db: 'up' }`, DB lỗi thì trả 503 `DB_UNAVAILABLE` |
| Image backend | `backend/Dockerfile` | Multi-stage, `node:22-slim`. Khi container khởi động sẽ chạy migration rồi mới start app |
| Chạy local | `docker-compose.yml` | Service `db` và `backend`. Backend chờ DB healthy rồi mới chạy |
| CI | `.github/workflows/ci.yml` | Mỗi PR vào `main`: lint, unit test, build, migration, e2e (có Postgres), build image Docker |

Còn lại: Dockerfile và job CI cho frontend (chờ TV4 khởi tạo `frontend/`).

## Chạy bằng Docker

```bash
docker compose up -d --build                              # build và chạy db + backend
docker compose exec backend node dist/database/seed.js    # seed, chỉ chạy lần đầu
docker compose logs -f backend                            # xem log
docker compose down                                       # tắt (giữ dữ liệu)
docker compose down -v                                    # tắt và xóa dữ liệu DB
```

Không có `.env` vẫn chạy được, compose dùng giá trị mặc định cho dev. Trong container, backend luôn gọi DB qua `db:5432`, nên `DB_HOST` và `DB_PORT` trong `.env` chỉ dùng khi chạy backend trực tiếp trên máy.

## Deploy lên cloud (bản Phase 1)

Cách làm: một máy ảo Ubuntu chạy `docker compose`, giống như chạy local.

1. Tạo VM Ubuntu 24.04. Security group: mở cổng 22 chỉ cho IP quản trị, mở 3000 cho mọi nơi. **Không mở cổng DB (5433).**
2. Cài Docker:
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
   sudo usermod -aG docker $USER   # đăng xuất rồi SSH lại
   ```
3. Lấy code và tạo `.env`:
   ```bash
   git clone https://github.com/LeQuangMien10/CloudApplicationDevelopment.git
   cd CloudApplicationDevelopment
   cp .env.example .env
   ```
   Bắt buộc đổi trong `.env`: `DB_PASSWORD` (mật khẩu mạnh), `JWT_SECRET` (`openssl rand -hex 32`), `CORS_ORIGIN` (URL frontend).
4. Chạy và seed:
   ```bash
   docker compose up -d --build
   docker compose exec backend node dist/database/seed.js
   ```
5. Kiểm tra: `http://<IP>:3000/api/health` và `http://<IP>:3000/api/docs`.

Cập nhật bản mới: `git pull && docker compose up -d --build`. Migration tự chạy khi container khởi động.

## Phase 2

Terraform và script hạ tầng đặt trong thư mục này. Tự động deploy từ CI, giám sát, backup.
