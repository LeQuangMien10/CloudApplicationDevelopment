# ADR-006: Deploy lên một máy EC2 chạy docker compose

- Trạng thái: Đã chốt trong họp 03/11/2026, **TV5 rà soát và bổ sung**
- Ngày: 03/11/2026
- Người viết: TV1 viết bản nháp, TV5 hoàn thiện

## Bối cảnh

Bản thiết kế đầu (tháng 10) chọn ECS Fargate, RDS, S3 và CloudFront. Đến tuần 6 nhóm cần có bản chạy trên cloud càng sớm càng tốt, ngân sách nhỏ, chưa có credit cloud.

## Các phương án

1. **ECS Fargate, RDS, S3 và CloudFront:** dịch vụ managed, có dự phòng, backup có sẵn.
2. **Một máy EC2 chạy docker compose:** giống hệt môi trường local, Caddy làm HTTPS.
3. **Nền tảng PaaS** (Render, Railway): nhanh nhưng ít liên quan đến nội dung môn học về hạ tầng cloud.

## Quyết định

Chọn phương án 2 cho giai đoạn này. Chuyển dần sang phương án 1 khi có credit, bắt đầu với PostgreSQL sang RDS.

## Lý do

- `docker-compose.yml` đã chạy được ở local, nên deploy gần như không phải viết thêm cấu hình.
- Chi phí thấp: một máy nhỏ, có thể tắt khi không demo.
- Đề chấm thiết kế và khả năng giải thích, không chấm mức độ phức tạp của hạ tầng.

## Đánh đổi

- **Một máy là điểm lỗi duy nhất.** Máy chết thì toàn hệ thống ngừng. Đây là lý do mục tiêu sẵn sàng chỉ đặt 99,5%.
- Backup và mã hóa DB phải tự làm (pg_dump định kỳ lên S3, mã hóa ổ đĩa EBS). Với RDS thì có sẵn.
- Scale chỉ theo chiều dọc (máy lớn hơn).

TV5 bổ sung: loại máy, vùng, chi phí ước tính mỗi tháng, cách cập nhật bản mới, cách backup.
