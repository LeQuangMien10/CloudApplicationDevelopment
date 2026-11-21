import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module.js';
import { ReconciliationReport } from './entities/reconciliation-report.entity.js';
import { ReconciliationController } from './reconciliation.controller.js';
import { ReconciliationService } from './reconciliation.service.js';
import { StuckTransactionsService } from './stuck-transactions.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ReconciliationReport]), AuditModule],
  controllers: [ReconciliationController],
  providers: [ReconciliationService, StuckTransactionsService],
  // Worker (F5) gọi theo lịch: run() mỗi ngày, resolve() mỗi 5 phút
  exports: [ReconciliationService, StuckTransactionsService],
})
export class ReconciliationModule {}
