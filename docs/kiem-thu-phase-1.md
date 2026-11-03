# Kiểm thử nghiệm thu Phase 1

Dùng trong buổi họp tổng kết Phase 1 và chạy lại mỗi khi có thay đổi lớn trước demo. Một người chia sẻ màn hình chạy, cả nhóm theo dõi. Mỗi mục đạt thì đánh dấu `[x]`, lỗi thì tạo GitHub Issue, ghi số Issue vào cột ghi chú.

## 0. Chuẩn bị (máy sạch)

```bash
git checkout main && git pull
docker compose down -v                  # xóa DB cũ
docker compose up -d --build            # db + backend
docker compose exec backend node dist/database/seed.js
curl http://localhost:3000/api/health   # {"status":"ok","db":"up",...}

cd frontend
cp .env.example .env                    # VITE_API_URL=http://localhost:3000/api
npm ci && npm run dev                   # http://localhost:5173
```

Tài khoản mẫu: `an@example.com`, `binh@example.com`, `chi@example.com` (mật khẩu `Password@123`), `admin@bank.local` (`Admin@123`), `operator@bank.local` và `auditor@bank.local` (mật khẩu `Staff@123`).

| # | Kiểm tra | Kết quả mong đợi | Đạt | Ghi chú |
|---|---|---|---|---|
| 0.1 | `docker compose up -d --build` trên máy sạch | Backend `healthy`, không khởi động lại liên tục | [ ] | |
| 0.2 | Swagger `http://localhost:3000/api/docs` | Mở được, có đủ các API trong `docs/api.md` | [ ] | |
| 0.3 | `npm run build` và `npm run lint` trong `frontend/` | Không lỗi | [ ] | |

## 1. Đăng ký, đăng nhập, đăng xuất

| # | Thao tác | Kết quả mong đợi | Đạt | Ghi chú |
|---|---|---|---|---|
| 1.1 | Đăng ký user mới, mật khẩu `Password@123` | Thành công, có số tài khoản 12 chữ số, số dư 0 | [ ] | |
| 1.2 | Đăng ký lại cùng email | Báo "Email đã được sử dụng" | [ ] | |
| 1.3 | Đăng ký mật khẩu `abcdefgh` (không có số) | Báo lỗi mật khẩu | [ ] | |
| 1.4 | Đăng nhập sai mật khẩu | Báo "Email hoặc mật khẩu không đúng" | [ ] | |
| 1.5 | Đăng nhập `an@example.com` | Vào trang tổng quan | [ ] | |
| 1.6 | Chưa đăng nhập, gõ thẳng `/transfer` | Bị chuyển về `/login` | [ ] | |
| 1.7 | Đăng xuất, bấm nút Back của trình duyệt | Không xem được dữ liệu, phải đăng nhập lại | [ ] | |

## 2. Xem số dư

| # | Thao tác | Kết quả mong đợi | Đạt | Ghi chú |
|---|---|---|---|---|
| 2.1 | An xem trang tổng quan | Số tài khoản `100000000001`, số dư 10.000.000 VND | [ ] | |
| 2.2 | Tắt backend (`docker compose stop backend`), tải lại trang | Báo lỗi rõ ràng, **không hiện số dư giả** | [ ] | |

## 3. Chuyển khoản

| # | Thao tác | Kết quả mong đợi | Đạt | Ghi chú |
|---|---|---|---|---|
| 3.1 | An chuyển 50.000 cho `100000000002` | Thành công, số dư An còn 9.950.000 | [ ] | |
| 3.2 | Bình đăng nhập xem số dư | 5.050.000 | [ ] | |
| 3.3 | Chi (số dư 0) chuyển 1.000 cho An | Báo số dư không đủ, số dư không đổi | [ ] | |
| 3.4 | An chuyển cho chính `100000000001` | Báo không chuyển cho chính mình được | [ ] | |
| 3.5 | An chuyển cho `199999999999` | Báo không tìm thấy tài khoản nhận | [ ] | |
| 3.6 | Số tiền 0, số âm, `1.234` | Bị chặn, không tạo giao dịch | [ ] | |
| 3.7 | Bấm nút chuyển liên tục nhiều lần | Nút bị khóa khi đang gửi, chỉ có 1 giao dịch | [ ] | |
| 3.8 | Gửi 2 lần cùng `Idempotency-Key` bằng Swagger hoặc curl (mục 6) | Lần 2 trả lại kết quả cũ, chỉ trừ tiền 1 lần | [ ] | |

## 4. Lịch sử giao dịch

| # | Thao tác | Kết quả mong đợi | Đạt | Ghi chú |
|---|---|---|---|---|
| 4.1 | An xem lịch sử | Có giao dịch 3.1 là tiền ra, có khoản nạp ban đầu là tiền vào, mới nhất trước | [ ] | |
| 4.2 | Bình xem lịch sử | Giao dịch 3.1 là tiền vào | [ ] | |
| 4.3 | Chi xem chi tiết giao dịch của An và Bình (gọi `GET /api/transactions/:id`) | `404`, không xem được | [ ] | |
| 4.4 | Tạo hơn 10 giao dịch rồi chuyển trang | Phân trang đúng | [ ] | |

## 5. Admin (bonus, làm bằng Swagger)

| # | Thao tác | Kết quả mong đợi | Đạt | Ghi chú |
|---|---|---|---|---|
| 5.1 | Admin xem danh sách user | Có đủ user, không lộ `passwordHash` | [ ] | |
| 5.2 | Admin khóa Chi, Chi đang đăng nhập bấm sang trang khác | Bị đăng xuất, báo tài khoản bị khóa | [ ] | |
| 5.3 | Chi đăng nhập lại | Bị từ chối | [ ] | |
| 5.4 | Customer gọi `GET /api/admin/users` | `403` | [ ] | |

## 5b. Vai trò Operator, Auditor và audit log (F1, F2 — làm bằng Swagger)

| # | Thao tác | Kết quả mong đợi | Đạt | Ghi chú |
|---|---|---|---|---|
| 5b.1 | Đăng nhập `operator@bank.local`, `auditor@bank.local` | Thành công, `/auth/me` trả role tương ứng | [ ] | |
| 5b.2 | Operator, auditor gọi `GET /api/admin/users` | `403` (khóa user chỉ dành cho admin) | [ ] | |
| 5b.3 | Đăng nhập sai mật khẩu vài lần, auditor gọi `GET /api/audit-logs?action=auth_login_failed` | Có dòng log, `metadata.reason = invalid_credentials`, không chứa mật khẩu | [ ] | |
| 5b.4 | Đăng nhập đúng, xem `auth_login_success` | Có dòng log kèm `actorId` | [ ] | |
| 5b.5 | Admin khóa một user, auditor xem audit log | Có dòng `user_locked`, `actorRole = admin` | [ ] | |
| 5b.6 | Customer gọi `GET /api/audit-logs` | `403` | [ ] | |
| 5b.7 | Đăng ký user mới, xem audit log theo `requestId` của request đăng ký | Có `auth_register` với `requestId` khớp header `X-Request-Id` | [ ] | |

## 6. Toàn vẹn dữ liệu và kỹ thuật

Chạy bằng `docker compose exec db psql -U bank -d banking -c "<câu SQL>"`.

| # | Kiểm tra | Kết quả mong đợi | Đạt | Ghi chú |
|---|---|---|---|---|
| 6.1 | `SELECT sum(balance) FROM accounts;` | `0.00` | [ ] | |
| 6.2 | Mỗi giao dịch có đúng 2 dòng sổ cái: `SELECT count(*) FROM transactions t WHERE (SELECT count(*) FROM ledger_entries l WHERE l.transaction_id = t.id) <> 2;` | `0` | [ ] | |
| 6.3 | `DELETE FROM ledger_entries;` bằng user `bank` | Bị trigger chặn | [ ] | |
| 6.4 | `UPDATE audit_logs SET action = 'sua_log';` bằng user `bank` | Bị trigger chặn (append-only, F2) | [ ] | |
| 6.5 | Đăng nhập backend bằng `bank_app` rồi `UPDATE audit_logs` | Lỗi `permission denied` ngay ở tầng phân quyền | [ ] | |
| 6.4 | CI trên `main` | Xanh cả 2 job | [ ] | |
| 6.5 | Trong `backend/`: `npm run test:e2e` | Đạt hết, gồm rollback và chuyển tiền đồng thời | [ ] | |

Gửi trùng key cho mục 3.8 (thay `<token>` lấy từ đăng nhập, `<id>` lấy từ `GET /api/accounts/me`):

```bash
for i in 1 2; do
  curl -s http://localhost:3000/api/transactions/transfer \
    -H "Authorization: Bearer <token>" -H "Idempotency-Key: test-trung-key-1" \
    -H "Content-Type: application/json" \
    -d '{"fromAccountId":"<id>","toAccountNumber":"100000000002","amount":"1000"}'; echo
done
```

## 7. Tổng kết

| Tiêu chí hoàn thành Phase 1 | Đạt |
|---|---|
| 6 tính năng core chạy đúng: đăng ký, đăng nhập, số dư, chuyển khoản, lịch sử, đăng xuất | [ ] |
| Có test chứng minh chuyển tiền lỗi thì rollback | [ ] |
| Chạy được bằng một lệnh `docker compose up` | [ ] |
| Có seed data, Swagger, README, `.env.example` | [ ] |
| CI báo thành công | [ ] |
| Đã deploy được lên cloud | [ ] |
