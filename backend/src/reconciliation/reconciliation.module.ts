import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module.js';
import { ReconciliationReport } from './entities/reconciliation-report.entity.js';
import { ReconciliationController } from './reconciliation.controller.js';
import { ReconciliationService } from './reconciliation.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ReconciliationReport]), AuditModule],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
  // Worker (F5) gọi ReconciliationService.run() theo lịch mỗi ngày
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
