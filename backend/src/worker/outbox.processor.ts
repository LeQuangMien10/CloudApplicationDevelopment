import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OutboxEventStatus } from '../outbox/entities/outbox-event.entity.js';
import { computeBackoffMs } from './backoff.js';
import { OutboxHandlerRegistry } from './outbox-handler.registry.js';
import {
  OUTBOX_WORKER_CONFIG,
  type OutboxWorkerConfig,
} from './outbox-worker.config.js';

/** Độ dài tối đa của last_error, đủ đọc lỗi mà không phình bảng. */
const MAX_ERROR_LENGTH = 1000;

export type OutboxOutcome =
  /** Handler chạy xong, sự kiện đã done */
  | 'done'
  /** Handler lỗi, sự kiện chờ thử lại sau backoff */
  | 'retry'
  /** Handler lỗi đến lần cuối, sự kiện đã failed */
  | 'failed'
  /** Handler lỗi nhưng worker khác đã xử lý xong sự kiện trước khi kịp ghi lỗi */
  | 'skipped';

export interface OutboxProcessResult {
  eventId: string;
  eventType: string;
  outcome: OutboxOutcome;
}

interface ClaimedEvent {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  attempts: number;
}

/**
 * Phụ trách: TV3 Nhật. Lấy và xử lý sự kiện outbox (F5, ADR 007).
 *
 * Mỗi sự kiện xử lý trong MỘT transaction riêng:
 * 1. Lấy một sự kiện đến hạn bằng FOR UPDATE SKIP LOCKED: nhiều worker chạy song song không
 *    lấy trùng, và không phải chờ nhau.
 * 2. Chạy handler với cùng manager.
 * 3. Đánh dấu done. Dữ liệu handler ghi và trạng thái done commit cùng nhau.
 *
 * Handler lỗi thì transaction rollback (kể cả dữ liệu handler đã ghi), rồi ghi số lần lỗi ở
 * một transaction khác. Không bắt lỗi trong transaction đầu vì sau một lỗi nó đã bị hủy.
 */
@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly registry: OutboxHandlerRegistry,
    @Inject(OUTBOX_WORKER_CONFIG)
    private readonly config: OutboxWorkerConfig,
  ) {}

  /** Xử lý tối đa batchSize sự kiện, dừng sớm khi hết sự kiện đến hạn. Trả số sự kiện đã lấy. */
  async processBatch(): Promise<number> {
    let processed = 0;
    while (processed < this.config.batchSize) {
      const result = await this.processNext();
      if (!result) break;
      processed++;
    }
    return processed;
  }

  /**
   * Xử lý một sự kiện. Trả null khi không có sự kiện nào đến hạn.
   * Lỗi khi lấy sự kiện hoặc khi ghi lỗi (ví dụ mất kết nối DB) được ném ra cho vòng poll.
   */
  async processNext(): Promise<OutboxProcessResult | null> {
    const eventTypes = this.registry.eventTypes();
    if (eventTypes.length === 0) return null;

    // Giữ lại ngoài transaction để biết sự kiện nào cần ghi lỗi sau khi rollback
    let claimed: ClaimedEvent | null = null;
    try {
      await this.dataSource.transaction(async (manager) => {
        const [event] = (await manager.query(
          `
          SELECT id, event_type AS "eventType", payload, attempts
          FROM outbox_events
          WHERE status = $1
            AND available_at <= now()
            AND event_type = ANY($2::text[])
          ORDER BY available_at, created_at
          LIMIT 1
          FOR UPDATE SKIP LOCKED
          `,
          [OutboxEventStatus.PENDING, eventTypes],
        )) as ClaimedEvent[];
        if (!event) return;
        claimed = event;

        // eventTypes chỉ gồm loại đã đăng ký nên luôn có handler
        const handler = this.registry.get(event.eventType)!;
        await handler(manager, event.payload as never);

        await manager.query(
          `UPDATE outbox_events SET status = $2, processed_at = now() WHERE id = $1`,
          [event.id, OutboxEventStatus.DONE],
        );
      });
    } catch (err) {
      if (!claimed) throw err;
      return this.recordFailure(claimed, err);
    }

    if (!claimed) return null;
    const { id, eventType } = claimed as ClaimedEvent;
    return { eventId: id, eventType, outcome: 'done' };
  }

  /**
   * Ghi lần lỗi ở transaction riêng: tăng attempts, lùi available_at theo backoff,
   * đến lần cuối thì failed. Số lần và trạng thái tính trong SQL theo giá trị hiện tại của dòng.
   * WHERE status = pending: worker khác đã xử lý xong sự kiện trong lúc này thì không ghi đè.
   */
  private async recordFailure(
    event: ClaimedEvent,
    err: unknown,
  ): Promise<OutboxProcessResult> {
    const attempts = event.attempts + 1;
    const backoffMs = computeBackoffMs(
      attempts,
      this.config.backoffBaseMs,
      this.config.backoffMaxMs,
    );
    const lastError = formatError(err);

    const rows = (await this.dataSource.query(
      `
      UPDATE outbox_events
      SET attempts = attempts + 1,
          last_error = $2,
          status = CASE WHEN attempts + 1 >= $3 THEN $4 ELSE status END,
          available_at = CASE WHEN attempts + 1 >= $3 THEN available_at
                              ELSE now() + make_interval(secs => $5::double precision / 1000) END,
          processed_at = CASE WHEN attempts + 1 >= $3 THEN now() ELSE NULL END
      WHERE id = $1 AND status = $6
      RETURNING status, attempts
      `,
      [
        event.id,
        lastError,
        this.config.maxAttempts,
        OutboxEventStatus.FAILED,
        backoffMs,
        OutboxEventStatus.PENDING,
      ],
    )) as [{ status: OutboxEventStatus; attempts: number }[], number];

    const base = { eventId: event.id, eventType: event.eventType };
    const [updated] = rows[0];
    if (!updated) {
      return { ...base, outcome: 'skipped' };
    }
    if (updated.status === OutboxEventStatus.FAILED) {
      this.logger.error(
        `Sự kiện ${event.eventType} ${event.id} lỗi ${updated.attempts} lần, đánh dấu failed: ${lastError}`,
      );
      return { ...base, outcome: 'failed' };
    }
    this.logger.warn(
      `Sự kiện ${event.eventType} ${event.id} lỗi lần ${updated.attempts}, thử lại sau ${backoffMs} ms: ${lastError}`,
    );
    return { ...base, outcome: 'retry' };
  }
}

function formatError(err: unknown): string {
  const message =
    err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return message.slice(0, MAX_ERROR_LENGTH);
}
