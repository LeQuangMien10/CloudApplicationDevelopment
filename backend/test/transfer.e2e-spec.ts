import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import {
  Account,
  AccountStatus,
} from '../src/accounts/entities/account.entity.js';
import { setupApp } from '../src/app.setup.js';
import { AppModule } from '../src/app.module.js';
import { IdempotencyKey } from '../src/transactions/entities/idempotency-key.entity.js';
import { LedgerEntry } from '../src/transactions/entities/ledger-entry.entity.js';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../src/transactions/entities/transaction.entity.js';
import { User } from '../src/users/entities/user.entity.js';
import {
  openOwnerDataSource,
  withLedgerMaintenance,
} from './support/owner-data-source.js';

describe('POST /api/transactions/transfer (DB thật)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let ownerDataSource: DataSource;
  let accessToken: string;
  let recipientToken: string;
  let sender: Account;
  let recipient: Account;
  let senderBalance: string;
  let recipientBalance: string;
  let senderUserId: string;

  const transferPath = '/api/transactions/transfer';
  const key = () => `e2e-${crypto.randomUUID()}`;
  const transferBody = (amount = '1000.50') => ({
    fromAccountId: sender.id,
    toAccountNumber: recipient.accountNumber,
    amount,
    description: 'E2E transfer: automated test',
  });
  const adjustBalance = (
    balance: string,
    amount: string,
    operator: 1n | -1n,
  ) => {
    const toMinorUnits = (value: string) => {
      const [whole, fraction = ''] = value.split('.');
      return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    };
    const minorUnits = toMinorUnits(balance) + operator * toMinorUnits(amount);
    return `${minorUnits / 100n}.${(minorUnits % 100n).toString().padStart(2, '0')}`;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();

    dataSource = app.get(DataSource);

    ownerDataSource = await openOwnerDataSource();
    const senderUser = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'an@example.com' });
    senderUserId = senderUser.id;
    sender = await dataSource
      .getRepository(Account)
      .findOneByOrFail({ userId: senderUser.id });
    recipient = await dataSource
      .getRepository(Account)
      .findOneByOrFail({ accountNumber: '100000000002' });
    senderBalance = sender.balance;
    recipientBalance = recipient.balance;

    accessToken = await app.get(JwtService).signAsync({
      sub: senderUser.id,
      role: senderUser.role,
    });
    const recipientUser = await dataSource
      .getRepository(User)
      .findOneByOrFail({ id: recipient.userId });
    recipientToken = await app.get(JwtService).signAsync({
      sub: recipientUser.id,
      role: recipientUser.role,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await withLedgerMaintenance(ownerDataSource, async (manager) => {
      await manager
        .createQueryBuilder()
        .delete()
        .from(IdempotencyKey)
        .where('user_id IN (:...userIds) AND key LIKE :keyPrefix', {
          userIds: [senderUserId, recipient.userId],
          keyPrefix: 'e2e-%',
        })
        .execute();
      await manager
        .createQueryBuilder()
        .delete()
        .from(LedgerEntry)
        .where(
          'transaction_id IN (SELECT id FROM transactions WHERE initiated_by IN (:...userIds) AND type = :type AND description LIKE :description)',
          {
            userIds: [senderUserId, recipient.userId],
            type: TransactionType.TRANSFER,
            description: 'E2E transfer:%',
          },
        )
        .execute();
      await manager
        .createQueryBuilder()
        .delete()
        .from(Transaction)
        .where(
          'initiated_by IN (:...userIds) AND type = :type AND description LIKE :description',
          {
            userIds: [senderUserId, recipient.userId],
            type: TransactionType.TRANSFER,
            description: 'E2E transfer:%',
          },
        )
        .execute();
      await manager.update(Account, sender.id, {
        balance: senderBalance,
        status: AccountStatus.ACTIVE,
      });
      await manager.update(Account, recipient.id, {
        balance: recipientBalance,
        status: AccountStatus.ACTIVE,
      });
    });
  });

  afterAll(async () => {
    await ownerDataSource.destroy();
    await app.close();
  });

  // 1. Chuyển tiền thành công
  it('1. chuyển tiền thành công và cập nhật chính xác hai số dư', async () => {
    const amount = '1000.50';
    const expectedSenderBalance = adjustBalance(senderBalance, amount, -1n);
    const expectedRecipientBalance = adjustBalance(
      recipientBalance,
      amount,
      1n,
    );
    const response = await request(app.getHttpServer())
      .post(transferPath)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', key())
      .send(transferBody(amount))
      .expect(201);

    expect(response.body).toMatchObject({
      message: 'Giao dịch thành công',
      newBalance: expectedSenderBalance,
      transaction: {
        amount,
        status: 'completed',
        fromAccountNumber: sender.accountNumber,
        toAccountNumber: recipient.accountNumber,
      },
    });

    await expect(
      dataSource.getRepository(Account).findOneByOrFail({ id: sender.id }),
    ).resolves.toMatchObject({ balance: expectedSenderBalance });
    await expect(
      dataSource.getRepository(Account).findOneByOrFail({ id: recipient.id }),
    ).resolves.toMatchObject({ balance: expectedRecipientBalance });

    const entries = await dataSource.getRepository(LedgerEntry).find({
      where: { transactionId: response.body.transaction.id },
      order: { direction: 'ASC' },
    });
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.direction)).toEqual([
      'debit',
      'credit',
    ]);
    expect(entries.map((entry) => entry.amount)).toEqual([amount, amount]);
    expect(
      entries.find((entry) => entry.accountId === sender.id),
    ).toMatchObject({
      direction: 'debit',
      balanceAfter: expectedSenderBalance,
    });
    expect(
      entries.find((entry) => entry.accountId === recipient.id),
    ).toMatchObject({
      direction: 'credit',
      balanceAfter: expectedRecipientBalance,
    });
  });

  // 1b. Sổ cái chỉ được ghi thêm, kể cả khi lộ credential của app
  it('1b. ledger_entries chỉ cho INSERT, không sửa/xóa được bằng user của app', async () => {
    const response = await request(app.getHttpServer())
      .post(transferPath)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', key())
      .send(transferBody())
      .expect(201);
    const transactionId = response.body.transaction.id;
    const updateAmount = (manager: DataSource['manager']) =>
      manager
        .createQueryBuilder()
        .update(LedgerEntry)
        .set({ amount: '1.00' })
        .where('transaction_id = :transactionId', { transactionId })
        .execute();
    const deleteDebit = (manager: DataSource['manager']) =>
      manager
        .createQueryBuilder()
        .delete()
        .from(LedgerEntry)
        .where('transaction_id = :transactionId AND direction = :direction', {
          transactionId,
          direction: 'debit',
        })
        .execute();
    const PERMISSION_DENIED = { code: '42501' };
    const APPEND_ONLY = { code: '55000' };

    // User của app: không có quyền, tự bật cờ bảo trì cũng vô ích
    await expect(updateAmount(dataSource.manager)).rejects.toMatchObject(
      PERMISSION_DENIED,
    );
    await expect(
      dataSource.transaction(async (manager) => {
        await manager.query(
          `SELECT set_config('app.ledger_maintenance', 'on', true)`,
        );
        await deleteDebit(manager);
      }),
    ).rejects.toMatchObject(PERMISSION_DENIED);
    await expect(
      dataSource.query('TRUNCATE ledger_entries CASCADE'),
    ).rejects.toMatchObject(PERMISSION_DENIED);

    // Owner không bật cờ bảo trì: trigger vẫn chặn, kể cả TRUNCATE
    await expect(updateAmount(ownerDataSource.manager)).rejects.toMatchObject(
      APPEND_ONLY,
    );
    await expect(
      ownerDataSource.transaction((manager) =>
        manager.query('TRUNCATE ledger_entries'),
      ),
    ).rejects.toMatchObject(APPEND_ONLY);

    // Owner bật cờ bảo trì: xóa một vế vẫn bị kiểm tra cân bằng chặn lúc commit
    await expect(
      withLedgerMaintenance(ownerDataSource, deleteDebit),
    ).rejects.toMatchObject({ code: '23514' });

    // User của app che bảng transactions bằng temp table cùng tên: hàm kiểm tra
    // vẫn đọc public.transactions nên transfer COMPLETED không có bút toán bị chặn
    await expect(
      dataSource.transaction(async (manager) => {
        await manager.query(
          'CREATE TEMP TABLE transactions (LIKE public.transactions) ON COMMIT DROP',
        );
        await manager.query(
          `INSERT INTO public.transactions
             (type, status, from_account_id, to_account_id, amount, description, initiated_by, completed_at)
           VALUES ('transfer', 'completed', $1, $2, 1, $3, $4, now())`,
          [sender.id, recipient.id, transferBody().description, senderUserId],
        );
      }),
    ).rejects.toMatchObject({ code: '23514' });

    await expect(
      dataSource.getRepository(LedgerEntry).countBy({ transactionId }),
    ).resolves.toBe(2);
  });

  // 2. Gửi lại trùng Idempotency-Key + trùng Payload
  it('2. gửi lại cùng idempotency key trả response đã lưu mà không trừ tiền lần hai', async () => {
    const idempotencyKey = key();
    const amount = '1000.50';
    const body = transferBody(amount);
    const expectedSenderBalance = adjustBalance(senderBalance, amount, -1n);

    const first = await request(app.getHttpServer())
      .post(transferPath)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(201);
    const retry = await request(app.getHttpServer())
      .post(transferPath)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(201);

    expect(retry.body).toEqual(first.body);
    await expect(
      dataSource.getRepository(Account).findOneByOrFail({ id: sender.id }),
    ).resolves.toMatchObject({ balance: expectedSenderBalance });
    await expect(
      dataSource.getRepository(LedgerEntry).countBy({
        transactionId: first.body.transaction.id,
      }),
    ).resolves.toBe(2);
  });

  // 3. Cùng Idempotency-Key + khác Payload (Đổi amount)
  it('3. từ chối cùng idempotency key với payload khác', async () => {
    const idempotencyKey = key();

    await request(app.getHttpServer())
      .post(transferPath)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(transferBody())
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(transferPath)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(transferBody('1000.51'))
      .expect(409);

    expect(response.body.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  // 4. Số dư không đủ
  it('4. từ chối khi số dư không đủ và không thay đổi số dư', async () => {
    const response = await request(app.getHttpServer())
      .post(transferPath)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', key())
      .send(transferBody('10000000.01'))
      .expect(422);

    expect(response.body.code).toBe('INSUFFICIENT_FUNDS');
    await expect(
      dataSource.getRepository(Account).findOneByOrFail({ id: sender.id }),
    ).resolves.toMatchObject({ balance: senderBalance });
  });

  // 5. Tài khoản nguồn không thuộc User trong JWT
  it('5. từ chối tài khoản nguồn không thuộc user hiện tại', async () => {
    const response = await request(app.getHttpServer())
      .post(transferPath)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', key())
      .send({
        ...transferBody(),
        fromAccountId: recipient.id,
      })
      .expect(404);

    expect(response.body.code).toBe('SENDER_ACCOUNT_NOT_FOUND');
  });

  // 6. Chuyển tiền cho chính tài khoản nguồn
  it('6. từ chối khi chuyển tiền cho chính tài khoản nguồn', async () => {
    const response = await request(app.getHttpServer())
      .post(transferPath)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', key())
      .send({
        ...transferBody(),
        toAccountNumber: sender.accountNumber,
      })
      .expect(422);

    expect(response.body.code).toBe('SAME_ACCOUNT');
  });

  // 7. Thiếu Idempotency-Key trong Header
  it('7.từ chối khi thiếu Idempotency-Key header', async () => {
    const response = await request(app.getHttpServer())
      .post(transferPath)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(transferBody())
      .expect(400);

    expect(response.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  // 8. Số tiền chuyển không hợp lệ (<= 0)
  it('8. từ chối khi số tiền âm hoặc bằng 0', async () => {
    const response = await request(app.getHttpServer())
      .post(transferPath)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', key())
      .send(transferBody('0'))
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  // 9. Không gửi JWT Token (Chưa đăng nhập)
  it('9. từ chối khi không cung cấp Authorization header', async () => {
    await request(app.getHttpServer())
      .post(transferPath)
      .set('Idempotency-Key', key())
      .send(transferBody())
      .expect(401);
  });

  describe('F4. lưu giao dịch failed', () => {
    const send = (idempotencyKey: string, body: object) =>
      request(app.getHttpServer())
        .post(transferPath)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(body);
    // Lọc theo description của test để không đếm nhầm dữ liệu có sẵn trong DB
    const failedTransfers = () =>
      dataSource.getRepository(Transaction).findBy({
        fromAccountId: sender.id,
        status: TransactionStatus.FAILED,
        description: transferBody().description,
      });
    const auditActions = async (transactionId: string) =>
      (
        (await dataSource.query(
          'SELECT action FROM audit_logs WHERE target_id = $1',
          [transactionId],
        )) as { action: string }[]
      ).map((row) => row.action);

    it('10. số dư không đủ: lưu failed kèm failure_reason, không ghi sổ cái, không đổi số dư', async () => {
      const idempotencyKey = key();
      const amount = '10000000.01';

      const response = await send(idempotencyKey, transferBody(amount)).expect(
        422,
      );
      expect(response.body.code).toBe('INSUFFICIENT_FUNDS');

      const failed = await failedTransfers();
      expect(failed).toHaveLength(1);
      expect(failed[0]).toMatchObject({
        type: TransactionType.TRANSFER,
        toAccountId: recipient.id,
        amount,
        failureReason: 'INSUFFICIENT_FUNDS',
        initiatedBy: senderUserId,
        completedAt: null,
      });
      await expect(
        dataSource
          .getRepository(LedgerEntry)
          .countBy({ transactionId: failed[0].id }),
      ).resolves.toBe(0);
      await expect(
        dataSource.getRepository(Account).findOneByOrFail({ id: sender.id }),
      ).resolves.toMatchObject({ balance: senderBalance });
      await expect(
        dataSource.getRepository(Account).findOneByOrFail({ id: recipient.id }),
      ).resolves.toMatchObject({ balance: recipientBalance });

      await expect(
        dataSource
          .getRepository(IdempotencyKey)
          .findOneByOrFail({ userId: senderUserId, key: idempotencyKey }),
      ).resolves.toMatchObject({
        transactionId: failed[0].id,
        responseCode: 422,
        responseBody: { code: 'INSUFFICIENT_FUNDS' },
      });
      await expect(auditActions(failed[0].id)).resolves.toEqual([
        'transfer_failed',
      ]);
    });

    it('11. gửi lại cùng key sau khi thất bại: trả lại đúng lỗi 422, không sinh thêm bản ghi', async () => {
      const idempotencyKey = key();
      const body = transferBody('10000000.01');

      const first = await send(idempotencyKey, body).expect(422);
      const retry = await send(idempotencyKey, body).expect(422);
      expect(retry.body).toMatchObject({
        code: first.body.code,
        message: first.body.message,
      });

      // Cùng key nhưng khác nội dung vẫn là 409
      const conflict = await send(idempotencyKey, transferBody('1.00')).expect(
        409,
      );
      expect(conflict.body.code).toBe('IDEMPOTENCY_CONFLICT');

      await expect(failedTransfers()).resolves.toHaveLength(1);
    });

    it.each([
      ['nguồn', 'SENDER_ACCOUNT_NOT_ACTIVE', () => sender.id],
      ['đích', 'TARGET_ACCOUNT_NOT_ACTIVE', () => recipient.id],
    ])(
      '12. tài khoản %s bị đóng băng: lưu failed với %s',
      async (_side, code, frozenAccountId) => {
        await dataSource
          .getRepository(Account)
          .update(frozenAccountId(), { status: AccountStatus.FROZEN });

        const response = await send(key(), transferBody()).expect(422);
        expect(response.body.code).toBe(code);

        const failed = await failedTransfers();
        expect(failed).toHaveLength(1);
        expect(failed[0].failureReason).toBe(code);
      },
    );

    it('13. không lưu failed khi lỗi validate, sai chủ tài khoản, chuyển cho chính mình, đích không tồn tại', async () => {
      await send(key(), transferBody('0')).expect(400);
      await send(key(), {
        ...transferBody(),
        fromAccountId: recipient.id,
      }).expect(404);
      await send(key(), {
        ...transferBody(),
        toAccountNumber: sender.accountNumber,
      }).expect(422);
      await send(key(), {
        ...transferBody(),
        toAccountNumber: '999999999999',
      }).expect(404);

      await expect(
        dataSource.getRepository(Transaction).countBy({
          initiatedBy: senderUserId,
          description: transferBody().description,
        }),
      ).resolves.toBe(0);
    });

    it('14. lịch sử: bên gửi thấy giao dịch failed, bên nhận không thấy', async () => {
      await send(key(), transferBody('10000000.01')).expect(422);
      const [failed] = await failedTransfers();

      const senderHistory = await request(app.getHttpServer())
        .get(`/api/transactions?accountId=${sender.id}&limit=100`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(
        senderHistory.body.transactions.find(
          (tx: { id: string }) => tx.id === failed.id,
        ),
      ).toMatchObject({
        status: 'failed',
        failureReason: 'INSUFFICIENT_FUNDS',
      });
      await request(app.getHttpServer())
        .get(`/api/transactions/${failed.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const recipientHistory = await request(app.getHttpServer())
        .get(`/api/transactions?accountId=${recipient.id}&limit=100`)
        .set('Authorization', `Bearer ${recipientToken}`)
        .expect(200);
      expect(
        recipientHistory.body.transactions.map((tx: { id: string }) => tx.id),
      ).not.toContain(failed.id);
      const detail = await request(app.getHttpServer())
        .get(`/api/transactions/${failed.id}`)
        .set('Authorization', `Bearer ${recipientToken}`)
        .expect(404);
      expect(detail.body.code).toBe('TRANSACTION_NOT_FOUND');
    });

    it('15. lưu bản ghi failed bị lỗi: client vẫn nhận 422 gốc', async () => {
      vi.spyOn(dataSource, 'transaction').mockRejectedValueOnce(
        new Error('Simulated DB failure'),
      );

      const response = await send(key(), transferBody('10000000.01')).expect(
        422,
      );
      expect(response.body.code).toBe('INSUFFICIENT_FUNDS');
      await expect(failedTransfers()).resolves.toHaveLength(0);
    });

    // Bản ghi failed B→A khóa tài khoản qua khóa ngoại. Nếu khóa sai thứ tự
    // với lệnh A→B đang chạy thì Postgres hủy một bên vì deadlock (500)
    it('17. lệnh thành công và lệnh thất bại chạy chéo chiều đồng thời không bị deadlock', async () => {
      const ROUNDS = 5;
      const PER_DIRECTION = 10;
      const sendAs = (token: string, body: object) =>
        request(app.getHttpServer())
          .post(transferPath)
          .set('Authorization', `Bearer ${token}`)
          .set('Idempotency-Key', key())
          .send(body);
      const failingBody = {
        fromAccountId: recipient.id,
        toAccountNumber: sender.accountNumber,
        amount: '9999999999999999.99',
        description: transferBody().description,
      };

      for (let round = 0; round < ROUNDS; round++) {
        const responses = await Promise.all(
          Array.from({ length: PER_DIRECTION }, () => [
            sendAs(accessToken, transferBody('1.00')),
            sendAs(recipientToken, failingBody),
          ]).flat(),
        );
        expect(responses.filter((r) => ![201, 422].includes(r.status))).toEqual(
          [],
        );
      }

      await expect(
        dataSource.getRepository(Transaction).countBy({
          fromAccountId: recipient.id,
          status: TransactionStatus.FAILED,
          description: transferBody().description,
        }),
      ).resolves.toBe(ROUNDS * PER_DIRECTION);
    }, 60_000);

    it('16. chuyển tiền thành công ghi audit log transfer_completed', async () => {
      const response = await send(key(), transferBody()).expect(201);

      await expect(auditActions(response.body.transaction.id)).resolves.toEqual(
        ['transfer_completed'],
      );
    });
  });
});
