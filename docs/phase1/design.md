# Phase 1: thiết kế

> Tổng kết lại sau khi đã làm.

Kiến trúc tổng thể: [kien-truc.md](../overview/kien-truc.md). Dữ liệu: [database.md](../database.md). API: [api.md](../api.md).

## Xác thực

JWT sống 15 phút, payload `{ sub, role }`, mật khẩu bcrypt. Mỗi request kiểm tra trạng thái user trong DB để khóa user có hiệu lực ngay. Luồng chi tiết: [sequence đăng nhập](../sequence-dang-nhap.md).

## Chuyển tiền

Toàn bộ trong một DB transaction ([sequence chuyển khoản](../sequence-chuyen-tien.md)):

| Vấn đề | Thiết kế | ADR |
|---|---|---|
| Trừ tiền xong, cộng tiền lỗi | Một transaction, lỗi thì rollback | 001 |
| Gửi trùng | Khóa chính `(user_id, key)`, giữ chỗ bằng `ON CONFLICT DO NOTHING`, lưu hash nội dung và response | |
| Chuyển đồng thời | `SELECT ... FOR UPDATE` theo thứ tự số tài khoản | 004 |
| Chứng minh số dư đúng | Sổ cái kép, 2 dòng mỗi giao dịch | 005 |
| Bảo vệ sổ cái | Trigger chỉ thêm dòng, trigger kiểm tra cân sổ lúc commit, backend chạy bằng user `bank_app` | 005 |

## Kiểm thử

- Unit test bằng Vitest.
- E2e chạy trên PostgreSQL thật, các file chạy tuần tự vì dùng chung tài khoản seed.
- `rollback.e2e-spec.ts` giả lập lỗi giữa chừng, `deadlock.e2e-spec.ts` chuyển chéo đồng thời, `transfer.e2e-spec.ts` các trường hợp nghiệp vụ.
