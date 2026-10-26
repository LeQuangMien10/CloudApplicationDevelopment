// trasactions.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '../accounts/accounts.module.js';

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
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService, LedgerPostingService],
})
export class TransactionsModule {}
