// test/transfer-rollback.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource, Repository, ObjectLiteral } from 'typeorm';
import { vi } from 'vitest';
import { Account } from '../src/accounts/entities/account.entity.js';
import { setupApp } from '../src/app.setup.js';
import { AppModule } from '../src/app.module.js';
import { IdempotencyKey } from '../src/transactions/entities/idempotency-key.entity.js';
import { Transaction, TransactionType } from '../src/transactions/entities/transaction.entity.js';
import { User } from '../src/users/entities/user.entity.js';

describe('POST /api/transactions/transfer - rollback khi lỗi giữa chừng', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let sender: Account;
  let recipient: Account;
  let senderBalance: string;
  let recipientBalance: string;
  let senderUserId: string;

  const transferPath = '/api/transactions/transfer';
  const key = () => `e2e-${randomUUID()}`;
  const body = () => ({
    fromAccountId: sender.id,
    toAccountNumber: recipient.accountNumber,
    amount: '1000.50',
    description: 'E2E transfer: rollback test',
  });
  const send = (idempotencyKey: string) =>
    request(app.getHttpServer())
      .post(transferPath)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body());

  // Lấy bản save gốc trước khi bị spy
  const originalSave = Repository.prototype.save;

  // Làm save() throw khi entity đang lưu là `target`
  const failSaveOn = (target: unknown) =>
    vi
      .spyOn(Repository.prototype, 'save')
      .mockImplementation(function (this: Repository<ObjectLiteral>, ...args: unknown[]) {
        if (this.metadata.target === target) {
          throw new Error('Simulated DB failure');
        }
        return (originalSave as Function).apply(this, args);
      });

  // Kiểm tra DB trở về đúng trạng thái ban đầu
  const expectNothingPersisted = async (idempotencyKey: string) => {
    await expect(
      dataSource.getRepository(Account).findOneByOrFail({ id: sender.id }),
    ).resolves.toMatchObject({ balance: senderBalance });
    await expect(
      dataSource.getRepository(Account).findOneByOrFail({ id: recipient.id }),
    ).resolves.toMatchObject({ balance: recipientBalance });

    expect(
      await dataSource.getRepository(Transaction).countBy({
        initiatedBy: senderUserId,
        type: TransactionType.TRANSFER,
        description: 'E2E transfer: rollback test',
      }),
    ).toBe(0);

    await expect(
      dataSource
        .getRepository(IdempotencyKey)
        .findOneBy({ userId: senderUserId, key: idempotencyKey }),
    ).resolves.toBeNull();
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();

    dataSource = app.get(DataSource);
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
    vi.restoreAllMocks(); // luôn gỡ mock trước khi dọn dữ liệu

    await dataSource.transaction(async (manager) => {
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
        .from(Transaction)
        .where('initiated_by = :userId AND type = :type AND description LIKE :description', {
          userId: senderUserId,
          type: TransactionType.TRANSFER,
          description: 'E2E transfer: rollback%',
        })
        .execute();
      await manager.update(Account, sender.id, { balance: senderBalance });
      await manager.update(Account, recipient.id, { balance: recipientBalance });
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // Lỗi sau khi đã trừ/cộng tiền
  it('1. rollback khi lưu Transaction bị lỗi', async () => {
    const idempotencyKey = key();
    failSaveOn(Transaction);

    await send(idempotencyKey).expect(500);
    await expectNothingPersisted(idempotencyKey);
  });

  // Lỗi ngay trước COMMIT: mọi thứ đã được ghi mà vẫn phải hoàn tác
  it('2. rollback khi cập nhật IdempotencyKey bị lỗi', async () => {
    const idempotencyKey = key();
    failSaveOn(IdempotencyKey);

    await send(idempotencyKey).expect(500);
    await expectNothingPersisted(idempotencyKey);
  });

  // Lỗi ở chính lệnh COMMIT
  it('3. rollback khi COMMIT bị lỗi', async () => {
    const idempotencyKey = key();

    const originalCreate = DataSource.prototype.createQueryRunner;
    vi
      .spyOn(DataSource.prototype, 'createQueryRunner')
      .mockImplementation(function (this: DataSource, ...args: unknown[]) {
        const queryRunner = (originalCreate as Function).apply(this, args);
        vi
          .spyOn(queryRunner, 'commitTransaction')
          .mockRejectedValueOnce(new Error('Simulated commit failure'));
        return queryRunner;
      });

    await send(idempotencyKey).expect(500);
    await expectNothingPersisted(idempotencyKey);
  });

  // Key không được "kẹt" sau lỗi
  it('4. gửi lại cùng Idempotency-Key sau khi lỗi vẫn thành công', async () => {
    const idempotencyKey = key();
    const failing = failSaveOn(Transaction);

    await send(idempotencyKey).expect(500);

    failing.mockRestore();
    await send(idempotencyKey).expect(201);
  });
});