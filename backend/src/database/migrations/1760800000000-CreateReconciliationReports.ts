import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F7 Phase 2: bảng reconciliation_reports, kết quả mỗi lần đối soát số dư với sổ cái.
 *
 * - Báo cáo là bằng chứng cho auditor nên banking_app chỉ có SELECT, INSERT:
 *   lộ credential của app cũng không sửa được kết quả đối soát cũ.
 * - details chỉ giữ tối đa 100 tài khoản và 100 giao dịch lệch (cờ truncated),
 *   các cột đếm luôn là số đầy đủ.
 * - run_at là thời điểm bắt đầu transaction đối soát, cũng là thời điểm của snapshot dữ liệu.
 */
export class CreateReconciliationReports1760800000000 implements MigrationInterface {
  name = 'CreateReconciliationReports1760800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE reconciliation_reports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        trigger varchar(20) NOT NULL,
        triggered_by uuid REFERENCES users(id) ON DELETE SET NULL,
        status varchar(20) NOT NULL,
        accounts_checked integer NOT NULL,
        mismatched_accounts integer NOT NULL,
        total_balance numeric(18,2) NOT NULL,
        transactions_checked integer NOT NULL,
        invalid_transactions integer NOT NULL,
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        duration_ms integer NOT NULL,
        run_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_reconciliation_reports_status CHECK (status IN ('ok', 'mismatch')),
        CONSTRAINT chk_reconciliation_reports_trigger CHECK (trigger IN ('scheduled', 'manual')),
        CONSTRAINT chk_reconciliation_reports_counts_non_negative CHECK (accounts_checked >= 0 AND mismatched_accounts >= 0 AND transactions_checked >= 0 AND invalid_transactions >= 0 AND duration_ms >= 0)
      );
    `);

    await q.query(
      `CREATE INDEX idx_reconciliation_reports_run_at ON reconciliation_reports (run_at DESC)`,
    );

    await q.query(`REVOKE ALL ON reconciliation_reports FROM PUBLIC`);
    await q.query(`GRANT SELECT, INSERT ON reconciliation_reports TO banking_app`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`REVOKE ALL ON reconciliation_reports FROM banking_app`);
    await q.query(`DROP TABLE reconciliation_reports`);
  }
}
