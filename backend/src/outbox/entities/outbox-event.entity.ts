import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Loại sự kiện. Thêm loại mới không cần migration (cột varchar). */
export enum OutboxEventType {
  TRANSFER_COMPLETED = 'TRANSFER_COMPLETED',
}

export enum OutboxEventStatus {
  PENDING = 'pending',
  DONE = 'done',
  FAILED = 'failed',
}

/**
 * Payload của TRANSFER_COMPLETED. Worker đọc thêm dữ liệu từ transactions, ledger_entries.
 * Không có mốc thời gian: Date trong JS chỉ giữ mili giây, created_at lưu micro giây.
 * Luật bất thường lấy transactions.created_at và so sánh ngay trong SQL.
 */
export interface TransferCompletedPayload {
  transactionId: string;
  fromAccountId: string;
  toAccountId: string;
  /** Chuỗi numeric(18,2) đã chuẩn hóa, ví dụ "1000.50". Không đổi sang number. */
  amount: string;
}

/** Payload tương ứng từng loại sự kiện. */
export interface OutboxPayloads {
  [OutboxEventType.TRANSFER_COMPLETED]: TransferCompletedPayload;
}

/** Hàng đợi sự kiện cho worker (ADR 007). Xem migration CreateOutboxEvents. */
@Entity('outbox_events')
@Check('chk_outbox_events_status', `status IN ('pending', 'done', 'failed')`)
@Check('chk_outbox_events_attempts_non_negative', `attempts >= 0`)
@Index('idx_outbox_events_pending', ['availableAt'], {
  where: `status = 'pending'`,
})
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_type', type: 'varchar', length: 50 })
  eventType: OutboxEventType;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({
    type: 'varchar',
    length: 20,
    default: OutboxEventStatus.PENDING,
  })
  status: OutboxEventStatus;

  /** Số lần handler đã chạy lỗi. */
  @Column({ type: 'int', default: 0 })
  attempts: number;

  /** Worker chỉ lấy sự kiện có available_at <= now(). Lỗi thì lùi về sau theo backoff. */
  @Column({
    name: 'available_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  availableAt: Date;

  /** Lỗi gần nhất của handler, để debug sự kiện bị failed. */
  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;
}
