#!/usr/bin/env bash
# Chạy trên server, trong thư mục repo, sau khi code đã ở đúng commit cần deploy.
# Workflow .github/workflows/deploy.yml gọi script này. Có thể chạy tay: git pull && bash infra/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Thiếu .env trên server (xem infra/README.md, mục Deploy lên cloud)" >&2
  exit 1
fi

echo "Deploy commit $(git rev-parse --short HEAD): $(git log -1 --pretty=%s)"

# Build image mới và thay container. Migration tự chạy khi container backend khởi động.
# Không dùng `down -v`: sẽ mất dữ liệu DB và chứng chỉ của Caddy.
docker compose up -d --build --remove-orphans

# Dọn image cũ không còn dùng để ổ 20GB không đầy sau nhiều lần deploy
docker image prune -f >/dev/null

docker compose ps
