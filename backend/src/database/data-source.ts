import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './typeorm.config.js';

// Đọc .env ở thư mục backend, sau đó ở thư mục gốc repo
config({ path: ['.env', '../.env'], quiet: true });

/** Dùng cho TypeORM CLI: npm run migration:run | migration:revert | migration:generate */
export default new DataSource(buildDataSourceOptions(process.env, 'owner'));
