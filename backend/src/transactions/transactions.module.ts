import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '../accounts/accounts.module.js';
import { IdempotencyKey } from './entities/idempotency-key.entity.js';
import { LedgerEntry } from './entities/ledger-entry.entity.js';
import { Transaction } from './entities/transaction.entity.js';
import { TransactionsController } from './transactions.controller.js';
import { TransactionsService } from './transactions.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, LedgerEntry, IdempotencyKey]),
    AccountsModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
