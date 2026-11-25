import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  OutboxEvent,
  OutboxEventType,
  type OutboxPayloads,
} from './entities/outbox-event.entity.js';

/** Phụ trách: TV3 Nhật. Các module ghi sự kiện cho worker xử lý (F5). */
@Injectable()
export class OutboxService {
  /**
   * Ghi sự kiện TRONG transaction của thao tác: commit thì có sự kiện, rollback thì không.
   * Không có bản standalone: sự kiện ghi ngoài transaction có thể mất hoặc lệch với dữ liệu.
   */
  async enqueue<T extends OutboxEventType>(
    manager: EntityManager,
    eventType: T,
    payload: OutboxPayloads[T],
  ): Promise<void> {
    await manager.insert(OutboxEvent, {
      eventType,
      // Cast: TypeORM không map được interface payload vào kiểu insert của cột jsonb
      payload: payload as unknown as object,
    });
  }
}
