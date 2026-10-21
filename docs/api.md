# API Phase 1

Prefix: `/api`. Contract đầy đủ xem trên Swagger: `http://localhost:3000/api/docs`.

| Method | Endpoint | Ai gọi | Mô tả | Phụ trách | Trạng thái |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | Công khai | Đăng ký, tự tạo 1 tài khoản VND | TV2 | Xong |
| POST | `/api/auth/login` | Công khai | Đăng nhập, trả JWT | TV2 | Xong |
| GET | `/api/auth/me` | Đã đăng nhập | Thông tin user lấy từ JWT | TV2 | Xong |
| GET | `/api/accounts/me` | Customer | Tài khoản và số dư của tôi | TV3 | Chưa |
| POST | `/api/transactions/transfer` | Customer | Chuyển khoản, bắt buộc header `Idempotency-Key` | TV3 | Chưa |
| GET | `/api/transactions` | Customer | Lịch sử, `?page=&limit=&from=&to=&accountId=` | TV3 | Chưa |
| GET | `/api/transactions/:id` | Customer | Chi tiết và trạng thái giao dịch | TV3 | Chưa |
| GET | `/api/admin/users` | Admin | (Bonus) Danh sách user, `?page=&limit=` | TV2 | Xong |
| PATCH | `/api/admin/users/:id/status` | Admin | (Bonus) Khóa, mở user | TV2 | Xong |
| GET | `/api/health` | Hệ thống | Kiểm tra sức khỏe | TV5 | Chưa |

API chưa làm trả `501 NOT_IMPLEMENTED`. Đăng xuất làm ở frontend: xóa token phía client.

## Xác thực

- Đăng nhập xong, gửi token ở mọi request cần đăng nhập: `Authorization: Bearer <accessToken>`
- Token hết hạn sau 15 phút (`JWT_EXPIRES_IN`), hết hạn thì đăng nhập lại.
- Mỗi request đều kiểm tra trạng thái user trong DB: user bị khóa thì token đã cấp trước đó cũng bị từ chối ngay (`401 USER_LOCKED`).

**Cho backend, cách bảo vệ một endpoint:**

```ts
@UseGuards(JwtAuthGuard)                 // bắt buộc đăng nhập
@Get('me')
getMine(@CurrentUser() user: RequestUser) { // user.id, user.role
  ...
}

@UseGuards(JwtAuthGuard, RolesGuard)     // JwtAuthGuard phải đứng trước
@Roles(UserRole.ADMIN)                   // chỉ admin
```

Import từ `src/auth/`: `jwt-auth.guard.js`, `roles.guard.js`, `roles.decorator.js`, `current-user.decorator.js`.

## Request và response

**`POST /api/auth/register`** → `201`

```json
// request
{ "fullName": "Nguyễn Văn An", "email": "an@example.com", "password": "Password@123" }
// response
{ "id": "<uuid>", "fullName": "Nguyễn Văn An", "email": "an@example.com", "accountNumber": "123456789012" }
```

Mật khẩu ít nhất 8 ký tự, có cả chữ và số. Email được chuyển về chữ thường.

**`POST /api/auth/login`** → `200`

```json
// request
{ "email": "an@example.com", "password": "Password@123" }
// response
{ "accessToken": "<jwt>", "expiresIn": 900 }
```

**`GET /api/auth/me`** → `200`

```json
{ "id": "<uuid>", "role": "customer" }
```

**`GET /api/admin/users?page=1&limit=20`** → `200`. `page` từ 1, `limit` từ 1 đến 100.

```json
{ "items": [ { "id": "<uuid>", "fullName": "...", "email": "...", "role": "customer", "status": "active", "createdAt": "...", "updatedAt": "..." } ],
  "total": 4, "page": 1, "limit": 20 }
```

**`PATCH /api/admin/users/:id/status`** → `200`

```json
// request
{ "status": "locked" }        // hoặc "active"
// response
{ "id": "<uuid>", "fullName": "...", "email": "...", "role": "customer", "status": "locked" }
```

**`POST /api/transactions/transfer`** (TV3, chưa làm)

```
Authorization: Bearer <token>
Idempotency-Key: 6f1c2a7e-4b8d-4c55-9a51-0d6e2b7f3c11

{ "fromAccountId": "<uuid>", "toAccountNumber": "100000000002", "amount": "1500000.00", "description": "Trả tiền ăn trưa" }
```

Số tiền luôn gửi và nhận dạng chuỗi.

## Định dạng lỗi

```json
{ "code": "INSUFFICIENT_FUNDS", "message": "Số dư không đủ", "requestId": "5a52...", "details": null }
```

Mỗi response có header `X-Request-Id`. Client có thể tự gửi header này để dễ tra log.

| HTTP | Code | Khi nào |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Dữ liệu sai định dạng, `details` liệt kê từng lỗi |
| 401 | `UNAUTHORIZED` | Thiếu token, token sai hoặc hết hạn |
| 401 | `INVALID_CREDENTIALS` | Sai email hoặc mật khẩu (không phân biệt để tránh dò email) |
| 401 | `USER_LOCKED` | User bị khóa, kể cả khi dùng token cấp trước đó |
| 403 | `FORBIDDEN` | Đã đăng nhập nhưng không đủ quyền |
| 404 | `USER_NOT_FOUND` | Admin thao tác trên user không tồn tại |
| 404 | `ACCOUNT_NOT_FOUND` | Tài khoản không tồn tại (TV3) |
| 409 | `EMAIL_ALREADY_EXISTS` | Đăng ký trùng email |
| 409 | `IDEMPOTENCY_CONFLICT` | Cùng Idempotency-Key nhưng khác nội dung (TV3) |
| 422 | `CANNOT_LOCK_SELF` | Admin tự khóa chính mình |
| 422 | `INSUFFICIENT_FUNDS`, `ACCOUNT_NOT_ACTIVE`, `SAME_ACCOUNT` | Vi phạm nghiệp vụ chuyển tiền (TV3) |
| 500 | `INTERNAL_ERROR` | Lỗi hệ thống, tra log bằng `requestId` |
| 501 | `NOT_IMPLEMENTED` | API chưa làm xong |
