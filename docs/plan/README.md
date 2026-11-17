# Kế hoạch

- [phan-cong-cong-viec.md](phan-cong-cong-viec.md): phân công, quyết định đã chốt, quy ước làm việc, 5 demo bắt buộc
- Việc và tình trạng của từng giai đoạn: [phase0](../phase0/task.md), [phase1](../phase1/task.md), [phase2](../phase2/task.md), [phase-cloud](../phase-cloud/task.md)

## Các giai đoạn

| Giai đoạn | Nội dung | Thời gian |
|---|---|---|
| Phase 0 | Chốt yêu cầu, kế hoạch, dựng khung dự án | Đến tuần 4 |
| Phase 1 | Ứng dụng nền | Tuần 4 đến tuần 6 |
| Phase Cloud | Docker, CI/CD, deploy, giám sát | Chạy song song từ tuần 5 |
| Phase 2 | Tính năng nâng cao, bảo mật, vận hành, AI | Tuần 7 đến tuần 12 |

## Kế hoạch 10 tuần

| Tuần | Thời gian | Công việc chính | Output |
|---|---|---|---|
| 4 | 19/10 đến 25/10 | Thống nhất yêu cầu, kế hoạch, phân công; dựng khung dự án | Đặc tả chung, kế hoạch 10 tuần, repo có khung chạy được |
| 5 | 26/10 đến 01/11 | Hoàn thành Phase 1; frontend 4 trang; Docker, CI | Ứng dụng nền chạy bằng docker compose, test rollback và đồng thời đạt, CI |
| 6 | 02/11 đến 08/11 | Deploy lên cloud, tự động deploy, ADR | Ứng dụng chạy trên cloud, pipeline CI/CD, tài liệu ADR |
| 7 | 09/11 đến 15/11 | Vai trò Operator, Auditor; audit log; trạng thái tài khoản, giao dịch | API mới kèm test phân quyền, truy vết thao tác |
| 8 | 16/11 đến 22/11 | Worker, hàng đợi; luật phát hiện bất thường; đối soát; màn hình Operator, Auditor | Demo gắn cờ, báo cáo đối soát |
| 9 | 23/11 đến 29/11 | Bảo mật: rate limit, khóa đăng nhập, mã hóa; phân tích mối đe dọa | Tài liệu mối đe dọa, demo bảo mật |
| 10 | 30/11 đến 06/12 | Giám sát, SLO; kiểm thử tải 1×, 5×, 10×; kịch bản lỗi và khôi phục | Dashboard, báo cáo tải, báo cáo khôi phục |
| 11 | 07/12 đến 13/12 | AI/ML: dữ liệu giả lập, Isolation Forest, tích hợp, đánh giá | Dịch vụ chấm điểm rủi ro, báo cáo đánh giá |
| 12 | 14/12 đến 20/12 | Sửa lỗi, đóng băng tính năng, phân tích chi phí, chạy lại 5 demo | Bản ổn định, báo cáo chi phí, tài liệu |
| 13 | 21/12 đến 27/12 | Báo cáo tổng kết, slide, video demo, bảo vệ | Báo cáo cuối kỳ, slide, video |
