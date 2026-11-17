import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';
import { OperatorAccountsController } from './operator-accounts.controller.js';
import { Account } from './entities/account.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Account]), AuditModule],
  controllers: [AccountsController, OperatorAccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
