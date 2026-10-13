import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { Account } from '../../accounts/entities/account.entity.js';
import type { User } from '../../users/entities/user.entity.js';

export enum TransactionType {
  TRANSFER = 'transfer',
  DEPOSIT = 'deposit',
}

export enum TransactionStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('transactions')
@Check('chk_transactions_amount_positive', `amount > 0`)
@Check(
  'chk_transactions_different_accounts',
  `from_account_id <> to_account_id`,
)
@Index('idx_transactions_from', ['fromAccountId', 'createdAt'])
@Index('idx_transactions_to', ['toAccountId', 'createdAt'])
@Index('idx_transactions_status', ['status', 'createdAt'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: TransactionType, enumName: 'transaction_type' })
  type: TransactionType;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    enumName: 'transaction_status',
    default: TransactionStatus.PROCESSING,
  })
  status: TransactionStatus;

  @Column({ name: 'from_account_id', type: 'uuid' })
  fromAccountId: string;

  @ManyToOne('Account')
  @JoinColumn({
    name: 'from_account_id',
    foreignKeyConstraintName: 'transactions_from_account_id_fkey',
  })
  fromAccount: Relation<Account>;

  @Column({ name: 'to_account_id', type: 'uuid' })
  toAccountId: string;

  @ManyToOne('Account')
  @JoinColumn({
    name: 'to_account_id',
    foreignKeyConstraintName: 'transactions_to_account_id_fkey',
  })
  toAccount: Relation<Account>;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 140, nullable: true })
  description: string | null;

  /** Mã lỗi khi FAILED, ví dụ INSUFFICIENT_FUNDS. */
  @Column({
    name: 'failure_reason',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  failureReason: string | null;

  /** User thực hiện lệnh: khách hàng khi chuyển khoản, admin khi nạp tiền. */
  @Column({ name: 'initiated_by', type: 'uuid', nullable: true })
  initiatedBy: string | null;

  @ManyToOne('User')
  @JoinColumn({
    name: 'initiated_by',
    foreignKeyConstraintName: 'transactions_initiated_by_fkey',
  })
  initiator: Relation<User> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
