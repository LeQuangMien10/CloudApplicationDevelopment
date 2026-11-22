import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';

// Cần PostgreSQL đã chạy migration + seed: npm run db:reset hoặc migration:run + seed
describe('Rate limit chuyển khoản theo user (F9, e2e)', () => {
  let app: INestApplication<App>;
  let savedLoginEnv: string | undefined;
  let savedTransferEnv: string | undefined;

  beforeAll(async () => {
    savedLoginEnv = process.env.RATE_LIMIT_LOGIN_PER_MIN;
    savedTransferEnv = process.env.RATE_LIMIT_TRANSFER_PER_MIN;
    process.env.RATE_LIMIT_LOGIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_TRANSFER_PER_MIN = '30';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (savedLoginEnv === undefined)
      delete process.env.RATE_LIMIT_LOGIN_PER_MIN;
    else process.env.RATE_LIMIT_LOGIN_PER_MIN = savedLoginEnv;
    if (savedTransferEnv === undefined)
      delete process.env.RATE_LIMIT_TRANSFER_PER_MIN;
    else process.env.RATE_LIMIT_TRANSFER_PER_MIN = savedTransferEnv;
  });

  async function loginAs(email: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return res.body.accessToken as string;
  }

  async function firstAccountId(token: string) {
    const res = await request(app.getHttpServer())
      .get('/api/accounts/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body[0].id as string;
  }

  function transfer(token: string, fromAccountId: string, toAccountNumber: string) {
    return request(app.getHttpServer())
      .post('/api/transactions/transfer')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        fromAccountId,
        toAccountNumber,
        amount: '1000',
        description: 'F9 rate limit test',
      });
  }

  it('chuyển khoản lần thứ 31 trong một phút (cùng user) -> 429, user khác không bị ảnh hưởng', async () => {
    const anToken = await loginAs('an@example.com', 'Password@123');
    const anAccountId = await firstAccountId(anToken);

    // An chuyển 30 lần (dưới ngưỡng) — tất cả thành công
    for (let i = 0; i < 30; i++) {
      await transfer(anToken, anAccountId, '100000000002').expect(201);
    }

    // Lần 31 vẫn trong một phút: bị chặn theo user, kèm retryAfter
    const limited = await transfer(anToken, anAccountId, '100000000002').expect(
      429,
    );
    expect(limited.body.code).toBe('RATE_LIMITED');
    expect(limited.body.details.retryAfter).toBeGreaterThan(0);
    expect(limited.body.details.retryAfter).toBeLessThanOrEqual(60);

    // Bình chuyển bình thường: đếm theo user, không bị vạ lây từ An
    const binhToken = await loginAs('binh@example.com', 'Password@123');
    const binhAccountId = await firstAccountId(binhToken);
    await transfer(binhToken, binhAccountId, '100000000001').expect(201);
  });
});
