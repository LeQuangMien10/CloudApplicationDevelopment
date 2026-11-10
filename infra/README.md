# Infra

Phụ trách: **TV5 Hiếu**.

## Đã có (Phase 1)

| Thành phần | File | Ghi chú |
|---|---|---|
| Health check | `backend/src/health/health.controller.ts` | `GET /api/health` trả `{ status: 'ok', db: 'up' }`, DB lỗi thì trả 503 `DB_UNAVAILABLE` |
| Image backend | `backend/Dockerfile` | Multi-stage, `node:22-slim`. Khi container khởi động sẽ chạy migration, tạo DB user cho app (`create-app-user.js`) rồi mới start app |
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
   Bắt buộc đổi trong `.env`: `DB_PASSWORD` và `DB_APP_PASSWORD` (hai mật khẩu mạnh, khác nhau), `JWT_SECRET` (`openssl rand -hex 32`), `CORS_ORIGIN` (URL frontend).
4. Chạy và seed:
   ```bash
   docker compose up -d --build
   docker compose exec backend node dist/database/seed.js
   ```
5. Kiểm tra: `http://<IP>:3000/api/health` và `http://<IP>:3000/api/docs`.

Cập nhật bản mới: `git pull && docker compose up -d --build`. Migration tự chạy khi container khởi động.

## Database: user owner và user app

- Backend chạy bằng `DB_APP_USER` (mặc định `bank_app`, thuộc role `banking_app`), chỉ được `SELECT/INSERT` trên `ledger_entries`. `DB_USER` là owner, dùng cho migration, seed và tạo `DB_APP_USER`
- Docker tự tạo hoặc cập nhật mật khẩu `DB_APP_USER` mỗi lần container khởi động. Chạy backend trực tiếp trên máy thì chạy `npm run db:app-user` sau `npm run migration:run`
- Migration tạo bảng mới phải tự `GRANT` cho role `banking_app`, nếu không backend sẽ bị `permission denied`
- Hiện container backend vẫn giữ cả credential owner vì phải tự chạy migration. Tách riêng bước migration để container app chỉ nhận `DB_APP_USER/DB_APP_PASSWORD` là việc của Phase 2

## Phase 2

Việc của TV5, theo [docs/plan/phan-cong-cong-viec.md](../docs/plan/phan-cong-cong-viec.md):

| Việc | Tuần |
|---|---|
| Dockerfile frontend, service frontend trong compose, job CI frontend | 6 |
| EC2, Caddy HTTPS, cảnh báo ngân sách, tự động deploy khi merge `main` | 6 |
| Service `worker` trong compose (cùng image backend, chạy `node dist/worker.js`) | 8 |
| Tách bước migration khỏi container backend, secret ngoài repo | 9 |
| Backup DB tự động, thử khôi phục và đo thời gian | 9 |
| Terraform cho phần hạ tầng đang dùng, đặt trong thư mục này | 9 |
| Dashboard theo 4 golden signals, SLO | 10 |
| Load test 1×, 5×, 10× bằng k6, kịch bản kill container và khôi phục | 10 |
| Mô hình chi phí, chi phí mỗi giao dịch | 12 |
