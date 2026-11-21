import {
  ReconciliationStatus,
  TransactionProblem,
} from './entities/reconciliation-report.entity.js';
import {
  MAX_DETAIL_ITEMS,
  type ReconciliationCheckResult,
  summarizeReconciliation,
} from './reconciliation.summary.js';

describe('summarizeReconciliation', () => {
  const clean: ReconciliationCheckResult = {
    accountsChecked: 4,
    totalBalance: '0.00',
    totalBalanceIsZero: true,
    mismatchedAccounts: 0,
    accountMismatches: [],
    transactionsChecked: 10,
    invalidTransactions: 0,
    transactionMismatches: [],
  };
  const account = (i: number) => ({
    accountId: `acc-${i}`,
    accountNumber: String(100000000000 + i),
    balance: '10.00',
    ledgerBalance: '9.00',
    lastBalanceAfter: '9.00',
  });

  it('cả 3 kiểm tra đạt thì ok, details rỗng', () => {
    expect(summarizeReconciliation(clean)).toEqual({
      status: ReconciliationStatus.OK,
      details: {
        accountMismatches: [],
        transactionMismatches: [],
        truncated: false,
      },
    });
  });

  it('tổng số dư khác 0 thì mismatch dù từng tài khoản đều khớp', () => {
    const summary = summarizeReconciliation({
      ...clean,
      totalBalance: '1.00',
      totalBalanceIsZero: false,
    });
    expect(summary.status).toBe(ReconciliationStatus.MISMATCH);
  });

  it('có tài khoản lệch thì mismatch dù tổng số dư bằng 0', () => {
    const summary = summarizeReconciliation({
      ...clean,
      mismatchedAccounts: 1,
      accountMismatches: [account(1)],
    });
    expect(summary.status).toBe(ReconciliationStatus.MISMATCH);
    expect(summary.details.accountMismatches).toHaveLength(1);
  });

  it('có giao dịch sai sổ cái thì mismatch', () => {
    const summary = summarizeReconciliation({
      ...clean,
      invalidTransactions: 1,
      transactionMismatches: [
        {
          transactionId: 'tx-1',
          type: 'deposit',
          status: 'completed',
          amount: '5.00',
          entryCount: 0,
          problem: TransactionProblem.LEDGER_MISSING_OR_UNBALANCED,
        },
      ],
    });
    expect(summary.status).toBe(ReconciliationStatus.MISMATCH);
  });

  it('quá giới hạn thì chỉ giữ MAX_DETAIL_ITEMS mục và bật truncated', () => {
    const many = Array.from({ length: MAX_DETAIL_ITEMS + 5 }, (_, i) =>
      account(i),
    );
    const summary = summarizeReconciliation({
      ...clean,
      mismatchedAccounts: many.length,
      accountMismatches: many,
    });
    expect(summary.details.accountMismatches).toHaveLength(MAX_DETAIL_ITEMS);
    expect(summary.details.truncated).toBe(true);
  });
});
