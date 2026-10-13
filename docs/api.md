# API Phase 1

Prefix: `/api`. Contract đầy đủ xem trên Swagger: `http://localhost:3000/api/docs`.

| Method | Endpoint | Ai gọi | Mô tả | Phụ trách |
|---|---|---|---|---|
| POST | `/api/auth/register` | Công khai | Đăng ký, tự tạo 1 tài khoản | TV2 |
| POST | `/api/auth/login` | Công khai | Đăng nhập, trả JWT | TV2 |
| GET | `/api/accounts/me` | Customer | Tài khoản và số dư của tôi | TV3 |
| POST | `/api/transactions/transfer` | Customer | Chuyển khoản, bắt buộc header `Idempotency-Key` | TV3 |
| GET | `/api/transactions` | Customer | Lịch sử, `?page=&limit=&from=&to=&accountId=` | TV3 |
| GET | `/api/transactions/:id` | Customer | Chi tiết và trạng thái giao dịch | TV3 |
| GET | `/api/admin/users` | Admin | (Bonus) Danh sách user | TV2 |
| PATCH | `/api/admin/users/:id/status` | Admin | (Bonus) Khóa, mở user | TV2 |
| GET | `/api/health` | Hệ thống | Kiểm tra sức khỏe | TV5 |

Đăng xuất làm ở frontend: xóa token phía client.

## Định dạng lỗi

```json
{ "code": "INSUFFICIENT_FUNDS", "message": "Số dư không đủ", "requestId": "5a52...", "details": null }
```

| HTTP | Khi nào | Ví dụ code |
|---|---|---|
| 400 | Dữ liệu sai định dạng | VALIDATION_ERROR |
| 401 | Chưa đăng nhập, sai mật khẩu | UNAUTHORIZED, INVALID_CREDENTIALS |
| 403 | Không có quyền | FORBIDDEN |
| 404 | Không tìm thấy | ACCOUNT_NOT_FOUND |
| 409 | Trùng dữ liệu | EMAIL_ALREADY_EXISTS, IDEMPOTENCY_CONFLICT |
| 422 | Vi phạm nghiệp vụ | INSUFFICIENT_FUNDS, ACCOUNT_NOT_ACTIVE, SAME_ACCOUNT |
| 501 | API chưa làm xong | NOT_IMPLEMENTED |

Mỗi response có header `X-Request-Id`. Client có thể tự gửi header này để dễ tra log.

## Ví dụ chuyển khoản

```
POST /api/transactions/transfer
Authorization: Bearer <token>
Idempotency-Key: 6f1c2a7e-4b8d-4c55-9a51-0d6e2b7f3c11

{ "fromAccountId": "<uuid>", "toAccountNumber": "100000000002", "amount": "1500000.00", "description": "Trả tiền ăn trưa" }
```

Số tiền luôn gửi và nhận dạng chuỗi.
