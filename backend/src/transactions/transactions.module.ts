// trasactions.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AccountsModule } from '../accounts/accounts.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { parsePositiveInt } from '../auth/auth.module.js';

import { IdempotencyKey } from './entities/idempotency-key.entity.js';
import { LedgerEntry } from './entities/ledger-entry.entity.js';
import { Account } from '../accounts/entities/account.entity.js';
import { Transaction } from './entities/transaction.entity.js';

import { TransactionsController } from './transactions.controller.js';
import { TransactionsService } from './transactions.service.js';
import { LedgerPostingService } from './services/ledger-posting.service.js';


@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, LedgerEntry, IdempotencyKey, Account]),
    AccountsModule,
    AuditModule,
    // F9: rate limit chuyển khoản theo user, ngưỡng chỉnh qua env
    ThrottlerModule.forRoot([
      {
        name: 'transfer-user',
        ttl: 60_000,
        limit: () =>
          parsePositiveInt(process.env.RATE_LIMIT_TRANSFER_PER_MIN, 30),
      },
    ]),
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService, LedgerPostingService],
})
export class TransactionsModule {}
