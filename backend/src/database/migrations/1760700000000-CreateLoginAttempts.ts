import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F9 Phase 2: bảng login_attempts — bằng chứng các lần đăng nhập để khóa
 * đăng nhập sai mật khẩu nhiều lần. CHỈ THÊM DÒNG bằng quyền: banking_app
 * chỉ có SELECT, INSERT (không cần trigger như audit_logs vì không cấp
 * UPDATE/DELETE ngay từ đầu). Đếm luôn giới hạn 15 phút qua, không cần job dọn.
 */
export class CreateLoginAttempts1760700000000 implements MigrationInterface {
  name = 'CreateLoginAttempts1760700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE login_attempts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email_norm varchar(255) NOT NULL,
        ip inet,
        success boolean NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await q.query(
      `CREATE INDEX idx_login_attempts_email_created ON login_attempts (email_norm, created_at DESC)`,
    );
    await q.query(`REVOKE ALL ON login_attempts FROM PUBLIC`);
    await q.query(`GRANT SELECT, INSERT ON login_attempts TO banking_app`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`REVOKE ALL ON login_attempts FROM banking_app`);
    await q.query(`DROP TABLE login_attempts`);
  }
}
