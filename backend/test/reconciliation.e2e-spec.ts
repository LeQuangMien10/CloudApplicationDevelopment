import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { SYSTEM_ACCOUNT_NUMBER } from '../src/accounts/account-number.util.js';
import { Account } from '../src/accounts/entities/account.entity.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import {
  ReconciliationStatus,
  ReconciliationTrigger,
  TransactionProblem,
} from '../src/reconciliation/entities/reconciliation-report.entity.js';
import { ReconciliationService } from '../src/reconciliation/reconciliation.service.js';
import { User } from '../src/users/entities/user.entity.js';
import {
  openOwnerDataSource,
  withLedgerMaintenance,
} from './support/owner-data-source.js';

// Cần PostgreSQL đã migration và seed: docker compose up -d db && npm run seed
describe('Đối soát (F7, e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let owner: DataSource;
  let reconciliation: ReconciliationService;
  const tokens: Record<string, string> = {};
  let adminId: string;
  let an: Account;
  let binh: Account;
  let system: Account;
  /** Giờ của DB lúc bắt đầu, để dọn báo cáo do file test này tạo */
  let startedAt: Date;

  const DESCRIPTION_PREFIX = 'E2E reconciliation:';
  const KEY_PREFIX = 'e2e-recon-';

  const api = () => request(app.getHttpServer());
  const runAsAdmin = () =>
    api()
      .post('/api/reconciliation/run')
      .set('Authorization', `Bearer ${tokens.admin}`);
  const runScheduled = () =>
    reconciliation.run({ trigger: ReconciliationTrigger.SCHEDULED });

  /** Sửa thẳng số dư bằng owner để giả lập lệch, luôn trả lại như cũ sau fn. */
  async function withBalanceDelta(
    deltas: [Account, string][],
    fn: () => Promise<void>,
  ) {
    const shift = (sign: 1 | -1) =>
      Promise.all(
        deltas.map(([acc, delta]) =>
          owner.query(
            `UPDATE accounts SET balance = balance + ($1::numeric * $2) WHERE id = $3`,
            [delta, sign, acc.id],
          ),
        ),
      );
    await shift(1);
    try {
      await fn();
    } finally {
      await shift(-1);
    }
  }

  /** Chèn một giao dịch không có dòng sổ cái nào bằng owner, xóa sau fn. */
  async function withOrphanTransaction(
    values: { type: string; status: string; createdAt?: string },
    fn: (id: string) => Promise<void>,
  ) {
    const [{ id }] = (await owner.query(
      `INSERT INTO transactions (type, status, from_account_id, to_account_id, amount, description, created_at)
       VALUES ($1, $2, $3, $4, 5.00, $5, COALESCE($6::timestamptz, now()))
       RETURNING id`,
      [
        values.type,
        values.status,
        system.id,
        an.id,
        `${DESCRIPTION_PREFIX} orphan`,
        values.createdAt ?? null,
      ],
    )) as { id: string }[];
    try {
      await fn(id);
    } finally {
      await owner.query(`DELETE FROM transactions WHERE id = $1`, [id]);
    }
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
    dataSource = app.get(DataSource);
    reconciliation = app.get(ReconciliationService);
    owner = await openOwnerDataSource();
    [{ now: startedAt }] = (await owner.query(`SELECT now() AS now`)) as {
      now: Date;
    }[];

    const jwt = app.get(JwtService);
    for (const [name, email] of [
      ['admin', 'admin@bank.local'],
      ['auditor', 'auditor@bank.local'],
      ['operator', 'operator@bank.local'],
      ['customer', 'an@example.com'],
      ['binh', 'binh@example.com'],
    ]) {
      const user = await dataSource.getRepository(User).findOneByOrFail({ email });
      tokens[name] = await jwt.signAsync({ sub: user.id, role: user.role });
      if (name === 'admin') adminId = user.id;
    }
    const accounts = dataSource.getRepository(Account);
    an = await accounts.findOneByOrFail({ accountNumber: '100000000001' });
    binh = await accounts.findOneByOrFail({ accountNumber: '100000000002' });
    system = await accounts.findOneByOrFail({
      accountNumber: SYSTEM_ACCOUNT_NUMBER,
    });
  });

  afterAll(async () => {
    await owner.query(`DELETE FROM reconciliation_reports WHERE run_at >= $1`, [
      startedAt,
    ]);
    await owner.destroy();
    await app.close();
  });

  describe('phân quyền', () => {
    it('chưa đăng nhập trả 401', async () => {
      await api().get('/api/reconciliation/reports').expect(401);
      await api().post('/api/reconciliation/run').expect(401);
    });

    it('customer và operator không xem được báo cáo', async () => {
      for (const role of ['customer', 'operator']) {
        const res = await api()
          .get('/api/reconciliation/reports')
          .set('Authorization', `Bearer ${tokens[role]}`)
          .expect(403);
        expect(res.body.code).toBe('FORBIDDEN');
      }
    });

    it('auditor xem được nhưng không chạy được đối soát', async () => {
      await api()
        .get('/api/reconciliation/reports')
        .set('Authorization', `Bearer ${tokens.auditor}`)
        .expect(200);
      await api()
        .post('/api/reconciliation/run')
        .set('Authorization', `Bearer ${tokens.auditor}`)
        .expect(403);
    });
  });

  it('1. dữ liệu đúng: admin chạy tay ra ok, lưu báo cáo và ghi audit log', async () => {
    const [{ count }] = (await owner.query(
      `SELECT count(*)::int AS count FROM accounts`,
    )) as { count: number }[];

    const res = await runAsAdmin().expect(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      trigger: 'manual',
      triggeredBy: adminId,
      status: 'ok',
      accountsChecked: count,
      mismatchedAccounts: 0,
      totalBalance: '0.00',
      invalidTransactions: 0,
      details: {
        accountMismatches: [],
        transactionMismatches: [],
        truncated: false,
      },
    });
    expect(res.body.transactionsChecked).toBeGreaterThan(0);

    const audit = (await owner.query(
      `SELECT actor_id, metadata FROM audit_logs WHERE action = 'reconciliation_run' AND target_id = $1`,
      [res.body.id],
    )) as { actor_id: string; metadata: { status: string } }[];
    expect(audit).toEqual([
      { actor_id: adminId, metadata: expect.objectContaining({ status: 'ok' }) },
    ]);

    // Auditor đọc lại được đúng báo cáo vừa chạy
    const detail = await api()
      .get(`/api/reconciliation/reports/${res.body.id}`)
      .set('Authorization', `Bearer ${tokens.auditor}`)
      .expect(200);
    expect(detail.body).toMatchObject({ id: res.body.id, status: 'ok' });

    const list = await api()
      .get('/api/reconciliation/reports?status=ok&limit=5')
      .set('Authorization', `Bearer ${tokens.auditor}`)
      .expect(200);
    expect(list.body.items[0].id).toBe(res.body.id);
  });

  it('2. hai tài khoản lệch bù trừ nhau: tổng vẫn bằng 0 nhưng vẫn phát hiện từng tài khoản', async () => {
    await withBalanceDelta(
      [
        [an, '1.00'],
        [binh, '-1.00'],
      ],
      async () => {
        const report = await runScheduled();
        expect(report).toMatchObject({
          trigger: ReconciliationTrigger.SCHEDULED,
          triggeredBy: null,
          status: ReconciliationStatus.MISMATCH,
          mismatchedAccounts: 2,
          totalBalance: '0.00',
        });
        const byNumber = Object.fromEntries(
          report.details.accountMismatches.map((m) => [m.accountNumber, m]),
        );
        expect(byNumber[an.accountNumber]).toMatchObject({
          accountId: an.id,
          lastBalanceAfter: byNumber[an.accountNumber].ledgerBalance,
        });
        // Số dư trong bảng lệch đúng 1.00 so với sổ cái
        expect(
          Number(byNumber[an.accountNumber].balance) -
            Number(byNumber[an.accountNumber].ledgerBalance),
        ).toBeCloseTo(1);
        expect(byNumber[binh.accountNumber]).toBeDefined();
      },
    );
  });

  it('3. tiền tự sinh ra ở một tài khoản: tổng số dư khác 0', async () => {
    await withBalanceDelta([[an, '1.00']], async () => {
      const report = await runScheduled();
      expect(report).toMatchObject({
        status: ReconciliationStatus.MISMATCH,
        mismatchedAccounts: 1,
        totalBalance: '1.00',
      });
    });
  });

  it('4. giao dịch completed không có sổ cái (nạp tiền, DB không chặn lúc commit) bị phát hiện', async () => {
    await withOrphanTransaction(
      { type: 'deposit', status: 'completed' },
      async (id) => {
        const report = await runScheduled();
        expect(report.status).toBe(ReconciliationStatus.MISMATCH);
        expect(report.invalidTransactions).toBe(1);
        expect(report.details.transactionMismatches).toEqual([
          {
            transactionId: id,
            type: 'deposit',
            status: 'completed',
            amount: '5.00',
            entryCount: 0,
            problem: TransactionProblem.LEDGER_MISSING_OR_UNBALANCED,
          },
        ]);
      },
    );
  });

  it('5. giao dịch processing quá 15 phút bị báo treo, mới tạo thì chưa', async () => {
    await withOrphanTransaction(
      { type: 'transfer', status: 'processing' },
      async () => {
        await expect(runScheduled()).resolves.toMatchObject({
          status: ReconciliationStatus.OK,
        });
      },
    );
    await withOrphanTransaction(
      {
        type: 'transfer',
        status: 'processing',
        createdAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      },
      async (id) => {
        const report = await runScheduled();
        expect(report.details.transactionMismatches).toEqual([
          expect.objectContaining({
            transactionId: id,
            problem: TransactionProblem.STUCK_PROCESSING,
          }),
        ]);
      },
    );
  });

  it('6. đang có lần đối soát khác chạy thì trả 409 RECONCILIATION_IN_PROGRESS', async () => {
    const runner = owner.createQueryRunner();
    await runner.connect();
    try {
      await runner.query(`SELECT pg_advisory_lock(7007001)`);
      const res = await runAsAdmin().expect(409);
      expect(res.body.code).toBe('RECONCILIATION_IN_PROGRESS');
    } finally {
      await runner.query(`SELECT pg_advisory_unlock(7007001)`);
      await runner.release();
    }
  });

  it('7. user của app không sửa, xóa được báo cáo đã lưu', async () => {
    const report = await runScheduled();
    await expect(
      dataSource.query(
        `UPDATE reconciliation_reports SET status = 'ok' WHERE id = $1`,
        [report.id],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      dataSource.query(`DELETE FROM reconciliation_reports WHERE id = $1`, [
        report.id,
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it('8. đối soát chạy song song với chuyển tiền không báo lệch giả', async () => {
    const before = { an: an.balance, binh: binh.balance };
    const transfer = (from: Account, to: Account, token: string, i: number) =>
      api()
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `${KEY_PREFIX}${crypto.randomUUID()}`)
        .send({
          fromAccountId: from.id,
          toAccountNumber: to.accountNumber,
          amount: '1.00',
          description: `${DESCRIPTION_PREFIX} ${i}`,
        });

    try {
      const transfers = Array.from({ length: 20 }, (_, i) =>
        i % 2 === 0
          ? transfer(an, binh, tokens.customer, i)
          : transfer(binh, an, tokens.binh, i),
      );
      const runs = Array.from({ length: 5 }, () => runScheduled());
      const [transferResults, reports] = await Promise.all([
        Promise.all(transfers),
        Promise.allSettled(runs),
      ]);

      expect(transferResults.every((r) => r.status === 201)).toBe(true);
      const finished = reports.flatMap((r) =>
        r.status === 'fulfilled' ? [r.value] : [],
      );
      // Lần chạy trùng thời điểm có thể bị từ chối do khóa, nhưng lần nào chạy xong đều phải ok
      expect(finished.length).toBeGreaterThan(0);
      for (const report of finished) {
        expect(report.status).toBe(ReconciliationStatus.OK);
      }
      await expect(runScheduled()).resolves.toMatchObject({
        status: ReconciliationStatus.OK,
      });
    } finally {
      await withLedgerMaintenance(owner, async (m) => {
        const ids = `SELECT id FROM transactions WHERE description LIKE '${DESCRIPTION_PREFIX}%'`;
        // outbox_events có từ F5; dọn nếu bảng đã tồn tại
        await m.query(`
          DO $$ BEGIN
            IF to_regclass('outbox_events') IS NOT NULL THEN
              EXECUTE $q$DELETE FROM outbox_events WHERE payload->>'transactionId' IN
                (SELECT id::text FROM transactions WHERE description LIKE '${DESCRIPTION_PREFIX}%')$q$;
            END IF;
          END $$;
        `);
        await m.query(
          `DELETE FROM idempotency_keys WHERE key LIKE '${KEY_PREFIX}%'`,
        );
        await m.query(`DELETE FROM ledger_entries WHERE transaction_id IN (${ids})`);
        await m.query(
          `DELETE FROM transactions WHERE description LIKE '${DESCRIPTION_PREFIX}%'`,
        );
        await m.update(Account, an.id, { balance: before.an });
        await m.update(Account, binh.id, { balance: before.binh });
      });
    }
  }, 60_000);
});
