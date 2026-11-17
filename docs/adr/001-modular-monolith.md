# ADR-001: Modular monolith thay vì microservices

- Trạng thái: Đã chốt
- Ngày: 13/10/2026
- Người viết: TV1

## Bối cảnh

Chuyển tiền phải trừ tài khoản gửi và cộng tài khoản nhận cùng thành công hoặc cùng thất bại. Nhóm có 5 người, thời gian một học kỳ. Tải dự kiến nhỏ: khoảng 12 request/giây giờ cao điểm ([BRD](../brd/README.md), mục 4).

## Các phương án

1. **Microservices:** tách Account, Transfer, Audit thành service riêng, mỗi service một DB.
2. **Monolith không chia module:** một ứng dụng, code dùng chung tự do.
3. **Modular monolith:** một ứng dụng, một DB, chia module rõ ràng, module gọi nhau qua service được export. Việc nền chạy ở một worker cùng codebase.

## Quyết định

Chọn phương án 3.

## Lý do

- **Chuyển tiền giữ được ACID trong một DB transaction.** Nếu tách Account và Transfer ra hai DB thì phải làm Saga và giao dịch bù. Khi đó tình huống "trừ tiền xong nhưng cộng tiền lỗi" mà đề bắt buộc xử lý sẽ thực sự xảy ra.
- Nhóm nhỏ, tải nhỏ. Microservices thêm chi phí vận hành (nhiều deploy, mạng giữa service, tracing phân tán) mà không giải quyết vấn đề nào nhóm đang có.
- Chia module rõ ràng giúp 5 người làm song song ít đụng nhau. Mỗi người phụ trách một module.

## Đánh đổi

- Không scale riêng từng phần được. Chấp nhận được vì tải nhỏ, và có thể chạy nhiều bản backend sau load balancer vì backend không giữ trạng thái (JWT).
- Một lỗi nặng có thể làm sập cả backend. Giảm bằng health check và Docker tự khởi động lại.
- Ranh giới module chỉ được giữ bằng quy ước và review, không có ranh giới mạng.

**Hướng tiến hóa:** nếu cần tách, tách phần bất đồng bộ trước (phát hiện bất thường, đối soát) vì chúng vốn đã giao tiếp qua outbox. Phần chuyển tiền giữ trong một DB.
