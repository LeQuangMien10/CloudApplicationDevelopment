import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import { openOwnerDataSource } from './support/owner-data-source.js';

// Cần PostgreSQL đã chạy migration + seed: npm run db:reset hoặc migration:run + seed
describe('Operator/Auditor tra cứu tài khoản theo số tài khoản (Issue #11, e2e)', () => {
  let app: INestApplication<App>;
  let owner: DataSource;

  beforeAll(async () => {
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
  });

  async function loginAs(email: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return res.body.accessToken as string;
  }

  /** Đăng ký customer mới, trả số tài khoản + tên chủ tài khoản như đã đăng ký. */
  async function registerCustomer(name: string) {
    const email = `issue11-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ fullName: name, email, password: 'Password@123' })
      .expect(201);
    return {
      accountNumber: reg.body.accountNumber as string,
      fullName: name,
    };
  }

  function lookup(token: string, accountNumber: string | undefined) {
    const req = request(app.getHttpServer())
      .get('/api/operator/accounts')
      .set('Authorization', `Bearer ${token}`);
    if (accountNumber !== undefined) req.query({ accountNumber });
    return req;
  }

  it('operator và admin tra cứu được: đủ id, fullName, status, balance, currency', async () => {
    const customer = await registerCustomer('Nguyễn Văn Tra Cứu');
    for (const [email, password] of [
      ['operator@bank.local', 'Staff@123'],
      ['admin@bank.local', 'Admin@123'],
    ] as const) {
      const token = await loginAs(email, password);
      const res = await lookup(token, customer.accountNumber).expect(200);
      expect(res.body).toMatchObject({
        id: expect.any(String),
        accountNumber: customer.accountNumber,
        fullName: 'Nguyễn Văn Tra Cứu',
        status: 'active',
        isSystem: false,
        balance: expect.any(String),
        currency: 'VND',
      });
    }
  });

  it('auditor tra cứu được nhưng không nhận balance (chỉ đọc)', async () => {
    const customer = await registerCustomer('Trần Thị Auditor');
    const token = await loginAs('auditor@bank.local', 'Staff@123');
    const res = await lookup(token, customer.accountNumber).expect(200);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      accountNumber: customer.accountNumber,
      fullName: 'Trần Thị Auditor',
      status: 'active',
    });
    expect(res.body).not.toHaveProperty('balance');
  });

  it('phân quyền: customer 403 FORBIDDEN, chưa đăng nhập 401', async () => {
    const customer = await registerCustomer('Nguyễn Văn Bị Chặn');
    const email = `issue11-blocked-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ fullName: 'Khách', email, password: 'Password@123' })
      .expect(201);
    const customerToken = await loginAs(email, 'Password@123');

    const denied = await lookup(customerToken, customer.accountNumber).expect(
      403,
    );
    expect(denied.body.code).toBe('FORBIDDEN');

    await request(app.getHttpServer())
      .get('/api/operator/accounts')
      .query({ accountNumber: customer.accountNumber })
      .expect(401);
  });

  it('số tài khoản không tồn tại -> 404 ACCOUNT_NOT_FOUND', async () => {
    const token = await loginAs('operator@bank.local', 'Staff@123');
    const res = await lookup(token, '999999999999').expect(404);
    expect(res.body.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('số tài khoản sai định dạng -> 400 VALIDATION_ERROR', async () => {
    const token = await loginAs('operator@bank.local', 'Staff@123');
    for (const bad of ['12345678901', '10000000000a', undefined]) {
      const res = await lookup(token, bad).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('tài khoản quỹ hiển thị cho staff với isSystem=true (không 404 như endpoint khách hàng)', async () => {
    const token = await loginAs('operator@bank.local', 'Staff@123');
    const systemRows = await owner.query(
      `SELECT account_number FROM accounts WHERE is_system = true LIMIT 1`,
    );
    const res = await lookup(token, systemRows[0].account_number).expect(200);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      accountNumber: systemRows[0].account_number,
      isSystem: true,
    });
  });
});
