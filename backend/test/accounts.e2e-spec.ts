import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AccountsService } from '../src/accounts/accounts.service.js';
import { AppModule } from '../src/app.module.js';
import { User } from '../src/users/entities/user.entity.js';

// Cần PostgreSQL đang chạy và đã seed: docker compose up -d db && npm run seed
// Các test chạy trong transaction rồi rollback, không để lại dữ liệu.
class Rollback extends Error {}

describe('AccountsService.createForUser (DB thật)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accounts: AccountsService;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
    accounts = app.get(AccountsService);
    const user = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'an@example.com' });
    userId = user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  /** Chạy fn trong transaction rồi luôn rollback. */
  async function inRollback(fn: (m: DataSource['manager']) => Promise<void>) {
    await expect(
      dataSource.transaction(async (m) => {
        await fn(m);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
  }

  it('trùng số tài khoản thì thử lại với số khác trong cùng transaction', async () => {
    // 100000000001 đã có từ seed, lần thử thứ 2 dùng số chưa tồn tại
    const numbers = ['100000000001', '199999999901'];
    await inRollback(async (m) => {
      const acc = await accounts.createForUser(m, userId, () =>
        numbers.shift()!,
      );
      expect(acc.accountNumber).toBe('199999999901');
      // transaction vẫn dùng được sau lần trùng
      await expect(m.count(User)).resolves.toBeGreaterThan(0);
    });
  });

  it('trùng 5 lần liên tiếp thì báo ACCOUNT_NUMBER_GENERATION_FAILED', async () => {
    await expect(
      dataSource.transaction((m) =>
        accounts.createForUser(m, userId, () => '100000000001'),
      ),
    ).rejects.toMatchObject({ code: 'ACCOUNT_NUMBER_GENERATION_FAILED' });
  });
});
