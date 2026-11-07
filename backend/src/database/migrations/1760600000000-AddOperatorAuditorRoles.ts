import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F1 Phase 2: thêm vai trò operator (khóa/mở tài khoản ngân hàng, xử lý cảnh báo)
 * và auditor (chỉ đọc audit log, báo cáo đối soát) vào enum user_role.
 *
 * Postgres 12+ cho phép ALTER TYPE ... ADD VALUE trong transaction migration,
 * nhưng giá trị mới chỉ dùng được sau khi commit — seed chạy sau migration nên ổn.
 */
export class AddOperatorAuditorRoles1760600000000
  implements MigrationInterface
{
  name = 'AddOperatorAuditorRoles1760600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'operator'`);
    await q.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'auditor'`);
  }

  /** Postgres không hỗ trợ xóa giá trị enum; down là no-op có chủ đích. */
  public async down(): Promise<void> {}
}
