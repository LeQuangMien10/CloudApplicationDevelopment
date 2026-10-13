import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { Account } from '../../accounts/entities/account.entity.js';
import type { Transaction } from './transaction.entity.js';

export enum LedgerDirection {
  DEBIT = 'debit',
  CREDIT = 'credit',
}

/**
 * Sổ cái kép: mỗi giao dịch COMPLETED có đúng 1 dòng DEBIT (tài khoản gửi)
 * và 1 dòng CREDIT (tài khoản nhận) cùng số tiền.
 * Chỉ INSERT, không UPDATE/DELETE.
 */
@Entity('ledger_entries')
@Check('chk_ledger_amount_positive', `amount > 0`)
@Unique('uq_ledger_transaction_direction', ['transactionId', 'direction'])
@Index('idx_ledger_account', ['accountId', 'id'])
export class LedgerEntry {
  /** bigint tăng dần, dùng để sắp xếp lịch sử. TypeORM trả về string. */
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId: string;

  @ManyToOne('Transaction')
  @JoinColumn({
    name: 'transaction_id',
    foreignKeyConstraintName: 'ledger_entries_transaction_id_fkey',
  })
  transaction: Relation<Transaction>;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @ManyToOne('Account')
  @JoinColumn({
    name: 'account_id',
    foreignKeyConstraintName: 'ledger_entries_account_id_fkey',
  })
  account: Relation<Account>;

  @Column({ type: 'enum', enum: LedgerDirection, enumName: 'ledger_direction' })
  direction: LedgerDirection;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  amount: string;

  /** Số dư của account_id ngay sau bút toán này. */
  @Column({ name: 'balance_after', type: 'numeric', precision: 18, scale: 2 })
  balanceAfter: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
