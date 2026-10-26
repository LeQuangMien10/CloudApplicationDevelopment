import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * - `app`: user runtime của backend, không phải owner, chỉ được SELECT/INSERT ledger_entries.
 * - `owner`: chủ schema, dùng cho migration, seed và dọn dữ liệu test. Không dùng cho app.
 */
export type DbRole = 'app' | 'owner';

/** Cấu hình dùng chung cho app (TypeOrmModule) và CLI migration (data-source.ts). */
export function buildDataSourceOptions(
  env: NodeJS.ProcessEnv = process.env,
  role: DbRole = 'app',
): DataSourceOptions {
  const credentials =
    role === 'owner'
      ? {
          username: env.DB_USER ?? 'bank',
          password: env.DB_PASSWORD ?? 'bank_dev_password',
        }
      : {
          username: env.DB_APP_USER ?? 'bank_app',
          password: env.DB_APP_PASSWORD ?? 'bank_app_dev_password',
        };

  return {
    type: 'postgres',
    host: env.DB_HOST ?? 'localhost',
    port: Number(env.DB_PORT ?? 5433),
    ...credentials,
    database: env.DB_NAME ?? 'banking',
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    entities: ENTITIES,
    // Migration chạy từ bản build (dist), xem script migration:* trong package.json
    migrations: [join(here, 'migrations', '*.js')],
    // Không bao giờ để TypeORM tự sửa schema. Mọi thay đổi đi qua migration.
    synchronize: false,
    logging: env.DB_LOGGING === 'true',
  };
}
