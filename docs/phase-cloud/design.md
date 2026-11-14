# Phase Cloud: thiết kế

Sơ đồ triển khai: [kien-truc.md](../overview/kien-truc.md), mục 7. Lý do chọn: [ADR 006](../adr/006-deploy-ec2-docker-compose.md). Chạy local: [docker/](../docker/README.md). Các bước deploy: [infra/README.md](../../infra/README.md).

## Hướng triển khai

Một máy EC2 chạy `docker compose`, Caddy làm HTTPS. Khi có credit thì chuyển dần: PostgreSQL sang RDS trước. Phần này là thiết kế dự kiến, chưa deploy.

## CI

GitHub Actions chạy khi có PR vào `main` và khi push `main`: lint, unit test, build, migration, tạo `bank_app`, seed, e2e trên PostgreSQL thật, rồi build image.

## Vấn đề đã biết

| Vấn đề | Hướng xử lý |
|---|---|
| Container backend giữ credential owner vì phải tự chạy migration | Tách bước migration khỏi container, tuần 9 |
| Sau proxy, `req.ip` là IP của proxy nên audit log ghi sai IP | Bật `trust proxy` khi deploy |
| CI không chạy khi đổi base PR hoặc chuyển draft sang ready | Thêm `types` và `workflow_dispatch` vào `ci.yml` |
| Một máy là điểm lỗi duy nhất | Chấp nhận ở giai đoạn này, xem ADR 006 |
