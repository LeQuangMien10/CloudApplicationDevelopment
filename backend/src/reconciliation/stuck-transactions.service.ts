import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { AuditAction } from '../audit/entities/audit-log.entity.js';

/** Giao dịch processing lâu hơn mức này bị coi là treo. Đối soát dùng chung mốc này. */
export const STUCK_PROCESSING_MINUTES = 15;

/** Số giao dịch treo xử lý tối đa mỗi lần chạy, phần còn lại để lần sau. */
const BATCH_SIZE = 100;

export const PROCESSING_TIMEOUT_CODE = 'PROCESSING_TIMEOUT';
const PROCESSING_TIMEOUT_MESSAGE =
  'Giao dịch không hoàn tất trong thời gian cho phép và đã bị hủy, chưa trừ tiền';

export interface StuckTransactionsResult {
  /** Đã chuyển sang failed: không có dòng sổ cái nào nên chắc chắn chưa có tiền đi */
  failed: string[];
  /** Giữ nguyên processing vì đã có dòng sổ cái: cần người kiểm tra, đối soát cũng báo lệch */
  needsReview: string[];
}

/**
 * Phụ trách: TV1 Miền. Job quét giao dịch treo, tình huống "Service crashes during transaction".
 *
 * Chuyển khoản hiện chạy trong MỘT DB transaction nên service chết giữa chừng thì PostgreSQL
 * rollback, không để lại dòng processing. Job này là lớp phòng thủ cho các luồng sau này có lưu
 * trạng thái trung gian, và cho dữ liệu bị ghi dở do lỗi chưa biết.
 *
 * Quy tắc: chỉ tự chuyển sang failed khi CHẮC CHẮN chưa có tiền đi, tức không có dòng sổ cái.
 * Có dòng sổ cái thì không tự quyết completed hay failed, vì đoán sai là sai tiền.
 */
@Injectable()
export class StuckTransactionsService {
  private readonly logger = new Logger(StuckTransactionsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async resolve(): Promise<StuckTransactionsResult> {
    const result = await this.dataSource.transaction(async (manager) => {
      // SKIP LOCKED: bỏ qua giao dịch đang bị tiến trình khác giữ khóa (có thể vẫn đang xử lý),
      // và hai lần chạy job cùng lúc không xử lý trùng một giao dịch
      const stuck = (await manager.query(
        `
        SELECT t.id, t.from_account_id AS "fromAccountId", t.to_account_id AS "toAccountId",
               t.amount::text AS amount, t.created_at AS "createdAt"
        FROM transactions t
        WHERE t.status = 'processing'
          AND t.created_at < now() - make_interval(mins => $1::int)
        ORDER BY t.created_at
        LIMIT $2::int
        FOR UPDATE SKIP LOCKED
        `,
        [STUCK_PROCESSING_MINUTES, BATCH_SIZE],
      )) as {
        id: string;
        fromAccountId: string;
        toAccountId: string;
        amount: string;
        createdAt: Date;
      }[];
      if (stuck.length === 0) return { failed: [], needsReview: [] };

      const withLedger = new Set(
        (
          (await manager.query(
            `SELECT DISTINCT transaction_id AS id FROM ledger_entries WHERE transaction_id = ANY($1::uuid[])`,
            [stuck.map((t) => t.id)],
          )) as { id: string }[]
        ).map((r) => r.id),
      );
      const toFail = stuck.filter((t) => !withLedger.has(t.id));
      const failed = toFail.map((t) => t.id);

      if (failed.length > 0) {
        await manager.query(
          `UPDATE transactions SET status = 'failed', failure_reason = $2
           WHERE id = ANY($1::uuid[]) AND status = 'processing'`,
          [failed, PROCESSING_TIMEOUT_CODE],
        );
        // Client gửi lại cùng Idempotency-Key sẽ nhận 422 dứt khoát, không treo hay tạo lệnh mới
        await manager.query(
          `UPDATE idempotency_keys SET response_code = $2, response_body = $3::jsonb
           WHERE transaction_id = ANY($1::uuid[]) AND response_code IS NULL`,
          [
            failed,
            HttpStatus.UNPROCESSABLE_ENTITY,
            JSON.stringify({
              code: PROCESSING_TIMEOUT_CODE,
              message: PROCESSING_TIMEOUT_MESSAGE,
            }),
          ],
        );
        for (const t of toFail) {
          await this.auditService.log(manager, {
            actorId: null,
            actorRole: 'system',
            action: AuditAction.TRANSACTION_TIMED_OUT,
            targetType: 'transaction',
            targetId: t.id,
            metadata: {
              amount: t.amount,
              fromAccountId: t.fromAccountId,
              toAccountId: t.toAccountId,
              stuckSince: new Date(t.createdAt).toISOString(),
            },
          });
        }
      }

      return {
        failed,
        needsReview: stuck.filter((t) => withLedger.has(t.id)).map((t) => t.id),
      };
    });

    if (result.failed.length > 0) {
      this.logger.log(
        `Đã hủy ${result.failed.length} giao dịch treo không có sổ cái`,
      );
    }
    if (result.needsReview.length > 0) {
      this.logger.warn(
        `${result.needsReview.length} giao dịch treo đã có dòng sổ cái, cần kiểm tra tay: ${result.needsReview.join(', ')}`,
      );
    }
    return result;
  }
}
