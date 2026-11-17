# Phase Cloud: yêu cầu

Đưa ứng dụng lên cloud và vận hành, chạy song song với các phase khác.

**Cần đạt**
- Chạy được bằng một lệnh `docker compose up`.
- CI chạy lint, test, build cho mọi PR. Merge `main` thì tự deploy.
- Chạy trên AWS, có HTTPS, có cảnh báo ngân sách.
- Backup DB tự động, đã diễn tập khôi phục và đo thời gian.
- Hạ tầng viết bằng Terraform.
- Dashboard theo 4 golden signals, SLO.
- Load test 1×, 5×, 10×, kịch bản kill container và khôi phục.
- Mô hình chi phí, chi phí mỗi giao dịch.

Chỉ tiêu cụ thể ở [SRS](../srs/README.md).
