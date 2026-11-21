import {
  type AccountMismatch,
  type ReconciliationDetails,
  ReconciliationStatus,
  type TransactionMismatch,
} from './entities/reconciliation-report.entity.js';

/** Số mục lệch tối đa lưu trong details của mỗi loại. Các cột đếm vẫn là số đầy đủ. */
export const MAX_DETAIL_ITEMS = 100;

export interface ReconciliationCheckResult {
  accountsChecked: number;
  /** Tổng số dư mọi tài khoản, chuỗi numeric(18,2) */
  totalBalance: string;
  /** Do PostgreSQL so sánh (sum(balance) = 0), không so chuỗi */
  totalBalanceIsZero: boolean;
  mismatchedAccounts: number;
  accountMismatches: AccountMismatch[];
  transactionsChecked: number;
  invalidTransactions: number;
  transactionMismatches: TransactionMismatch[];
}

export interface ReconciliationSummary {
  status: ReconciliationStatus;
  details: ReconciliationDetails;
}

/** Kết quả là ok chỉ khi cả 3 kiểm tra đều đạt. */
export function summarizeReconciliation(
  result: ReconciliationCheckResult,
): ReconciliationSummary {
  const ok =
    result.totalBalanceIsZero &&
    result.mismatchedAccounts === 0 &&
    result.invalidTransactions === 0;

  return {
    status: ok ? ReconciliationStatus.OK : ReconciliationStatus.MISMATCH,
    details: {
      accountMismatches: result.accountMismatches.slice(0, MAX_DETAIL_ITEMS),
      transactionMismatches: result.transactionMismatches.slice(
        0,
        MAX_DETAIL_ITEMS,
      ),
      truncated:
        result.mismatchedAccounts > MAX_DETAIL_ITEMS ||
        result.invalidTransactions > MAX_DETAIL_ITEMS,
    },
  };
}
