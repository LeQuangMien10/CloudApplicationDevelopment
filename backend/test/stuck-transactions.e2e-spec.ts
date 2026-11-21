import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Account } from '../src/accounts/entities/account.entity.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import {
  ReconciliationTrigger,
  TransactionProblem,
} from '../src/reconciliation/entities/reconciliation-report.entity.js';
import { ReconciliationService } from '../src/reconciliation/reconciliation.service.js';
import {
  PROCESSING_TIMEOUT_CODE,
  StuckTransactionsService,
} from '../src/reconciliation/stuck-transactions.service.js';
import {
  openOwnerDataSource,
  withLedgerMaintenance,
} from './support/owner-data-source.js';

// Cần PostgreSQL đã migration và seed: docker compose up -d db && npm run seed
describe('Quét giao dịch treo (e2e)', () => {
  let app: INestApplication;
  let owner: DataSource;
  let stuck: StuckTransactionsService;
  let reconciliation: ReconciliationService;
  let an: Account;
  let binh: Account;

  const DESCRIPTION = 'E2E stuck: processing';
  const KEY_PREFIX = 'e2e-stuck-';
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

  /** Giả lập service chết giữa chừng: dòng processing kèm Idempotency-Key chưa có response. */
  async function insertProcessing(createdAt: Date) {
    const [{ id }] = (await owner.query(
      `INSERT INTO transactions (type, status, from_account_id, to_account_id, amount, description, initiated_by, created_at)
       VALUES ('transfer', 'processing', $1, $2, 5.00, $3, $4, $5)
       RETURNING id`,
      [an.id, binh.id, DESCRIPTION, an.userId, createdAt],
    )) as { id: string }[];
    await owner.query(
      `INSERT INTO idempotency_keys (user_id, key, request_hash, transaction_id, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '1 day')`,
      [an.userId, `${KEY_PREFIX}${crypto.randomUUID()}`, '0'.repeat(64), id],
    );
    return id;
  }

  const statusOf = async (id: string) =>
    (
      (await owner.query(
        `SELECT status, failure_reason AS "failureReason", completed_at AS "completedAt" FROM transactions WHERE id = $1`,
        [id],
      )) as { status: string; failureReason: string | null; completedAt: Date | null }[]
    )[0];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
    owner = await openOwnerDataSource();
    stuck = app.get(StuckTransactionsService);
    reconciliation = app.get(ReconciliationService);

    const accounts = app.get(DataSource).getRepository(Account);
    an = await accounts.findOneByOrFail({ accountNumber: '100000000001' });
    binh = await accounts.findOneByOrFail({ accountNumber: '100000000002' });
  });

  afterEach(async () => {
    await withLedgerMaintenance(owner, async (m) => {
      const ids = `SELECT id FROM transactions WHERE description = '${DESCRIPTION}'`;
      await m.query(`DELETE FROM idempotency_keys WHERE key LIKE '${KEY_PREFIX}%'`);
      await m.query(`DELETE FROM ledger_entries WHERE transaction_id IN (${ids})`);
      await m.query(`DELETE FROM transactions WHERE description = '${DESCRIPTION}'`);
    });
  });

  afterAll(async () => {
    await owner.destroy();
    await app.close();
  });

  it('1. treo quá 15 phút, chưa có sổ cái: chuyển failed, Idempotency-Key trả 422, ghi audit log', async () => {
    const id = await insertProcessing(minutesAgo(20));

    const result = await stuck.resolve();
    expect(result.failed).toContain(id);
    expect(result.needsReview).not.toContain(id);

    await expect(statusOf(id)).resolves.toEqual({
      status: 'failed',
      failureReason: PROCESSING_TIMEOUT_CODE,
      completedAt: null,
    });

    const [key] = (await owner.query(
      `SELECT response_code AS code, response_body AS body FROM idempotency_keys WHERE transaction_id = $1`,
      [id],
    )) as { code: number; body: { code: string } }[];
    expect(key).toEqual({
      code: 422,
      body: expect.objectContaining({ code: PROCESSING_TIMEOUT_CODE }),
    });

    const audit = (await owner.query(
      `SELECT actor_id, actor_role FROM audit_logs WHERE action = 'transaction_timed_out' AND target_id = $1`,
      [id],
    )) as { actor_id: string | null; actor_role: string }[];
    expect(audit).toEqual([{ actor_id: null, actor_role: 'system' }]);

    // Sau khi xử lý, đối soát không còn báo giao dịch này
    const report = await reconciliation.run({
      trigger: ReconciliationTrigger.SCHEDULED,
    });
    expect(
      report.details.transactionMismatches.map((m) => m.transactionId),
    ).not.toContain(id);
    await owner.query(`DELETE FROM reconciliation_reports WHERE id = $1`, [
      report.id,
    ]);
  });

  it('2. mới processing 5 phút: chưa coi là treo, giữ nguyên', async () => {
    const id = await insertProcessing(minutesAgo(5));

    const result = await stuck.resolve();
    expect(result.failed).not.toContain(id);
    await expect(statusOf(id)).resolves.toMatchObject({ status: 'processing' });
  });

  it('3. treo nhưng đã có dòng sổ cái: không tự sửa, báo cần kiểm tra tay, đối soát cũng báo', async () => {
    const id = await insertProcessing(minutesAgo(20));
    await owner.query(
      `INSERT INTO ledger_entries (transaction_id, account_id, direction, amount, balance_after)
       VALUES ($1, $2, 'debit', 5.00, 0), ($1, $3, 'credit', 5.00, 0)`,
      [id, an.id, binh.id],
    );

    const result = await stuck.resolve();
    expect(result.needsReview).toContain(id);
    expect(result.failed).not.toContain(id);
    await expect(statusOf(id)).resolves.toMatchObject({ status: 'processing' });

    const report = await reconciliation.run({
      trigger: ReconciliationTrigger.SCHEDULED,
    });
    expect(report.details.transactionMismatches).toContainEqual(
      expect.objectContaining({
        transactionId: id,
        problem: TransactionProblem.LEDGER_ON_NOT_COMPLETED,
      }),
    );
    await owner.query(`DELETE FROM reconciliation_reports WHERE id = $1`, [
      report.id,
    ]);
  });

  it('4. giao dịch đang bị tiến trình khác giữ khóa thì bỏ qua, lần chạy sau mới xử lý', async () => {
    const id = await insertProcessing(minutesAgo(20));

    const holder = owner.createQueryRunner();
    await holder.connect();
    await holder.startTransaction();
    try {
      await holder.query(`SELECT id FROM transactions WHERE id = $1 FOR UPDATE`, [id]);
      const whileLocked = await stuck.resolve();
      expect(whileLocked.failed).not.toContain(id);
    } finally {
      await holder.rollbackTransaction();
      await holder.release();
    }

    const afterRelease = await stuck.resolve();
    expect(afterRelease.failed).toContain(id);
  });
});
