import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import { AuditAction } from '../src/audit/entities/audit-log.entity.js';
import { openOwnerDataSource } from './support/owner-data-source.js';

// Cần PostgreSQL đã chạy migration: npm run migration:run (backend/)
describe('Audit log (F2, e2e)', () => {
  let app: INestApplication<App>;
  let owner: DataSource;

  /** Đếm dòng audit log khớp điều kiện (kết nối owner để đọc mọi bảng). */
  async function countAudit(where: string, params: unknown[] = []) {
    const res = await owner.query(
      `SELECT count(*)::int AS count FROM audit_logs WHERE ${where}`,
      params,
    );
    return res[0].count as number;
  }

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

  async function loginAs(email: string, password: string, expectStatus = 200) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(expectStatus);
    return res.body;
  }

  it('luồng auth ghi đủ audit log: register, login thành công, login thất bại', async () => {
    const requestId = `audit-e2e-${Date.now()}`;
    const email = `audit-${Date.now()}@example.com`;

    // register kèm X-Request-Id để kiểm tra requestId lưu đúng
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('X-Request-Id', requestId)
      .send({ fullName: 'Audit User', email, password: 'Password@123' })
      .expect(201);
    const userId = reg.body.id;

    const registered = await owner.query(
      `SELECT action, actor_id, request_id, metadata FROM audit_logs
       WHERE action = $1 AND target_id = $2`,
      [AuditAction.AUTH_REGISTER, userId],
    );
    expect(registered).toHaveLength(1);
    expect(registered[0].request_id).toBe(requestId);
    expect(registered[0].metadata.accountNumber).toBeDefined();

    await loginAs(email, 'Password@123');
    expect(
      await countAudit(
        'action = $1 AND actor_id = $2',
        [AuditAction.AUTH_LOGIN_SUCCESS, userId],
      ),
    ).toBeGreaterThan(0);

    await loginAs(email, 'Sai@matkhau1', 401);
    const failed = await owner.query(
      `SELECT actor_id, metadata FROM audit_logs
       WHERE action = $1 AND metadata->>'email' = $2
         AND metadata->>'reason' = 'invalid_credentials'`,
      [AuditAction.AUTH_LOGIN_FAILED, email],
    );
    expect(failed.length).toBeGreaterThan(0);
  });

  it('admin khóa/mở user ghi USER_LOCKED, USER_UNLOCKED kèm actor là admin', async () => {
    const admin = await loginAs('admin@bank.local', 'Admin@123');
    const email = `audit-lock-${Date.now()}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ fullName: 'Lock Audit', email, password: 'Password@123' })
      .expect(201);
    const userId = reg.body.id;

    await request(app.getHttpServer())
      .patch(`/api/admin/users/${userId}/status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'locked' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/admin/users/${userId}/status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'active' })
      .expect(200);

    const adminId = (
      await owner.query(`SELECT id FROM users WHERE email = 'admin@bank.local'`)
    )[0].id;

    const logs = await owner.query(
      `SELECT action, actor_id, actor_role FROM audit_logs
       WHERE target_id = $1 AND action IN ($2, $3) ORDER BY created_at`,
      [userId, AuditAction.USER_LOCKED, AuditAction.USER_UNLOCKED],
    );
    expect(logs.map((r) => r.action)).toEqual([
      AuditAction.USER_LOCKED,
      AuditAction.USER_UNLOCKED,
    ]);
    for (const row of logs) {
      expect(row.actor_id).toBe(adminId);
      expect(row.actor_role).toBe('admin');
    }
  });

  it('audit log không chứa mật khẩu dù đăng nhập sai nhiều lần', async () => {
    const email = `no-leak-${Date.now()}@example.com`;
    const password = 'Secret@12345';
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ fullName: 'No Leak', email, password })
      .expect(201);

    await loginAs(email, 'Wrong@password1', 401);

    // không có dòng nào chứa mật khẩu đã gửi ở bất cứ đâu
    const raw = await owner.query(
      `SELECT count(*)::int AS count FROM audit_logs WHERE metadata::text LIKE $1`,
      ['%Wrong@password1%'],
    );
    expect(raw[0].count).toBe(0);
  });

  it('phân quyền API tra cứu: auditor đọc được, operator/customer bị 403', async () => {
    const auditor = await loginAs('auditor@bank.local', 'Staff@123');
    const operator = await loginAs('operator@bank.local', 'Staff@123');
    const customer = await loginAs('an@example.com', 'Password@123');

    const ok = await request(app.getHttpServer())
      .get('/api/audit-logs?page=1&limit=5')
      .set('Authorization', `Bearer ${auditor.accessToken}`)
      .expect(200);
    expect(ok.body).toMatchObject({
      page: 1,
      limit: 5,
      total: expect.any(Number),
    });
    expect(Array.isArray(ok.body.items)).toBe(true);
    expect(ok.body.items.length).toBeGreaterThan(0);

    for (const token of [operator.accessToken, customer.accessToken]) {
      const denied = await request(app.getHttpServer())
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(denied.body.code).toBe('FORBIDDEN');
    }

    // admin cũng đọc được
    const admin = await loginAs('admin@bank.local', 'Admin@123');
    await request(app.getHttpServer())
      .get('/api/audit-logs')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
  });

  it('bộ lọc action và actorId hoạt động đúng', async () => {
    const admin = await loginAs('admin@bank.local', 'Admin@123');
    const adminId = (
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200)
    ).body.id;

    const byAction = await request(app.getHttpServer())
      .get(`/api/audit-logs?action=${AuditAction.AUTH_LOGIN_SUCCESS}&limit=100`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    for (const item of byAction.body.items) {
      expect(item.action).toBe(AuditAction.AUTH_LOGIN_SUCCESS);
    }

    const byActor = await request(app.getHttpServer())
      .get(`/api/audit-logs?actorId=${adminId}&limit=100`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    for (const item of byActor.body.items) {
      expect(item.actorId).toBe(adminId);
    }

    const byRequest = await request(app.getHttpServer())
      .get('/api/audit-logs?requestId=khong-ton-tai')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(byRequest.body.total).toBe(0);
  });

  it('bảo vệ DB: bank_app không có quyền UPDATE/DELETE, owner bị trigger chặn', async () => {
    // bank_app (user runtime của backend) chỉ có SELECT, INSERT trên audit_logs
    const privs = await owner.query(`
      SELECT has_table_privilege('bank_app', 'audit_logs', 'UPDATE') AS can_update,
             has_table_privilege('bank_app', 'audit_logs', 'DELETE') AS can_delete,
             has_table_privilege('bank_app', 'audit_logs', 'INSERT') AS can_insert,
             has_table_privilege('bank_app', 'audit_logs', 'SELECT') AS can_select
    `);
    expect(privs[0]).toEqual({
      can_update: false,
      can_delete: false,
      can_insert: true,
      can_select: true,
    });

    // thử thật bằng kết nối của app: permission denied ngay ở tầng phân quyền
    const appDs = app.get(DataSource);
    const firstId = (
      await owner.query(`SELECT id FROM audit_logs LIMIT 1`)
    )[0]?.id;
    expect(firstId).toBeDefined();
    await expect(
      appDs.query(`UPDATE audit_logs SET action = 'hacked' WHERE id = $1`, [
        firstId,
      ]),
    ).rejects.toThrow(/permission denied/);

    // owner có đầy đủ quyền nhưng trigger vẫn chặn (không bật chế độ bảo trì)
    await expect(
      owner.query(`UPDATE audit_logs SET action = 'hacked' WHERE id = $1`, [
        firstId,
      ]),
    ).rejects.toThrow('audit_logs are append-only');
  });
});
