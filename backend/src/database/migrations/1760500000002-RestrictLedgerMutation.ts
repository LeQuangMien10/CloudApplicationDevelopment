import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cưỡng chế append-only cho ledger_entries bằng phân quyền, không chỉ bằng trigger.
 *
 * - banking_app: role NOLOGIN mang quyền của backend. Login user (DB_APP_USER) được
 *   tạo bằng `npm run db:app-user` và kế thừa role này. Không có UPDATE/DELETE/TRUNCATE
 *   trên ledger_entries, nên lộ credential của app cũng không sửa/xóa được sổ cái.
 * - ledger_maintainer: chỉ thành viên role này, và chỉ khi bật app.ledger_maintenance
 *   trong transaction, mới vượt được trigger append-only (dọn dữ liệu test, sửa sự cố).
 *
 * Bảng mới thêm ở migration sau phải tự GRANT cho banking_app.
 */
const LEDGER_FUNCTIONS = [
  'assert_completed_transfer_ledger(uuid)',
  'validate_completed_transfer_ledger_trigger()',
  'prevent_ledger_entry_mutation()',
];

export class RestrictLedgerMutation1760500000002 implements MigrationInterface {
  name = 'RestrictLedgerMutation1760500000002';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'banking_app') THEN
          CREATE ROLE banking_app NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledger_maintainer') THEN
          CREATE ROLE ledger_maintainer NOLOGIN;
        END IF;
      END;
      $$;
    `);
    // Owner chạy migration cũng là người bảo trì (cần khi owner không phải superuser, vd. trên cloud)
    await q.query(`GRANT ledger_maintainer TO CURRENT_USER`);

    await q.query(`GRANT USAGE ON SCHEMA public TO banking_app`);
    await q.query(
      `GRANT SELECT, INSERT, UPDATE ON users, accounts, transactions, idempotency_keys TO banking_app`,
    );
    await q.query(`REVOKE ALL ON ledger_entries FROM PUBLIC`);
    await q.query(`GRANT SELECT, INSERT ON ledger_entries TO banking_app`);

    await q.query(`
      CREATE OR REPLACE FUNCTION prevent_ledger_entry_mutation()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF pg_has_role(current_user, 'ledger_maintainer', 'MEMBER')
          AND current_setting('app.ledger_maintenance', true) = 'on' THEN
          IF TG_LEVEL = 'STATEMENT' THEN
            RETURN NULL;
          END IF;
          RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        END IF;
        RAISE EXCEPTION 'ledger_entries are append-only' USING ERRCODE = '55000';
      END;
      $$;
    `);
    // Mặc định pg_temp được tìm trước public: user app có thể tạo temp table `transactions`
    // để hàm kiểm tra đọc nhầm và bỏ qua. Cố định search_path, pg_temp xếp cuối cùng.
    for (const fn of LEDGER_FUNCTIONS) {
      await q.query(
        `ALTER FUNCTION ${fn} SET search_path = pg_catalog, public, pg_temp`,
      );
    }
    // Trigger FOR EACH ROW không chạy khi TRUNCATE (kể cả TRUNCATE transactions CASCADE)
    await q.query(`
      CREATE TRIGGER trg_ledger_entries_no_truncate
      BEFORE TRUNCATE ON ledger_entries
      FOR EACH STATEMENT EXECUTE FUNCTION prevent_ledger_entry_mutation();
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const fn of LEDGER_FUNCTIONS) {
      await q.query(`ALTER FUNCTION ${fn} RESET search_path`);
    }
    await q.query(
      `DROP TRIGGER trg_ledger_entries_no_truncate ON ledger_entries`,
    );
    await q.query(`
      CREATE OR REPLACE FUNCTION prevent_ledger_entry_mutation()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF current_setting('app.ledger_maintenance', true) = 'on' THEN
          RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        END IF;
        RAISE EXCEPTION 'ledger_entries are append-only' USING ERRCODE = '55000';
      END;
      $$;
    `);
    await q.query(
      `REVOKE ALL ON users, accounts, transactions, idempotency_keys, ledger_entries FROM banking_app`,
    );
    await q.query(`REVOKE USAGE ON SCHEMA public FROM banking_app`);
    // Role là đối tượng cấp cluster, giữ lại để không làm hỏng login user đang kế thừa nó
  }
}
