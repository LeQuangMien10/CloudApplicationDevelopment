import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';

// Cần PostgreSQL đã chạy migration + seed: npm run db:reset (backend/), hoặc docker compose
describe('Vai trò operator, auditor (F1, e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function loginAs(email: string, password: string) {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return login.body.accessToken as string;
  }

  it('operator đăng nhập được, /auth/me trả role operator', async () => {
    const token = await loginAs('operator@bank.local', 'Staff@123');
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body).toEqual({ id: expect.any(String), role: 'operator' });
  });

  it('auditor đăng nhập được, /auth/me trả role auditor', async () => {
    const token = await loginAs('auditor@bank.local', 'Staff@123');
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body).toEqual({ id: expect.any(String), role: 'auditor' });
  });

  it('operator và auditor không được gọi API khóa user (chỉ admin)', async () => {
    for (const email of ['operator@bank.local', 'auditor@bank.local']) {
      const token = await loginAs(email, 'Staff@123');
      const res = await request(app.getHttpServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
    }
  });

  it('đăng ký mới vẫn chỉ tạo customer, không tự nâng vai trò được', async () => {
    const email = `f1-${Date.now()}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ fullName: 'F1 User', email, password: 'Password@123' })
      .expect(201);
    const token = await loginAs(email, 'Password@123');
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.role).toBe('customer');
    expect(reg.body.accountNumber).toBeDefined();
  });
});
