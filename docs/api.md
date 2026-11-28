# API Phase 1

Prefix: `/api`. Contract đầy đủ xem trên Swagger: `http://localhost:3000/api/docs`.

| Method | Endpoint | Ai gọi | Mô tả | Phụ trách | Trạng thái |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | Công khai | Đăng ký, tự tạo 1 tài khoản VND | TV2 | Xong |
| POST | `/api/auth/login` | Công khai | Đăng nhập, trả JWT | TV2 | Xong |
| GET | `/api/auth/me` | Đã đăng nhập | Thông tin user lấy từ JWT | TV2 | Xong |
| GET | `/api/accounts/me` | Customer | Tài khoản và số dư của tôi | TV3 | Xong |
| GET | `/api/accounts/lookup/:accountNumber` | Đã đăng nhập | Tra cứu tên chủ tài khoản trước khi chuyển khoản | TV4 | Xong |
| POST | `/api/transactions/transfer` | Customer | Chuyển khoản, bắt buộc header `Idempotency-Key` | TV3 | Xong |
| GET | `/api/transactions` | Customer | Lịch sử, `?page=&limit=&from=&to=&accountId=` | TV3 | Xong |
| GET | `/api/transactions/:id` | Customer | Chi tiết và trạng thái giao dịch | TV3 | Xong |
| GET | `/api/admin/users` | Admin | (Bonus) Danh sách user, `?page=&limit=` | TV2 | Xong |
| PATCH | `/api/admin/users/:id/status` | Admin | (Bonus) Khóa, mở user | TV2 | Xong |
| GET | `/api/health` | Công khai | Kiểm tra app và kết nối DB | TV5 | Xong |

Các API Phase 1 đã làm xong. Đăng xuất làm ở frontend: xóa token phía client.

## API Phase 2 (dự kiến)

Thiết kế dự kiến để các thành viên làm thống nhất. Người phụ trách được chỉnh khi làm, nhưng phải sửa bảng này và thêm ví dụ request, response trong cùng PR. Yêu cầu chi tiết từng mục (F1 đến F9) xem [phase2/spec.md](phase2/spec.md).

| Method | Endpoint | Ai gọi | Mô tả | Phụ trách | Tuần | Trạng thái |
|---|---|---|---|---|---|---|
| GET | `/api/audit-logs?actorId=&action=&from=&to=&requestId=&page=&limit=` | Auditor, Admin | Tra cứu audit log (F2) | TV2 | 7 | **Xong** |
| PATCH | `/api/operator/accounts/:id/status` | Operator, Admin | Khóa, mở tài khoản ngân hàng, body `{ status: "frozen" \| "active", reason }` (F3) | TV2 | 7 | **Xong** |
| GET | `/api/operator/accounts?accountNumber=` | Operator, Auditor, Admin | Tra cứu tài khoản theo số tài khoản, trả `id` để gọi API khóa/mở (Issue #11) | TV2 | 8 | **Xong** |
| GET | `/api/operator/fraud-flags?status=&page=&limit=` | Operator, Auditor, Admin | Danh sách cảnh báo bất thường (F6) | TV3 | 8 | Chưa |
| PATCH | `/api/operator/fraud-flags/:id` | Operator, Admin | Xử lý cảnh báo, body `{ status: "confirmed" \| "dismissed", note }` (F6) | TV3 | 8 | Chưa |
| GET | `/api/reconciliation/reports?status=&page=&limit=` | Auditor, Admin | Danh sách báo cáo đối soát (F7) | TV1 | 8 | **Xong** |
| GET | `/api/reconciliation/reports/:id` | Auditor, Admin | Chi tiết một báo cáo đối soát (F7) | TV1 | 8 | **Xong** |
| POST | `/api/reconciliation/run` | Admin | Chạy đối soát ngay, ghi audit log `reconciliation_run` (F7) | TV1 | 8 | **Xong** |

Thay đổi ở API cũ:
- **Xong (F4, TV3):** chuyển khoản lỗi nghiệp vụ được lưu thành giao dịch `failed` kèm `failureReason`. `GET /api/transactions` và `GET /api/transactions/:id` trả cả giao dịch này cho bên gửi. Chi tiết xem mục `POST /api/transactions/transfer` bên dưới.
- Đăng nhập và chuyển khoản có rate limit, vượt thì `429 RATE_LIMITED`. Sai mật khẩu nhiều lần thì tạm khóa đăng nhập (F9, TV2).
- Operator, Auditor xem được giao dịch của mọi tài khoản. Cách lọc chốt khi làm F1.

## Xác thực

- Đăng nhập xong, gửi token ở mọi request cần đăng nhập: `Authorization: Bearer <accessToken>`
- Token hết hạn sau 15 phút (`JWT_EXPIRES_IN`), hết hạn thì đăng nhập lại.
- Mỗi request đều kiểm tra trạng thái user trong DB: user bị khóa thì token đã cấp trước đó cũng bị từ chối ngay (`401 USER_LOCKED`).
- Vai trò (F1 Phase 2): `customer`, `operator`, `auditor`, `admin`. Role được đọc từ DB ở mỗi request, không lấy từ token, nên đổi role có hiệu lực ngay. Chỉ seed tạo operator/auditor, không ai tự đăng ký được.

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

**Ghi audit log trong module của bạn (F2):** import `AuditModule` rồi gọi `AuditService`:

```ts
// Thao tác có thay đổi dữ liệu: ghi TRONG cùng DB transaction — rollback thì log cũng rollback
await this.dataSource.transaction(async (manager) => {
  // ... cập nhật dữ liệu qua manager ...
  await this.auditService.log(manager, {
    actorId: actor.id, actorRole: actor.role,
    action: AuditAction.ACCOUNT_FROZEN,
    targetType: 'account', targetId: accountId,
    metadata: { reason },   // KHÔNG chứa mật khẩu, token
  });
});

// Không có transaction bao ngoài (vd. đăng nhập thất bại): lỗi ghi log không làm hỏng nghiệp vụ
await this.auditService.logStandalone({ action: AuditAction.AUTH_LOGIN_FAILED, ... });
```

`requestId` và `ip` được `AuditService` tự lấy từ request context (AsyncLocalStorage do `RequestIdMiddleware` gắn), không cần truyền tham số. Thêm action mới trong enum `AuditAction` của `src/audit/entities/audit-log.entity.ts`.

Danh sách action hiện có: `auth_register`, `auth_login_success`, `auth_login_failed`, `user_locked`, `user_unlocked`, `account_frozen` (F3), `account_unfrozen` (F3), `transfer_completed`, `transfer_failed` (F4), `reconciliation_run` (F7), `transaction_timed_out` (job quét giao dịch treo, `actorRole` là `system`). Nhật bổ sung `fraud_flag_reviewed` (F6); Châu Anh bổ sung `auth_login_locked` (F9).

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
{ "id": "<uuid>", "email": "an@example.com", "fullName": "Nguyễn Văn An", "role": "customer" }
```

**`GET /api/accounts/lookup/100000000002`** → `200`. Màn hình chuyển khoản dùng để hiện tên người nhận. Chỉ trả 3 trường dưới đây, không trả số dư hay email. Số tài khoản không đủ 12 chữ số trả `400 VALIDATION_ERROR`. Không tồn tại hoặc là tài khoản hệ thống `000000000000` thì trả `404 TARGET_ACCOUNT_NOT_FOUND`.

```json
{ "accountNumber": "100000000002", "accountHolderName": "TRẦN THỊ BÌNH", "status": "active" }
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

**`GET /api/audit-logs?actorId=&action=&from=&to=&requestId=&page=&limit=`** → `200` (F2). Chỉ auditor và admin. `from`, `to` dạng ISO 8601; `limit` tối đa 100; bỏ trống bộ lọc nào thì không lọc theo đó. Mới nhất trước.

```json
{ "items": [ {
    "id": "<uuid>",
    "actorId": "<uuid>",            // null nếu hành động trước khi xác thực (sai email khi đăng nhập)
    "actorRole": "admin",
    "action": "user_locked",
    "targetType": "user",
    "targetId": "<uuid>",
    "requestId": "test-req-1",
    "ip": "127.0.0.1",
    "metadata": { "newStatus": "locked" },
    "createdAt": "2026-11-09T10:00:00.000Z"
  } ],
  "total": 12, "page": 1, "limit": 20 }
```

**`POST /api/reconciliation/run`** → `201` (F7). Chỉ admin. Chạy đối soát ngay và trả báo cáo vừa lưu. Kết quả lệch vẫn là `201`, xem `status`. Đang có lần đối soát khác chạy thì `409 RECONCILIATION_IN_PROGRESS`. Cách kiểm tra và các tình huống lệch xem [sequence-doi-soat.md](sequence-doi-soat.md).

```json
{
  "id": "<uuid>",
  "trigger": "manual",                // "scheduled" khi chạy định kỳ
  "triggeredBy": "<uuid admin>",      // null khi chạy định kỳ
  "status": "mismatch",               // "ok" khi cả 3 kiểm tra đạt
  "accountsChecked": 17,
  "mismatchedAccounts": 1,
  "totalBalance": "1.00",             // đúng thì là "0.00"
  "transactionsChecked": 52,
  "invalidTransactions": 0,
  "details": {
    "accountMismatches": [ { "accountId": "<uuid>", "accountNumber": "100000000001",
                             "balance": "9999001.00", "ledgerBalance": "9999000.00", "lastBalanceAfter": "9999000.00" } ],
    "transactionMismatches": [],     // mỗi mục: transactionId, type, status, amount, entryCount, problem
    "truncated": false                // true khi quá 100 mục, các cột đếm vẫn là số đầy đủ
  },
  "durationMs": 21,
  "runAt": "2026-11-21T12:00:00.000Z" // thời điểm snapshot dữ liệu được đối soát
}
```

`problem` của giao dịch: `ledger_missing_or_unbalanced` (completed nhưng sổ cái thiếu hoặc lệch), `ledger_on_not_completed` (failed, processing mà có sổ cái), `stuck_processing` (processing quá 15 phút).

**`GET /api/reconciliation/reports?status=&page=&limit=`** → `200` (F7). Auditor và admin. `status` là `ok` hoặc `mismatch`, `limit` tối đa 100, mới nhất trước. Trả `{ items, total, page, limit }`, mỗi item cùng dạng như trên. **`GET /api/reconciliation/reports/:id`** trả một báo cáo, không có thì `404 RECONCILIATION_REPORT_NOT_FOUND`.

**`GET /api/accounts/me`** → `200`. Lấy `id` ở đây để làm `fromAccountId` khi chuyển khoản.

```json
[ { "id": "<uuid>", "accountNumber": "100000000001", "balance": "10000000.00", "currency": "VND", "status": "active" } ]
```

**`GET /api/operator/accounts?accountNumber=100000000001`** → `200` (Issue #11). Dành cho staff, dùng ở màn hình Operator để lấy `id` rồi gọi API khóa/mở phía trên. `accountNumber` phải gồm đúng 12 chữ số (`400 VALIDATION_ERROR`), không tồn tại thì `404 ACCOUNT_NOT_FOUND`. Tài khoản quỹ vẫn trả về kèm `isSystem: true` (tra cứu của khách hàng `GET /api/accounts/lookup/:accountNumber` thì trả 404 với tài khoản quỹ). **Auditor không nhận `balance`, `currency`** (ma trận phân quyền không giao auditor xem số dư).

```json
{ "id": "<uuid>", "accountNumber": "100000000001", "fullName": "Nguyễn Văn An", "status": "active", "isSystem": false, "balance": "10000000.00", "currency": "VND" }
```

**`PATCH /api/operator/accounts/:id/status`** → `200` (F3). Operator khóa tài khoản khi nghi ngờ gian lận: user vẫn đăng nhập và xem số dư, nhưng tài khoản không chuyển đi và không nhận tiền được (`422 SENDER/TARGET_ACCOUNT_NOT_ACTIVE`). `reason` bắt buộc khi `status = "frozen"`. Tài khoản quỹ `000000000000` không đổi được; tài khoản đã `closed` là trạng thái cuối (`422 ACCOUNT_CLOSED`). Gọi đúng trạng thái hiện có vẫn `200`, không ghi log trùng.

```json
// request
{ "status": "frozen", "reason": "Nghi ngờ gian lận, chờ điều tra" }
// response
{ "id": "<uuid>", "accountNumber": "100000000001", "status": "frozen", "updatedAt": "..." }
```

**`POST /api/transactions/transfer`** → `201`

```
Authorization: Bearer <token>
Idempotency-Key: 6f1c2a7e-4b8d-4c55-9a51-0d6e2b7f3c11

{ "fromAccountId": "<uuid>", "toAccountNumber": "100000000002", "amount": "1500000.00", "description": "Trả tiền ăn trưa" }
```

```json
{ "message": "Giao dịch thành công",
  "transaction": { "id": "<uuid>", "amount": "1500000.00", "status": "completed", "description": "Trả tiền ăn trưa",
                   "createdAt": "...", "fromAccountNumber": "100000000001", "toAccountNumber": "100000000002" },
  "newBalance": "8500000.00" }
```

- Số tiền luôn gửi và nhận dạng **chuỗi**, tối đa 2 chữ số thập phân. Gửi dạng số sẽ bị `400 VALIDATION_ERROR`.
- `description` không bắt buộc, tối đa 140 ký tự. Body có trường lạ (ví dụ `memo`) cũng bị `400`.
- `Idempotency-Key` sinh khi mở form, tối đa 64 ký tự. Gửi lại cùng key và cùng body thì nhận lại đúng response cũ, tiền không bị trừ lần hai. Sinh key mới sau khi chuyển thành công, hoặc khi người dùng sửa nội dung lệnh.

**Giao dịch thất bại (F4).** Lỗi `INSUFFICIENT_FUNDS`, `SENDER_ACCOUNT_NOT_ACTIVE`, `TARGET_ACCOUNT_NOT_ACTIVE` vẫn trả `422` như cũ, nhưng backend lưu thêm một giao dịch `failed`:
- Lưu trong transaction riêng sau khi rollback, không ghi sổ cái, số dư hai bên không đổi.
- `failureReason` là mã lỗi, `completedAt` là `null`. Ghi audit log `transfer_failed`; chuyển thành công ghi `transfer_completed`.
- `failureReason` là `PROCESSING_TIMEOUT` khi job quét giao dịch treo hủy giao dịch kẹt ở `processing` quá 15 phút mà chưa có sổ cái, tức chưa trừ tiền. Gửi lại cùng `Idempotency-Key` nhận `422 PROCESSING_TIMEOUT`.
- `Idempotency-Key` được lưu cùng response `422`. Gửi lại cùng key và cùng body thì nhận lại đúng lỗi đó, không sinh thêm giao dịch `failed`. Muốn thử lại (ví dụ sau khi nạp thêm tiền) thì dùng key mới.
- Không lưu khi lỗi validate (`400`), thiếu key, sai chủ tài khoản nguồn hoặc đích không tồn tại (`404`), `SAME_ACCOUNT`, `IDEMPOTENCY_CONFLICT` hoặc lỗi hệ thống (`500`).
- Lưu giao dịch `failed` bị lỗi thì chỉ ghi log server, client vẫn nhận lỗi `422` gốc.

**`GET /api/transactions?page=1&limit=10`** → `200`. `limit` mặc định 20, tối đa 100. Gồm cả tiền vào và tiền ra, mới nhất trước. Không truyền `accountId` thì lấy tài khoản đầu tiên của user. `from`, `to` dạng ngày `YYYY-MM-DD`.

```json
{ "transactions": [ { "id": "<uuid>", "type": "transfer", "status": "completed", "fromAccountId": "<uuid>", "toAccountId": "<uuid>",
                      "amount": "1500000.00", "description": "...", "failureReason": null, "initiatedBy": "<uuid>",
                      "createdAt": "...", "completedAt": "...",
                      "fromAccount": { "id": "<uuid>", "accountNumber": "100000000001", "user": { "id": "<uuid>", "fullName": "Nguyễn Văn An" } },
                      "toAccount": { "id": "<uuid>", "accountNumber": "100000000002", "user": { "id": "<uuid>", "fullName": "Trần Thị Bình" } } } ],
  "total": 2, "page": 1, "limit": 10 }
```

`fromAccount`, `toAccount` chỉ có số tài khoản và họ tên để hiển thị, không có số dư, email hay role của bên kia.

`fromAccountId` trùng `id` tài khoản của mình là tiền ra, ngược lại là tiền vào. `type` là `deposit` với tiền nạp từ tài khoản quỹ.

Giao dịch `failed` (F4) chỉ hiện trong lịch sử của **bên gửi**, bên nhận không thấy:

```json
{ "id": "<uuid>", "type": "transfer", "status": "failed", "fromAccountId": "<uuid>", "toAccountId": "<uuid>",
  "amount": "20000000.00", "description": "...", "failureReason": "INSUFFICIENT_FUNDS", "initiatedBy": "<uuid>",
  "createdAt": "...", "completedAt": null }
```

**`GET /api/transactions/:id`** → `200`, cùng dạng một phần tử trong `transactions` ở trên. Chỉ bên gửi và bên nhận xem được, người khác nhận `404 TRANSACTION_NOT_FOUND`. Giao dịch `failed` chỉ bên gửi xem được, bên nhận cũng nhận `404`.

**`GET /api/health`** → `200`. DB không phản hồi thì trả `503 DB_UNAVAILABLE`.

```json
{ "status": "ok", "db": "up", "time": "..." }
```

## Định dạng lỗi

```json
{ "code": "INSUFFICIENT_FUNDS", "message": "Số dư không đủ", "requestId": "5a52...", "details": null }
```

Mỗi response có header `X-Request-Id`. Client có thể tự gửi header này để dễ tra log.

| HTTP | Code | Khi nào |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Dữ liệu sai định dạng, `details` liệt kê từng lỗi. Gồm cả `amount` vượt 16 chữ số phần nguyên (tối đa `9999999999999999.99`) và `Idempotency-Key` dài quá 64 ký tự |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | Chuyển tiền thiếu header `Idempotency-Key` (TV3) |
| 401 | `UNAUTHORIZED` | Thiếu token, token sai hoặc hết hạn |
| 401 | `INVALID_CREDENTIALS` | Sai email hoặc mật khẩu (không phân biệt để tránh dò email) |
| 401 | `USER_LOCKED` | User bị khóa, kể cả khi dùng token cấp trước đó |
| 403 | `FORBIDDEN` | Đã đăng nhập nhưng không đủ quyền |
| 404 | `USER_NOT_FOUND` | Admin thao tác trên user không tồn tại |
| 404 | `ACCOUNT_NOT_FOUND` | Lịch sử giao dịch của tài khoản không tồn tại hoặc không thuộc mình (TV3); operator khóa tài khoản không tồn tại (F3) |
| 404 | `SENDER_ACCOUNT_NOT_FOUND` | Tài khoản nguồn không tồn tại hoặc không thuộc user đang đăng nhập (TV3) |
| 404 | `TARGET_ACCOUNT_NOT_FOUND` | Không có tài khoản đích với số tài khoản đã gửi (TV3); tra cứu số không tồn tại hoặc tài khoản hệ thống (TV4) |
| 404 | `RECONCILIATION_REPORT_NOT_FOUND` | Không có báo cáo đối soát với id đã gửi (F7) |
| 404 | `TRANSACTION_NOT_FOUND` | Giao dịch không tồn tại, hoặc không phải giao dịch của mình (TV3) |
| 409 | `EMAIL_ALREADY_EXISTS` | Đăng ký trùng email |
| 409 | `RECONCILIATION_IN_PROGRESS` | Đang có một lần đối soát khác chạy (F7) |
| 409 | `IDEMPOTENCY_CONFLICT` | Cùng Idempotency-Key nhưng khác nội dung (TV3) |
| 422 | `CANNOT_LOCK_SELF` | Admin tự khóa chính mình |
| 422 | `CANNOT_MODIFY_SYSTEM_ACCOUNT` | Operator/admin cố đổi trạng thái tài khoản quỹ `000000000000` (F3) |
| 422 | `ACCOUNT_CLOSED` | Tài khoản đã đóng là trạng thái cuối, không khóa/mở lại được (F3) |
| 422 | `SENDER_ACCOUNT_NOT_ACTIVE`, `TARGET_ACCOUNT_NOT_ACTIVE` | Tài khoản nguồn hoặc đích không ở trạng thái active, có lưu giao dịch `failed` (TV3) |
| 422 | `INSUFFICIENT_FUNDS` | Số dư không đủ, có lưu giao dịch `failed` (TV3) |
| 422 | `SAME_ACCOUNT` | Chuyển cho chính tài khoản nguồn, không lưu giao dịch `failed` (TV3) |
| 429 | `RATE_LIMITED` | Gửi quá nhiều request (Phase 2, TV2) |
| 500 | `INTERNAL_ERROR` | Lỗi hệ thống, tra log bằng `requestId` |
| 503 | `DB_UNAVAILABLE` | `/api/health` không kết nối được database (TV5) |
