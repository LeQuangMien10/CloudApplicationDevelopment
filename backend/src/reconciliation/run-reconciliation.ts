import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import {
  ReconciliationStatus,
  ReconciliationTrigger,
} from './entities/reconciliation-report.entity.js';
import { ReconciliationService } from './reconciliation.service.js';

/**
 * Chạy đối soát định kỳ một lần rồi thoát. Kết nối DB bằng user của app (bank_app).
 *
 *   node dist/reconciliation/run-reconciliation.js
 *   docker compose exec -T backend node dist/reconciliation/run-reconciliation.js
 *
 * Mã thoát: 0 khi khớp, 2 khi phát hiện lệch, 1 khi lỗi. Cron hoặc worker dựa vào mã này để cảnh báo.
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const report = await app
      .get(ReconciliationService)
      .run({ trigger: ReconciliationTrigger.SCHEDULED });
    Logger.log(
      `Báo cáo ${report.id}: ${report.status}, ${report.accountsChecked} tài khoản, ` +
        `${report.transactionsChecked} giao dịch, tổng số dư ${report.totalBalance}, ${report.durationMs} ms`,
      'Reconciliation',
    );
    process.exitCode = report.status === ReconciliationStatus.OK ? 0 : 2;
  } catch (err) {
    Logger.error(
      `Đối soát lỗi: ${err instanceof Error ? err.message : String(err)}`,
      'Reconciliation',
    );
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

await main();
