import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import { openOwnerDataSource } from './support/owner-data-source.js';

// Cần PostgreSQL đã chạy migration + seed: npm run db:reset hoặc migration:run + seed
describe('Khóa đăng nhập sai mật khẩu nhiều lần (F9, e2e)', () => {
  let app: INestApplication<App>;
  let owner: DataSource;
  let savedEnv: string | undefined;

  beforeAll(async () => {
    // Ngưỡng IP rate limit cao để test này chỉ đo khóa đăng nhập, không bị 429 vạ
    savedEnv = process.env.RATE_LIMIT_LOGIN_PER_MIN;
    process.env.RATE_LIMIT_LOGIN_PER_MIN = '1000';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
    owner = await openOwnerDataSource();
  });

  afterAll(async () => {
    await app.close();
    await owner.destroy();
    if (savedEnv === undefined) delete process.env.RATE_LIMIT_LOGIN_PER_MIN;
    else process.env.RATE_LIMIT_LOGIN_PER_MIN = savedEnv;
  });

  function newEmail() {
    return `f9-lock-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  async function register(email: string) {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ fullName: 'Khách F9', email, password: 'Password@123' })
      .expect(201);
  }

  function login(email: string, password: string) {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password });
  }

  it('sai 5 lần trong 15 phút -> đăng nhập đúng mật khẩu cũng 423 LOGIN_TEMPORARILY_LOCKED kèm retryAfter và audit log', async () => {
    const email = newEmail();
    await register(email);
    for (let i = 0; i < 5; i++) {
      const bad = await login(email, 'SaiMatKhau@1');
      expect(bad.status).toBe(401);
      expect(bad.body.code).toBe('INVALID_CREDENTIALS');
    }

    const locked = await login(email, 'Password@123').expect(423);
    expect(locked.body.code).toBe('LOGIN_TEMPORARILY_LOCKED');
    expect(locked.body.details.retryAfter).toBeGreaterThan(0);
    expect(locked.body.details.retryAfter).toBeLessThanOrEqual(900);

    const logs = await owner.query(
      `SELECT metadata FROM audit_logs WHERE action = 'auth_login_locked'
       AND metadata->>'email' = $1`,
      [email],
    );
    expect(logs.length).toBe(1);
    expect(Number(logs[0].metadata.retryAfter)).toBeGreaterThan(0);
  });

  it('dòng fail cũ ngoài cửa sổ 15 phút không bị đếm — đăng nhập đúng vẫn vào được', async () => {
    const email = newEmail();
    await register(email);
    for (let i = 0; i < 5; i++) {
      await owner.query(
        `INSERT INTO login_attempts (email_norm, ip, success, created_at)
         VALUES ($1, '127.0.0.1', false, now() - interval '16 minutes')`,
        [email],
      );
    }

    const ok = await login(email, 'Password@123').expect(200);
    expect(ok.body.accessToken).toBeTruthy();
  });

  it('đăng nhập thành công giữa chừng đưa bộ đếm về 0: 4 sai -> đúng -> 4 sai -> vẫn vào được', async () => {
    const email = newEmail();
    await register(email);
    for (let i = 0; i < 4; i++) await login(email, 'SaiMatKhau@1').expect(401);
    await login(email, 'Password@123').expect(200);
    for (let i = 0; i < 4; i++) await login(email, 'SaiMatKhau@1').expect(401);

    await login(email, 'Password@123').expect(200);
  });

  it('thử sai tiếp khi đã khóa vẫn 423 và không mở thêm đếm nào cần thiết', async () => {
    const email = newEmail();
    await register(email);
    for (let i = 0; i < 5; i++) await login(email, 'SaiMatKhau@1').expect(401);

    // cả đúng lẫn sai đều 423, không tiết lộ mật khẩu đúng sai
    await login(email, 'Password@123').expect(423);
    await login(email, 'SaiMatKhau@1').expect(423);
  });
});
