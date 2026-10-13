import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { User } from '../../users/entities/user.entity.js';
import type { Transaction } from './transaction.entity.js';

/**
 * Chống gửi trùng lệnh chuyển tiền.
 * Khóa chính (user_id, key): cùng một user gửi lại cùng key thì INSERT bị chặn,
 * service đọc lại bản ghi và trả response đã lưu.
 */
@Entity('idempotency_keys')
export class IdempotencyKey {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne('User')
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'idempotency_keys_user_id_fkey',
  })
  user: Relation<User>;

  /** Header Idempotency-Key do client sinh (UUID). */
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key: string;

  /** SHA-256 của body request, để phát hiện cùng key nhưng khác nội dung (409). */
  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash: string;

  @Column({ name: 'transaction_id', type: 'uuid', nullable: true })
  transactionId: string | null;

  @ManyToOne('Transaction')
  @JoinColumn({
    name: 'transaction_id',
    foreignKeyConstraintName: 'idempotency_keys_transaction_id_fkey',
  })
  transaction: Relation<Transaction> | null;

  @Column({ name: 'response_code', type: 'int', nullable: true })
  responseCode: number | null;

  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody: unknown;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** Service tự đặt, ví dụ now + 24 giờ. Job dọn key hết hạn làm ở Phase 2. */
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
