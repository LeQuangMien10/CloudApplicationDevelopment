import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F2 Phase 2: bảng audit_logs — nhật ký kiểm toán, CHỈ THÊM DÒNG như ledger_entries.
 *
 * - banking_app chỉ có SELECT, INSERT: lộ credential của app cũng không sửa/xóa được log.
 * - Trigger chặn UPDATE/DELETE/TRUNCATE kể cả với owner, trừ khi thành viên role
 *   audit_maintainer bật app.audit_maintenance trong transaction (dọn dữ liệu test).
 * - request_id là varchar(64) thay vì uuid: RequestIdMiddleware chấp nhận header
 *   X-Request-Id do client gửi (tối đa 64 ký tự), không ép kiểu uuid.
 */
export class CreateAuditLogs1760600000002 implements MigrationInterface {
  name = 'CreateAuditLogs1760600000002';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_maintainer') THEN
          CREATE ROLE audit_maintainer NOLOGIN;
        END IF;
      END;
      $$;
    `);
    // Owner chạy migration cũng là người bảo trì (cần khi owner không phải superuser)
    await q.query(`GRANT audit_maintainer TO CURRENT_USER`);

    await q.query(`
      CREATE TABLE audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
        actor_role varchar(20),
        action varchar(50) NOT NULL,
        target_type varchar(30),
        target_id varchar(64),
        request_id varchar(64) NOT NULL,
        ip inet,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await q.query(
      `CREATE INDEX idx_audit_logs_actor_created ON audit_logs (actor_id, created_at DESC)`,
    );
    await q.query(
      `CREATE INDEX idx_audit_logs_action_created ON audit_logs (action, created_at DESC)`,
    );
    await q.query(`CREATE INDEX idx_audit_logs_request_id ON audit_logs (request_id)`);

    await q.query(`
      CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF pg_has_role(current_user, 'audit_maintainer', 'MEMBER')
          AND current_setting('app.audit_maintenance', true) = 'on' THEN
          IF TG_LEVEL = 'STATEMENT' THEN
            RETURN NULL;
          END IF;
          RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        END IF;
        RAISE EXCEPTION 'audit_logs are append-only' USING ERRCODE = '55000';
      END;
      $$;
    `);
    // Cố định search_path (pg_temp xếp cuối) như các hàm bảo vệ sổ cái
    await q.query(
      `ALTER FUNCTION prevent_audit_log_mutation() SET search_path = pg_catalog, public, pg_temp`,
    );
    await q.query(`
      CREATE TRIGGER trg_audit_logs_no_update_delete
      BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
    `);
    await q.query(`
      CREATE TRIGGER trg_audit_logs_no_truncate
      BEFORE TRUNCATE ON audit_logs
      FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_log_mutation();
    `);

    await q.query(`REVOKE ALL ON audit_logs FROM PUBLIC`);
    await q.query(`GRANT SELECT, INSERT ON audit_logs TO banking_app`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER FUNCTION prevent_audit_log_mutation() RESET search_path`);
    await q.query(`DROP TRIGGER trg_audit_logs_no_truncate ON audit_logs`);
    await q.query(`DROP TRIGGER trg_audit_logs_no_update_delete ON audit_logs`);
    await q.query(`DROP FUNCTION prevent_audit_log_mutation()`);
    await q.query(`REVOKE ALL ON audit_logs FROM banking_app`);
    await q.query(`DROP TABLE audit_logs`);
    // Role audit_maintainer là đối tượng cấp cluster, giữ lại như ledger_maintainer
  }
}
