import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  LedgerDirection,
  LedgerEntry,
} from '../entities/ledger-entry.entity.js';

export interface TransferLedgerInput {
  transactionId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  fromBalanceAfter: string;
  toBalanceAfter: string;
}

@Injectable()
export class LedgerPostingService {
  async postTransfer(
    manager: EntityManager,
    input: TransferLedgerInput,
  ): Promise<void> {
    const entries = [
      manager.create(LedgerEntry, {
        transactionId: input.transactionId,
        accountId: input.fromAccountId,
        direction: LedgerDirection.DEBIT,
        amount: input.amount,
        balanceAfter: input.fromBalanceAfter,
      }),
      manager.create(LedgerEntry, {
        transactionId: input.transactionId,
        accountId: input.toAccountId,
        direction: LedgerDirection.CREDIT,
        amount: input.amount,
        balanceAfter: input.toBalanceAfter,
      }),
    ];

    this.assertBalanced(entries);
    await manager.save(LedgerEntry, entries);
  }

  private assertBalanced(entries: readonly LedgerEntry[]): void {
    let debitTotal = 0n;
    let creditTotal = 0n;

    for (const entry of entries) {
      const amount = toMinorUnits(entry.amount);
      if (entry.direction === LedgerDirection.DEBIT) {
        debitTotal += amount;
      } else {
        creditTotal += amount;
      }
    }

    if (debitTotal !== creditTotal) {
      throw new Error('Ledger entries are not balanced');
    }
  }
}

function toMinorUnits(amount: string): bigint {
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
