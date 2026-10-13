import { Injectable } from '@nestjs/common';

/**
 * Phụ trách: TV3 Nhật
 *
 * TODO(TV3) transfer(), các bước đã chốt trong tài liệu nhóm:
 *  1. Thiếu Idempotency-Key thì 400. Tìm (userId, key) trong idempotency_keys:
 *     đã có và cùng request_hash thì trả response_body đã lưu; khác hash thì 409.
 *  2. dataSource.transaction(async (m) => { ... }):
 *     - SELECT 2 tài khoản FOR UPDATE, luôn khóa theo thứ tự id tăng dần để tránh deadlock
 *       (TypeORM: .setLock('pessimistic_write'))
 *     - kiểm tra: nguồn thuộc user, đích tồn tại, khác nguồn, cả hai ACTIVE, đủ số dư
 *     - UPDATE balance bằng SQL (balance = balance - :amount), KHÔNG cộng trừ bằng number trong JS
 *     - INSERT transaction COMPLETED, 2 ledger_entries (DEBIT nguồn, CREDIT đích), idempotency_keys
 *  3. Lỗi nghiệp vụ: rollback, lưu transaction FAILED + failure_reason ở transaction riêng,
 *     ném AppException(code, message, 422).
 *  Tham khảo cách ghi bút toán trong src/database/seed.ts (hàm deposit).
 */
@Injectable()
export class TransactionsService {}
