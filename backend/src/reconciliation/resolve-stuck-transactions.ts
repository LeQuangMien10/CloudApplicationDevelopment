import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { StuckTransactionsService } from './stuck-transactions.service.js';

/**
 * Quét giao dịch treo một lần rồi thoát. Nên chạy mỗi 5 phút.
 *
 *   node dist/reconciliation/resolve-stuck-transactions.js
 *   docker compose exec -T backend node dist/reconciliation/resolve-stuck-transactions.js
 *
 * Mã thoát: 0 khi xong (kể cả có hủy giao dịch), 2 khi còn giao dịch cần kiểm tra tay, 1 khi lỗi.
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const result = await app.get(StuckTransactionsService).resolve();
    Logger.log(
      `Giao dịch treo: hủy ${result.failed.length}, cần kiểm tra tay ${result.needsReview.length}`,
      'StuckTransactions',
    );
    process.exitCode = result.needsReview.length > 0 ? 2 : 0;
  } catch (err) {
    Logger.error(
      `Quét giao dịch treo lỗi: ${err instanceof Error ? err.message : String(err)}`,
      'StuckTransactions',
    );
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

await main();
