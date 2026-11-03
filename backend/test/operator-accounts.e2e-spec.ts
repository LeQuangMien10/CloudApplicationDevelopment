import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import { AuditAction } from '../src/audit/entities/audit-log.entity.js';
import { openOwnerDataSource } from './support/owner-data-source.js';

// Cần PostgreSQL đã chạy migration + seed: npm run db:reset hoặc migration:run + seed
describe('Operator khóa, mở tài khoản ngân hàng (F3, e2e)', () => {
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

  async function registerCustomer(name: string) {
    const email = `f3-${name}-${Date.now()}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ fullName: name, email, password: 'Password@123' })
      .expect(201);
    const token = await loginAs(email, 'Password@123');
    const accounts = await request(app.getHttpServer())
      .get('/api/accounts/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return { token, accountId: accounts.body[0].id, accountNumber: accounts.body[0].accountNumber };
  }

  function transfer(fromToken: string, fromAccountId: string, toAccountNumber: string, key: string) {
    return request(app.getHttpServer())
      .post('/api/transactions/transfer')
      .set('Authorization', `Bearer ${fromToken}`)
      .set('Idempotency-Key', key)
      .send({
        fromAccountId,
        toAccountNumber,
        amount: '1000',
        description: 'F3 test transfer',
      });
  }

  it('operator khóa rồi mở tài khoản; freeze chặn chuyển khoản 2 chiều, mở lại thì được', async () => {
    const operator = await loginAs('operator@bank.local', 'Staff@123');
    const sender = await registerCustomer('f3-sender');
    const receiver = await registerCustomer('f3-receiver');

    // tài khoản mới số dư 0: nạp cho sender từ tài khoản seed để test chuyển khoản sau khi mở khóa
    const moneySource = await loginAs('an@example.com', 'Password@123');
    const sourceAccounts = await request(app.getHttpServer())
      .get('/api/accounts/me')
      .set('Authorization', `Bearer ${moneySource}`)
      .expect(200);
    await transfer(
      moneySource,
      sourceAccounts.body[0].id,
      sender.accountNumber,
      `f3-fund-${Date.now()}`,
    ).expect(201);

    // freeze tài khoản gửi
    const frozen = await request(app.getHttpServer())
      .patch(`/api/operator/accounts/${sender.accountId}/status`)
      .set('Authorization', `Bearer ${operator}`)
      .send({ status: 'frozen', reason: 'Nghi ngờ gian lận' })
      .expect(200);
    expect(frozen.body).toMatchObject({
      id: sender.accountId,
      accountNumber: sender.accountNumber,
      status: 'frozen',
    });

    // user vẫn đăng nhập và xem số dư được (khác khóa user)
    await request(app.getHttpServer())
      .get('/api/accounts/me')
      .set('Authorization', `Bearer ${sender.token}`)
      .expect(200);

    // không chuyển đi được
    await transfer(
      sender.token,
      sender.accountId,
      receiver.accountNumber,
      `f3-out-${Date.now()}`,
    ).expect(422);
    // và không nhận được tiền
    await transfer(
      receiver.token,
      receiver.accountId,
      sender.accountNumber,
      `f3-in-${Date.now()}`,
    ).expect(422);

    // mở lại thì chuyển bình thường
    await request(app.getHttpServer())
      .patch(`/api/operator/accounts/${sender.accountId}/status`)
      .set('Authorization', `Bearer ${operator}`)
      .send({ status: 'active' })
      .expect(200);
    await transfer(
      sender.token,
      sender.accountId,
      receiver.accountNumber,
      `f3-ok-${Date.now()}`,
    ).expect(201);
  });

  it('phân quyền: operator và admin được, customer và auditor bị 403', async () => {
    const customer = await registerCustomer('f3-role');
    const auditor = await loginAs('auditor@bank.local', 'Staff@123');
    const admin = await loginAs('admin@bank.local', 'Admin@123');
    const operator = await loginAs('operator@bank.local', 'Staff@123');

    for (const token of [customer.token, auditor]) {
      const denied = await request(app.getHttpServer())
        .patch(`/api/operator/accounts/${customer.accountId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'frozen', reason: 'test' })
        .expect(403);
      expect(denied.body.code).toBe('FORBIDDEN');
    }

    await request(app.getHttpServer())
      .patch(`/api/operator/accounts/${customer.accountId}/status`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'frozen', reason: 'Admin khóa' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/operator/accounts/${customer.accountId}/status`)
      .set('Authorization', `Bearer ${operator}`)
      .send({ status: 'active' })
      .expect(200);
  });

  it('khóa không có reason -> 400; status closed -> 400; id sai -> 400', async () => {
    const operator = await loginAs('operator@bank.local', 'Staff@123');
    const customer = await registerCustomer('f3-validate');

    await request(app.getHttpServer())
      .patch(`/api/operator/accounts/${customer.accountId}/status`)
      .set('Authorization', `Bearer ${operator}`)
      .send({ status: 'frozen' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/operator/accounts/${customer.accountId}/status`)
      .set('Authorization', `Bearer ${operator}`)
      .send({ status: 'closed', reason: 'x' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/operator/accounts/khong-phai-uuid/status')
      .set('Authorization', `Bearer ${operator}`)
      .send({ status: 'frozen', reason: 'x' })
      .expect(400);
  });

  it('khóa lại tài khoản đang frozen: 200 idempotent, không ghi log trùng', async () => {
    const operator = await loginAs('operator@bank.local', 'Staff@123');
    const customer = await registerCustomer('f3-idempotent');

    await request(app.getHttpServer())
      .patch(`/api/operator/accounts/${customer.accountId}/status`)
      .set('Authorization', `Bearer ${operator}`)
      .send({ status: 'frozen', reason: 'Lần 1' })
      .expect(200);
    const again = await request(app.getHttpServer())
      .patch(`/api/operator/accounts/${customer.accountId}/status`)
      .set('Authorization', `Bearer ${operator}`)
      .send({ status: 'frozen', reason: 'Lần 2' })
      .expect(200);
    expect(again.body.status).toBe('frozen');

    const logs = await owner.query(
      `SELECT count(*)::int AS count FROM audit_logs
       WHERE action = $1 AND target_id = $2 AND metadata->>'reason' = 'Lần 2'`,
      [AuditAction.ACCOUNT_FROZEN, customer.accountNumber],
    );
    expect(logs[0].count).toBe(0);

    // dọn: mở lại để không ảnh hưởng test khác
    await request(app.getHttpServer())
      .patch(`/api/operator/accounts/${customer.accountId}/status`)
      .set('Authorization', `Bearer ${operator}`)
      .send({ status: 'active' })
      .expect(200);
  });

  it('không đổi được tài khoản quỹ 000000000000 -> 422 CANNOT_MODIFY_SYSTEM_ACCOUNT', async () => {
    const operator = await loginAs('operator@bank.local', 'Staff@123');
    const systemAccount = await owner.query(
      `SELECT id FROM accounts WHERE is_system = true LIMIT 1`,
    );
    const res = await request(app.getHttpServer())
      .patch(`/api/operator/accounts/${systemAccount[0].id}/status`)
      .set('Authorization', `Bearer ${operator}`)
      .send({ status: 'frozen', reason: 'Thử khóa quỹ' })
      .expect(422);
    expect(res.body.code).toBe('CANNOT_MODIFY_SYSTEM_ACCOUNT');
  });

  it('mọi thao tác khóa/mở đều để lại audit log đúng action và lý do', async () => {
    const admin = await loginAs('admin@bank.local', 'Admin@123');
    const customer = await registerCustomer('f3-audit');

    await request(app.getHttpServer())
      .patch(`/api/operator/accounts/${customer.accountId}/status`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'frozen', reason: 'Kiểm tra audit' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/operator/accounts/${customer.accountId}/status`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'active' })
      .expect(200);

    const logs = await owner.query(
      `SELECT action, actor_role, metadata FROM audit_logs
       WHERE target_id = $1 ORDER BY created_at`,
      [customer.accountNumber],
    );
    const actions = logs.map((r) => r.action);
    expect(actions).toContain(AuditAction.ACCOUNT_FROZEN);
    expect(actions).toContain(AuditAction.ACCOUNT_UNFROZEN);
    const frozenRow = logs.find((r) => r.action === AuditAction.ACCOUNT_FROZEN);
    expect(frozenRow.metadata.reason).toBe('Kiểm tra audit');
    expect(frozenRow.actor_role).toBe('admin');
  });
});
