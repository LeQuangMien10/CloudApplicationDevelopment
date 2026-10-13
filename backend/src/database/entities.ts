import { Account } from '../accounts/entities/account.entity.js';
import { IdempotencyKey } from '../transactions/entities/idempotency-key.entity.js';
import { LedgerEntry } from '../transactions/entities/ledger-entry.entity.js';
import { Transaction } from '../transactions/entities/transaction.entity.js';
import { User } from '../users/entities/user.entity.js';

/** Thêm entity mới vào đây. */
export const ENTITIES = [
  User,
  Account,
  Transaction,
  LedgerEntry,
  IdempotencyKey,
];
