# ADR-003: Chuyển tiền đồng bộ, việc nền bất đồng bộ

- Trạng thái: Đã chốt
- Ngày: 13/10/2026
- Người viết: TV1

## Bối cảnh

Ngoài chuyển tiền còn có các việc đi kèm: phát hiện giao dịch bất thường, đối soát, quét giao dịch treo. Cần quyết định việc nào chạy trong request của người dùng, việc nào chạy sau.

## Các phương án

1. **Tất cả đồng bộ:** chuyển tiền chạy luôn luật phát hiện bất thường rồi mới trả kết quả.
2. **Tất cả bất đồng bộ:** nhận lệnh, trả `202`, xử lý chuyển tiền sau qua hàng đợi.
3. **Kết hợp:** chuyển tiền, số dư, lịch sử đồng bộ; phát hiện bất thường, đối soát, quét giao dịch treo bất đồng bộ.

## Quyết định

Chọn phương án 3. Danh sách từng việc ở [kien-truc.md](../kien-truc.md), mục 3.

## Lý do

- Người dùng cần biết ngay lệnh chuyển thành công hay không, và số dư phải đúng ngay sau đó. Phương án 2 buộc client phải hỏi lại trạng thái và làm lịch sử hiển thị trễ.
- Phát hiện bất thường chỉ gắn cờ cho Operator xem, không chặn giao dịch (UC7), nên không cần chạy trong request. Chạy đồng bộ thì luật hoặc mô hình AI chậm sẽ làm chậm chuyển tiền, lỗi thì làm hỏng chuyển tiền.
- Đối soát và quét giao dịch treo là việc định kỳ, không gắn với request nào.

## Đánh đổi

- Cảnh báo bất thường xuất hiện trễ vài giây sau giao dịch. Chấp nhận được vì Operator xử lý thủ công.
- Phải vận hành thêm một process worker và đảm bảo sự kiện không mất, không xử lý trùng (ADR 007).
- Nếu sau này muốn **chặn** giao dịch rủi ro cao ngay lập tức, cần thêm một luật đồng bộ rẻ (ví dụ hạn mức theo ngày) ngay trong luồng chuyển tiền.
