import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Account } from '../src/accounts/entities/account.entity.js';
import { setupApp } from '../src/app.setup.js';
import { AppModule } from '../src/app.module.js';
import { IdempotencyKey } from '../src/transactions/entities/idempotency-key.entity.js';
import { LedgerEntry } from '../src/transactions/entities/ledger-entry.entity.js';
import {
  Transaction,
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
  });

  afterEach(async () => {
    await withLedgerMaintenance(ownerDataSource, async (manager) => {
      await manager
        .createQueryBuilder()
        .delete()
        .from(IdempotencyKey)
        .where('user_id = :userId AND key LIKE :keyPrefix', {
          userId: senderUserId,
          keyPrefix: 'e2e-%',
        })
        .execute();
      await manager
        .createQueryBuilder()
        .delete()
        .from(LedgerEntry)
        .where(
          'transaction_id IN (SELECT id FROM transactions WHERE initiated_by = :userId AND type = :type AND description LIKE :description)',
          {
            userId: senderUserId,
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
          'initiated_by = :userId AND type = :type AND description LIKE :description',
          {
            userId: senderUserId,
            type: TransactionType.TRANSFER,
            description: 'E2E transfer:%',
          },
        )
        .execute();
      await manager.update(Account, sender.id, { balance: senderBalance });
      await manager.update(Account, recipient.id, {
        balance: recipientBalance,
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
});
