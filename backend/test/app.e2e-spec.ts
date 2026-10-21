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

  it('admin lấy danh sách user có phân trang, không lộ passwordHash', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@bank.local', password: 'Admin@123' })
      .expect(200);
    const res = await request(app.getHttpServer())
      .get('/api/admin/users?page=1&limit=2')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(res.body.items).toHaveLength(2);
    expect(typeof res.body.total).toBe('number');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('customer bị chặn 403 khi gọi API admin', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'an@example.com', password: 'Password@123' })
      .expect(200);
    const res = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('admin khóa rồi mở lại user; user bị khóa không đăng nhập được', async () => {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@bank.local', password: 'Admin@123' })
      .expect(200);
    const adminToken = adminLogin.body.accessToken;

    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        fullName: 'Lock Me',
        email: `lock-${Date.now()}@example.com`,
        password: 'Password@123',
      })
      .expect(201);
    const userLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: reg.body.email, password: 'Password@123' })
      .expect(200);
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${userLogin.body.accessToken}`)
      .expect(200);
    const userId = me.body.id;

    const locked = await request(app.getHttpServer())
      .patch(`/api/admin/users/${userId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'locked' })
      .expect(200);
    expect(locked.body.status).toBe('locked');

    // token đã cấp trước đó mất hiệu lực NGAY khi user bị khóa
    const meLocked = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${userLogin.body.accessToken}`)
      .expect(401);
    expect(meLocked.body.code).toBe('USER_LOCKED');

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: reg.body.email, password: 'Password@123' })
      .expect(401);

    await request(app.getHttpServer())
      .patch(`/api/admin/users/${userId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active' })
      .expect(200);

    // mở khóa xong token cũ dùng lại được
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${userLogin.body.accessToken}`)
      .expect(200);
  });

  it('cập nhật trạng thái user không tồn tại trả 404 USER_NOT_FOUND', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@bank.local', password: 'Admin@123' })
      .expect(200);
    const res = await request(app.getHttpServer())
      .patch('/api/admin/users/00000000-0000-4000-8000-000000000000/status')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ status: 'locked' })
      .expect(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('admin list với page=0 trả 400 VALIDATION_ERROR', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@bank.local', password: 'Admin@123' })
      .expect(200);
    const res = await request(app.getHttpServer())
      .get('/api/admin/users?page=0')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('admin không thể tự khóa chính mình (422 CANNOT_LOCK_SELF)', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@bank.local', password: 'Admin@123' })
      .expect(200);
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/users/${me.body.id}/status`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ status: 'locked' })
      .expect(422);
    expect(res.body.code).toBe('CANNOT_LOCK_SELF');
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
