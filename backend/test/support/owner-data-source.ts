import { DataSource, type EntityManager } from 'typeorm';
import { buildDataSourceOptions } from '../../src/database/typeorm.config.js';

/**
 * Kết nối bằng owner (DB_USER). App chạy bằng DB_APP_USER không được xóa ledger_entries,
 * nên dọn dữ liệu test phải đi qua kết nối này. Gọi sau app.init() để .env đã được nạp.
 */
export function openOwnerDataSource(): Promise<DataSource> {
  return new DataSource(
    buildDataSourceOptions(process.env, 'owner'),
  ).initialize();
}

/** Chạy fn trong transaction có bật chế độ bảo trì ledger (owner là ledger_maintainer). */
export function withLedgerMaintenance<T>(
  owner: DataSource,
  fn: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return owner.transaction(async (manager) => {
    await manager.query(
      `SELECT set_config('app.ledger_maintenance', 'on', true)`,
    );
    return fn(manager);
  });
}
