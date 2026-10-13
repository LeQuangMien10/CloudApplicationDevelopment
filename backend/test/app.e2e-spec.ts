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

  it('API chưa làm trả 501 NOT_IMPLEMENTED', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'an@example.com', password: 'Password@123' })
      .expect(501);
    expect(res.body.code).toBe('NOT_IMPLEMENTED');
    expect(res.body.requestId).toBeDefined();
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
