import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type {
  OutboxEventType,
  OutboxPayloads,
} from '../outbox/entities/outbox-event.entity.js';

/**
 * Xử lý một loại sự kiện outbox. Chạy trong transaction của worker: dữ liệu handler ghi và
 * trạng thái done của sự kiện commit cùng nhau.
 *
 * Quy ước cho handler:
 * - Phải idempotent: một sự kiện có thể được xử lý lại (worker chết sau khi handler ghi xong
 *   nhưng trước khi commit). Ghi bằng INSERT ... ON CONFLICT DO NOTHING (.orIgnore()).
 * - Không bắt lỗi rồi thử lại trong transaction: sau một lỗi cả transaction bị hủy.
 *   Cứ ném lỗi ra, worker sẽ thử lại có backoff.
 * - Mốc thời gian lấy từ DB (ví dụ transactions.created_at) và so sánh trong SQL, không qua Date.
 */
export type OutboxHandler<T extends OutboxEventType = OutboxEventType> = (
  manager: EntityManager,
  payload: OutboxPayloads[T],
) => Promise<void>;

/**
 * Phụ trách: TV3 Nhật. Bảng tra handler theo loại sự kiện (F5).
 * Module khác đăng ký trong onModuleInit, ví dụ F6 đăng ký TRANSFER_COMPLETED.
 * Worker chỉ lấy những loại sự kiện đã có handler, loại chưa có handler giữ nguyên pending.
 */
@Injectable()
export class OutboxHandlerRegistry {
  private readonly handlers = new Map<string, OutboxHandler>();

  register<T extends OutboxEventType>(
    eventType: T,
    handler: OutboxHandler<T>,
  ): void {
    if (this.handlers.has(eventType)) {
      throw new Error(`Đã có handler cho sự kiện ${eventType}`);
    }
    this.handlers.set(eventType, handler as OutboxHandler);
  }

  get(eventType: string): OutboxHandler | undefined {
    return this.handlers.get(eventType);
  }

  /** Các loại sự kiện worker được phép lấy. */
  eventTypes(): string[] {
    return [...this.handlers.keys()];
  }
}
