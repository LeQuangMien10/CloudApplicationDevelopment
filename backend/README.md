# Backend

NestJS 12 (ES module), TypeORM 1.x, PostgreSQL 16, test bằng Vitest, lint bằng oxlint.

## Lệnh thường dùng

| Lệnh | Việc |
|---|---|
| `npm run start:dev` | Chạy dev, tự reload |
| `npm test` | Unit test (`src/**/*.spec.ts`) |
| `npm run test:e2e` | E2E test (`test/`), cần database đang chạy |
| `npm run lint` / `npm run format` | Kiểm tra / định dạng code |
| `npm run migration:run` | Chạy migration chưa chạy |
| `npm run migration:revert` | Hoàn tác migration gần nhất |
| `npm run migration:generate -- src/database/migrations/TenMigration` | Sinh migration từ thay đổi entity |
| `npm run seed` | Tạo dữ liệu mẫu (bỏ qua nếu đã có dữ liệu) |
| `npm run db:reset` | Xóa sạch, chạy lại migration và seed |

Các lệnh migration và seed chạy trên bản build trong `dist/`, nên đã tự `npm run build` trước.

## Cấu trúc

```
src/
  main.ts, app.module.ts, app.setup.ts   khởi động, prefix /api, validation, Swagger
  common/        định dạng lỗi chung, requestId, AppException, quy ước tiền
  database/      cấu hình TypeORM, danh sách entity, migrations/, seed.ts
  auth/          đăng ký, đăng nhập, JWT, guard              (TV2)
  users/         user, API admin                             (TV2)
  accounts/      tài khoản, số dư, sinh số tài khoản         (TV3)
  transactions/  chuyển khoản, lịch sử, sổ cái, idempotency  (TV3)
test/            e2e test
```

API nào chưa làm đang trả `501 NOT_IMPLEMENTED`. Tìm `TODO(TV2)`, `TODO(TV3)` để thấy việc cần làm.

## Quy ước code

- **Lỗi:** mọi lỗi trả về `{ code, message, requestId, details? }`. Lỗi nghiệp vụ dùng
  `throw new AppException('INSUFFICIENT_FUNDS', 'Số dư không đủ', HttpStatus.UNPROCESSABLE_ENTITY)`.
- **Tiền:** cột `numeric(18,2)`, trong code là `string`. Không đổi sang `number` để cộng trừ.
  Cộng trừ số dư bằng SQL trong DB transaction. Xem `common/money.ts` và hàm `changeBalance` trong `database/seed.ts`.
- **Validation:** mọi body và query đi qua DTO với class-validator. Trường lạ bị từ chối.
- **Import:** project dùng ES module, import file nội bộ phải có đuôi `.js`, ví dụ `import { X } from './x.js'`.
- **Entity mới:** thêm vào `database/entities.ts`, rồi sinh migration. Không bật `synchronize`.
- **Quan hệ giữa entity:** dùng `Relation<T>` và tên entity dạng chuỗi, ví dụ `@ManyToOne('Account')`, để tránh lỗi import vòng.
