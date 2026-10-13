import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Cấu hình dùng chung cho app (TypeOrmModule) và CLI migration (data-source.ts). */
export function buildDataSourceOptions(
  env: NodeJS.ProcessEnv = process.env,
): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST ?? 'localhost',
    port: Number(env.DB_PORT ?? 5433),
    username: env.DB_USER ?? 'bank',
    password: env.DB_PASSWORD ?? 'bank_dev_password',
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
