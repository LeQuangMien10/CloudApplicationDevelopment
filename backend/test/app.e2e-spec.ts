import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';

// Cần PostgreSQL đang chạy: docker compose up -d db (ở thư mục gốc repo)
describe('Khung API (e2e)', () => {
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

  it('dữ liệu sai trả 400 VALIDATION_ERROR kèm requestId', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Request-Id', 'test-req-1')
      .send({ email: 'khong-phai-email' })
      .expect(400);
    expect(res.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      requestId: 'test-req-1',
    });
    expect(res.headers['x-request-id']).toBe('test-req-1');
  });

  it('luồng auth: đăng ký -> đăng nhập -> /auth/me', async () => {
    const email = `e2e-${Date.now()}@example.com`;

    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ fullName: 'E2E User', email, password: 'Password@123' })
      .expect(201);
    expect(reg.body).toEqual({
      id: expect.any(String),
      fullName: 'E2E User',
      email,
      accountNumber: expect.any(String),
    });

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'Password@123' })
      .expect(200);
    expect(login.body.accessToken).toBeDefined();
    expect(login.body.expiresIn).toBe(900);

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body).toEqual({ id: reg.body.id, role: 'customer' });
  });

  it('đăng nhập sai mật khẩu trả 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'an@example.com', password: 'Sai@matkhau1' })
      .expect(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('endpoint được bảo vệ chặn khi không có token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .expect(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('Swagger JSON có các endpoint chính', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/auth/login',
        '/api/accounts/me',
        '/api/transactions/transfer',
      ]),
    );
  });
});
