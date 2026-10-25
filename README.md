# Digital Banking Simulator

Bài tập lớn môn Phát triển ứng dụng điện toán đám mây, Project 4.
Backend ngân hàng số mô phỏng: tài khoản, chuyển khoản nội bộ, lịch sử giao dịch, audit. Chỉ mô phỏng, không có giao dịch tài chính thật.

## Cấu trúc repo

```
backend/    NestJS + TypeORM + PostgreSQL
frontend/   React + Vite (TV4 Tú)
infra/      Docker, CI/CD, cloud (TV5 Hiếu)
docs/       Kế hoạch, database, API, ADR
docker-compose.yml   PostgreSQL cho môi trường dev
.env.example         Biến môi trường mẫu
```

## Chạy nhanh trên máy

Cần: Node.js 22 trở lên, Docker Desktop.

```bash
cp .env.example .env              # chỉnh nếu cần, không commit .env
docker compose up -d db           # PostgreSQL ở cổng 5433
cd backend
npm install
npm run migration:run             # tạo bảng
npm run seed                      # dữ liệu mẫu
npm run start:dev                 # http://localhost:3000/api
```

Swagger: http://localhost:3000/api/docs

Hoặc chạy cả DB và backend bằng Docker, không cần cài Node (migration tự chạy khi backend khởi động):

```bash
docker compose up -d --build
docker compose exec backend node dist/database/seed.js   # chỉ cần chạy lần đầu
curl http://localhost:3000/api/health
```

Database dev chạy ở cổng **5433** để không trùng với PostgreSQL có thể đã cài sẵn trên máy (cổng 5432). Kết nối bằng DBeaver, pgAdmin: `localhost:5433`, user `bank`, mật khẩu `bank_dev_password`, database `banking`. Muốn đổi cổng thì sửa `DB_PORT` trong `.env`, không cần sửa code.

Tài khoản mẫu sau khi seed:

| Vai trò | Email | Mật khẩu | Số tài khoản |
|---|---|---|---|
| admin | admin@bank.local | Admin@123 | |
| customer | an@example.com | Password@123 | 100000000001 (10.000.000) |
| customer | binh@example.com | Password@123 | 100000000002 (5.000.000) |
| customer | chi@example.com | Password@123 | 100000000003 (0) |

## Phân công Phase 1 (hạn 24/10)

| Thành viên | Vai trò | Thư mục chính |
|---|---|---|
| TV1 Miền | Trưởng nhóm backend | `backend/src/database`, `backend/src/common`, `docs/` |
| TV2 Châu Anh | Backend xác thực | `backend/src/auth`, `backend/src/users` |
| TV3 Nhật | Backend chuyển tiền | `backend/src/accounts`, `backend/src/transactions` |
| TV4 Tú | Frontend | `frontend/` |
| TV5 Hiếu | Cloud và DevOps | `infra/`, `.github/`, Dockerfile |

Chi tiết: [docs/phan-cong-cong-viec.md](docs/phan-cong-cong-viec.md)

## Quy ước làm việc

- Không commit thẳng vào `main`. Mỗi việc một nhánh, đặt tên `feat/<việc>`, `fix/<việc>`, ví dụ `feat/auth-login`.
- Merge qua Pull Request, cần ít nhất 1 người review.
- Commit message ngắn gọn theo dạng `feat: ...`, `fix: ...`, `docs: ...`, `test: ...`.
- Đổi schema database thì tạo migration mới, không sửa migration đã merge. Đổi API thì cập nhật DTO và Swagger, báo Miền.
- Không commit `.env`, mật khẩu, khóa bí mật.
