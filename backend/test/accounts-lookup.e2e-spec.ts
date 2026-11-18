import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { setupApp } from '../src/app.setup.js';
import { AppModule } from '../src/app.module.js';
import { User } from '../src/users/entities/user.entity.js';

// Cần PostgreSQL đang chạy và đã seed: docker compose up -d db && npm run seed
describe('GET /api/accounts/lookup/:accountNumber (DB thật)', () => {
  let app: INestApplication;
  let token: string;

  const lookup = (accountNumber: string) =>
    request(app.getHttpServer())
      .get(`/api/accounts/lookup/${accountNumber}`)
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();

    const an = await app
      .get(DataSource)
      .getRepository(User)
      .findOneByOrFail({ email: 'an@example.com' });
    token = await app.get(JwtService).signAsync({ sub: an.id, role: an.role });
  });

  afterAll(async () => {
    await app.close();
  });

  it('trả số tài khoản, tên chủ tài khoản và trạng thái, không có số dư hay email', async () => {
    const res = await lookup('100000000002').expect(200);
    expect(res.body).toEqual({
      accountNumber: '100000000002',
      accountHolderName: 'TRẦN THỊ BÌNH',
      status: 'active',
    });
  });

  it('số tài khoản không đủ 12 chữ số trả 400 VALIDATION_ERROR', async () => {
    for (const value of ['12345', '1000000000021', 'abcdefghijkl']) {
      const res = await lookup(value).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('số tài khoản không tồn tại trả 404 TARGET_ACCOUNT_NOT_FOUND', async () => {
    const res = await lookup('199999999999').expect(404);
    expect(res.body.code).toBe('TARGET_ACCOUNT_NOT_FOUND');
  });

  it('tài khoản hệ thống trả 404 như tài khoản không tồn tại', async () => {
    const res = await lookup('000000000000').expect(404);
    expect(res.body.code).toBe('TARGET_ACCOUNT_NOT_FOUND');
  });

  it('chưa đăng nhập trả 401', async () => {
    await request(app.getHttpServer())
      .get('/api/accounts/lookup/100000000002')
      .expect(401);
  });
});
