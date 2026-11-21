import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { User } from '../../users/entities/user.entity.js';

export enum ReconciliationStatus {
  OK = 'ok',
  MISMATCH = 'mismatch',
}

export enum ReconciliationTrigger {
  /** Chạy định kỳ mỗi ngày (worker hoặc cron gọi run-reconciliation.js). */
  SCHEDULED = 'scheduled',
  /** Admin gọi POST /api/reconciliation/run. */
  MANUAL = 'manual',
}

/** Tài khoản có số dư không khớp sổ cái. Số tiền là chuỗi numeric(18,2). */
export interface AccountMismatch {
  accountId: string;
  accountNumber: string;
  /** accounts.balance */
  balance: string;
  /** Tổng credit trừ tổng debit trong ledger_entries */
  ledgerBalance: string;
  /** balance_after của dòng sổ cái mới nhất, null khi tài khoản chưa có dòng nào */
  lastBalanceAfter: string | null;
}

export enum TransactionProblem {
  /** completed nhưng không có đúng 1 debit ở tài khoản nguồn và 1 credit ở tài khoản đích, cùng số tiền */
  LEDGER_MISSING_OR_UNBALANCED = 'ledger_missing_or_unbalanced',
  /** failed hoặc processing nhưng lại có dòng sổ cái */
  LEDGER_ON_NOT_COMPLETED = 'ledger_on_not_completed',
  /** processing quá 15 phút: service chết giữa chừng mà không rollback được */
  STUCK_PROCESSING = 'stuck_processing',
}

export interface TransactionMismatch {
  transactionId: string;
  type: string;
  status: string;
  amount: string;
  entryCount: number;
  problem: TransactionProblem;
}

export interface ReconciliationDetails {
  accountMismatches: AccountMismatch[];
  transactionMismatches: TransactionMismatch[];
  /** true khi số mục lệch vượt giới hạn lưu trong details */
  truncated: boolean;
}

/** Phụ trách: TV1 Miền. Kết quả một lần đối soát (F7). Chỉ thêm dòng. */
@Entity('reconciliation_reports')
@Check('chk_reconciliation_reports_status', `status IN ('ok', 'mismatch')`)
@Check(
  'chk_reconciliation_reports_trigger',
  `trigger IN ('scheduled', 'manual')`,
)
@Check(
  'chk_reconciliation_reports_counts_non_negative',
  'accounts_checked >= 0 AND mismatched_accounts >= 0 AND transactions_checked >= 0 AND invalid_transactions >= 0 AND duration_ms >= 0',
)
@Index('idx_reconciliation_reports_run_at', ['runAt'])
export class ReconciliationReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  trigger: ReconciliationTrigger;

  /** Admin chạy tay; null khi chạy định kỳ. */
  @Column({ name: 'triggered_by', type: 'uuid', nullable: true })
  triggeredBy: string | null;

  @ManyToOne('User', { onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'triggered_by',
    foreignKeyConstraintName: 'reconciliation_reports_triggered_by_fkey',
  })
  triggeredByUser: Relation<User>;

  @Column({ type: 'varchar', length: 20 })
  status: ReconciliationStatus;

  @Column({ name: 'accounts_checked', type: 'int' })
  accountsChecked: number;

  @Column({ name: 'mismatched_accounts', type: 'int' })
  mismatchedAccounts: number;

  /** Tổng số dư mọi tài khoản, kể cả tài khoản hệ thống. Đúng thì bằng "0.00". */
  @Column({ name: 'total_balance', type: 'numeric', precision: 18, scale: 2 })
  totalBalance: string;

  @Column({ name: 'transactions_checked', type: 'int' })
  transactionsChecked: number;

  @Column({ name: 'invalid_transactions', type: 'int' })
  invalidTransactions: number;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  details: ReconciliationDetails;

  @Column({ name: 'duration_ms', type: 'int' })
  durationMs: number;

  /** Thời điểm snapshot dữ liệu được đối soát. */
  @Column({ name: 'run_at', type: 'timestamptz', default: () => 'now()' })
  runAt: Date;
}
