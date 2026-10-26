import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './typeorm.config.js';

config({ path: ['.env', '../.env'], quiet: true });

/**
 * Tạo (hoặc cập nhật mật khẩu) login user cho backend từ DB_APP_USER/DB_APP_PASSWORD,
 * kế thừa quyền của role banking_app. Chạy sau migration: npm run db:app-user
 */
async function main() {
  const env = process.env;
  const user = env.DB_APP_USER ?? 'bank_app';
  const password = env.DB_APP_PASSWORD ?? 'bank_app_dev_password';
  const ds = await new DataSource(
    buildDataSourceOptions(env, 'owner'),
  ).initialize();
  try {
    const [{ exists }] = await ds.query(
      `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists`,
      [user],
    );
    const [{ sql }] = await ds.query(
      exists
        ? `SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', $1::text, $2::text) AS sql`
        : `SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', $1::text, $2::text) AS sql`,
      [user, password],
    );
    await ds.query(sql);
    const [{ grant }] = await ds.query(
      `SELECT format('GRANT banking_app TO %I', $1::text) AS grant`,
      [user],
    );
    await ds.query(grant);
    console.log(
      `Đã ${exists ? 'cập nhật' : 'tạo'} DB user "${user}" (role banking_app)`,
    );
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
