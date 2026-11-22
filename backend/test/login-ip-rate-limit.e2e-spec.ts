import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';

// Cần PostgreSQL đã chạy migration + seed: npm run db:reset hoặc migration:run + seed
describe('Rate limit đăng nhập theo IP (F9, e2e)', () => {
  let app: INestApplication<App>;
  let savedEnv: string | undefined;

  beforeAll(async () => {
    savedEnv = process.env.RATE_LIMIT_LOGIN_PER_MIN;
    process.env.RATE_LIMIT_LOGIN_PER_MIN = '5';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (savedEnv === undefined) delete process.env.RATE_LIMIT_LOGIN_PER_MIN;
    else process.env.RATE_LIMIT_LOGIN_PER_MIN = savedEnv;
  });

  function loginWrong(email: string) {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'SaiMatKhau@1' });
  }

  it('lần thứ 6 trong một phút từ cùng IP -> 429 RATE_LIMITED kèm details.retryAfter', async () => {
    // Mỗi lần dùng email khác nhau nên khóa đăng nhập (423) không can thiệp —
    // chỉ bộ đếm theo IP của throttler bị đẩy lên
    for (let i = 0; i < 5; i++) {
      const res = await loginWrong(`f9-ip-${Date.now()}-${i}@example.com`);
      expect(res.status).toBe(401);
    }

    const limited = await loginWrong(`f9-ip-${Date.now()}-6@example.com`).expect(
      429,
    );
    expect(limited.body.code).toBe('RATE_LIMITED');
    expect(limited.body.details.retryAfter).toBeGreaterThan(0);
    expect(limited.body.details.retryAfter).toBeLessThanOrEqual(60);
  });

  it('client đến từ X-Forwarded-For khác nhau (sau reverse proxy) không bị trừ vào chung một bucket', async () => {
    // 5 lần sai từ "IP A" (header X-Forwarded-For) đầy bộ đếm của riêng IP đó;
    // request từ "IP B" phải vẫn 401 bình thường, không kế thừa block của A.
    for (let i = 0; i < 5; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', '203.0.113.9')
        .send({
          email: `f9-xff-a-${Date.now()}-${i}@example.com`,
          password: 'SaiMatKhau@1',
        });
      expect(res.status).toBe(401);
    }

    const otherClient = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', '198.51.100.7')
      .send({
        email: `f9-xff-b-${Date.now()}@example.com`,
        password: 'SaiMatKhau@1',
      });
    expect(otherClient.status).toBe(401);
  });
});
