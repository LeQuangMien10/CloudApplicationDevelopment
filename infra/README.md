# Infra

Phụ trách: **TV5 Hiếu**.

## Đã có (Phase 1)

| Thành phần | File | Ghi chú |
|---|---|---|
| Health check | `backend/src/health/health.controller.ts` | `GET /api/health` trả `{ status: 'ok', db: 'up' }`, DB lỗi thì trả 503 `DB_UNAVAILABLE` |
| Image backend | `backend/Dockerfile` | Multi-stage, `node:22-slim`. Khi container khởi động sẽ chạy migration, tạo DB user cho app (`create-app-user.js`) rồi mới start app |
| Image frontend | `frontend/Dockerfile`, `frontend/nginx.conf` | Build bằng Vite, phục vụ bằng nginx. nginx chuyển `/api/` sang `backend:3000`, nên frontend gọi API cùng địa chỉ, không cần CORS và không phải build lại khi IP server đổi |
| Chạy local | `docker-compose.yml` | Service `db`, `backend`, `frontend`, `caddy`. Backend chờ DB healthy rồi mới chạy |
| HTTPS | `infra/Caddyfile`, service `caddy` | Caddy đứng trước nginx, tự xin và gia hạn chứng chỉ Let's Encrypt cho `DOMAIN`, tự chuyển HTTP sang HTTPS. Chỉ Caddy mở cổng ra ngoài (80, 443), các service khác chỉ nghe ở `127.0.0.1` |
| CI | `.github/workflows/ci.yml` | Mỗi PR vào `main`: backend (lint, unit test, build, migration, e2e có Postgres), frontend (lint, build), build image Docker cả hai |
| CD | `.github/workflows/deploy.yml`, `infra/deploy.sh` | CI trên `main` xanh thì tự SSH vào EC2 và `docker compose up -d --build`, kiểm tra `/api/health` |

## Chạy bằng Docker

```bash
docker compose up -d --build                              # build và chạy db + backend + frontend
docker compose exec backend node dist/database/seed.js    # seed, chỉ chạy lần đầu
docker compose logs -f backend                            # xem log
docker compose down                                       # tắt (giữ dữ liệu)
docker compose down -v                                    # tắt và xóa dữ liệu DB
```

Không có `.env` vẫn chạy được, compose dùng giá trị mặc định cho dev. Trong container, backend luôn gọi DB qua `db:5432`, nên `DB_HOST` và `DB_PORT` trong `.env` chỉ dùng khi chạy backend trực tiếp trên máy.

Local: giao diện ở `https://localhost` (chứng chỉ tự ký, trình duyệt sẽ cảnh báo) hoặc `http://localhost:8080` (vào thẳng nginx).

## Deploy lên cloud

Cách làm: một máy EC2 Ubuntu chạy `docker compose`, giống như chạy local, Caddy lo HTTPS.

Đang chạy: `https://insecurebanking.duckdns.org` (EC2 ap-southeast-2, Elastic IP `32.237.40.215`).

1. Tạo EC2 Ubuntu 24.04, gắn **Elastic IP** để IP không đổi khi stop/start. Tạo domain (ví dụ DuckDNS) trỏ bản ghi A về Elastic IP. Let's Encrypt không cấp chứng chỉ cho IP trần nên bắt buộc có domain.
   Security group: cổng 22 chỉ cho IP quản trị, **80 và 443 (TCP) cho mọi nơi**, 443 UDP nếu muốn HTTP/3. Cổng 80 phải mở để Let's Encrypt xác minh domain. **Không mở 3000, 8080, 5433.**
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
   Bắt buộc đổi trong `.env`: `DB_PASSWORD` và `DB_APP_PASSWORD` (hai mật khẩu mạnh, khác nhau), `JWT_SECRET` (`openssl rand -hex 32`), `DOMAIN` (ví dụ `insecurebanking.duckdns.org`), `CORS_ORIGIN` (`https://<DOMAIN>`).
4. Chạy và seed:
   ```bash
   docker compose up -d --build
   docker compose exec backend node dist/database/seed.js
   docker compose logs -f caddy    # chờ dòng "certificate obtained successfully"
   ```
5. Kiểm tra: `curl -I http://<DOMAIN>` trả `308` chuyển sang https, `https://<DOMAIN>/api/health` trả `{"status":"ok","db":"up"}`, Swagger ở `https://<DOMAIN>/api/docs`.

Không xóa volume `caddy_data` (đừng dùng `docker compose down -v` trên server): nó chứa chứng chỉ, xóa đi thì Caddy phải xin lại, Let's Encrypt giới hạn 5 lần mỗi tuần cho cùng một domain.

Cập nhật bản mới: tự động khi merge vào `main` (mục dưới). Chạy tay: `git pull && bash infra/deploy.sh`. Migration tự chạy khi container khởi động.

## Tự động deploy khi merge `main`

Workflow `.github/workflows/deploy.yml`:

1. PR merge vào `main` → workflow **CI** chạy trên `main`.
2. CI xanh → workflow **Deploy** chạy (CI đỏ thì không deploy). Chạy tay được ở tab Actions → Deploy → *Run workflow*.
3. Deploy tạm mở cổng 22 trong security group cho IP của runner GitHub, SSH vào Elastic IP, `git reset --hard <commit vừa qua CI>`, chạy `infra/deploy.sh` (`docker compose up -d --build`, dọn image cũ).
4. Gọi `https://<DOMAIN>/api/health` tới khi trả `ok` (tối đa 150 giây), sau đó đóng cổng 22 lại (kể cả khi lỗi).

Hai lần deploy không chạy cùng lúc. `.env` trên server không bị đụng tới vì không nằm trong git.

### Cài đặt một lần

**a. SSH key riêng cho CI** (không dùng lại file `.pem` của mình). Trên máy mình:

```bash
ssh-keygen -t ed25519 -N "" -C github-deploy -f deploy_key
ssh -i banking.pem ubuntu@32.237.40.215 "cat >> ~/.ssh/authorized_keys" < deploy_key.pub
ssh-keyscan -t ed25519 32.237.40.215     # lấy host key để ghim
```

**b. IAM user `github-deploy`** chỉ được thêm/xóa rule trên đúng security group của EC2. Tạo access key cho user này với policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ec2:AuthorizeSecurityGroupIngress", "ec2:RevokeSecurityGroupIngress"],
    "Resource": "arn:aws:ec2:ap-southeast-2:<ACCOUNT_ID>:security-group/<SG_ID>"
  }]
}
```

**c. GitHub:** Settings → Environments → tạo environment `production` (có thể giới hạn *Deployment branches* là `main`), thêm:

| Loại | Tên | Giá trị |
|---|---|---|
| Secret | `EC2_HOST` | `32.237.40.215` |
| Secret | `EC2_SSH_KEY` | Nội dung file `deploy_key` (private key) |
| Secret | `EC2_KNOWN_HOSTS` | Dòng in ra từ `ssh-keyscan` ở bước a |
| Secret | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Access key của `github-deploy` |
| Variable | `AWS_REGION` | `ap-southeast-2` |
| Variable | `EC2_SECURITY_GROUP_ID` | `sg-...` của EC2 |
| Variable | `DOMAIN` | `insecurebanking.duckdns.org` |
| Variable | `EC2_USER` (không bắt buộc) | Mặc định `ubuntu` |
| Variable | `APP_DIR` (không bắt buộc) | Mặc định `~/CloudApplicationDevelopment` |

Xong thì xóa `deploy_key` trên máy mình. Thử bằng *Run workflow* trước khi merge PR thật.

**Lưu ý:** EC2 phải đang chạy thì deploy mới thành công. Máy đang Stop thì job Deploy đỏ ở bước SSH, Start máy rồi bấm *Re-run*. Build image ngay trên server, `t3.small` (2GB RAM) đủ dùng, máy nhỏ hơn có thể hết RAM khi build frontend.

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
