// transactions.service.ts
import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from './entities/transaction.entity.js';
import { Account, AccountStatus } from '../accounts/entities/account.entity.js';
import { ListTransactionsQuery } from './dto/list-transactions.query.js';
import { IdempotencyKey } from './entities/idempotency-key.entity.js';
import { InjectRepository } from '@nestjs/typeorm';
import { TransferDto } from './dto/transfer.dto.js';
import { AppException } from '../common/exceptions/app.exception.js';

/**
 * Phụ trách: TV3 Nhật
 *
 * TODO(TV3) transfer(), các bước đã chốt trong tài liệu nhóm:
 *  1. Thiếu Idempotency-Key thì 400. Tìm (userId, key) trong idempotency_keys:
 *     đã có và cùng request_hash thì trả response_body đã lưu; khác hash thì 409.
 *  2. dataSource.transaction(async (m) => { ... }):
 *     - SELECT 2 tài khoản FOR UPDATE, luôn khóa theo thứ tự id tăng dần để tránh deadlock
 *       (TypeORM: .setLock('pessimistic_write'))
 *     - kiểm tra: nguồn thuộc user, đích tồn tại, khác nguồn, cả hai ACTIVE, đủ số dư
 *     - UPDATE balance bằng SQL (balance = balance - :amount), KHÔNG cộng trừ bằng number trong JS
 *     - INSERT transaction COMPLETED, 2 ledger_entries (DEBIT nguồn, CREDIT đích), idempotency_keys
 *  3. Lỗi nghiệp vụ: rollback, lưu transaction FAILED + failure_reason ở transaction riêng,
 *     ném AppException(code, message, 422).
 *  Tham khảo cách ghi bút toán trong src/database/seed.ts (hàm deposit).
 */
@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(IdempotencyKey)
    private readonly idempotencyRepo: Repository<IdempotencyKey>,
    private readonly dataSource: DataSource,
  ) {}

  async getTransactionById(userId: string, transactionId: string) {
    const transaction = await this.txRepo
      .createQueryBuilder('transaction')
      .innerJoin('transaction.fromAccount', 'fromAccount')
      .innerJoin('transaction.toAccount', 'toAccount')
      .where('transaction.id = :transactionId', { transactionId })
      .andWhere(
        '(fromAccount.userId = :userId OR toAccount.userId = :userId)',
        { userId },
      )
      .getOne();

    if (!transaction) {
      throw new AppException(
        'TRANSACTION_NOT_FOUND',
        'Giao dịch không tồn tại',
        HttpStatus.NOT_FOUND,
      );
    }

    return transaction;
  }

  async getTransactionHistory(userId: string, query: ListTransactionsQuery) {
    const { accountId, page, limit, from, to } = query;
    const { start, end } = buildDateRangeFilter(from, to);

    // 1. Kiểm tra & Xác định tài khoản thuộc về User
    let targetAccountId = accountId;

    if (targetAccountId) {
      const account = await this.accountRepo.findOne({
        where: { id: targetAccountId, userId },
      });
      if (!account) {
        throw new AppException(
          'ACCOUNT_NOT_FOUND',
          'Tài khoản không tồn tại hoặc không thuộc sở hữu của bạn',
          HttpStatus.NOT_FOUND,
        );
      }
    } else {
      const account = await this.accountRepo.findOne({
        where: { userId },
      });
      if (!account) {
        throw new AppException(
          'ACCOUNT_NOT_FOUND',
          'Không tìm thấy tài khoản nào của người dùng',
          HttpStatus.NOT_FOUND,
        );
      }
      targetAccountId = account.id;
    }

    // 2. Build QueryBuilder
    const queryBuilder = this.txRepo
      .createQueryBuilder('tx')
      .where('(tx.fromAccount = :accountId OR tx.toAccount = :accountId)', {
        accountId: targetAccountId,
      });

    // 3. apply time
    if (start) {
      queryBuilder.andWhere('tx.createdAt >= :start', { start });
    }
    if (end) {
      queryBuilder.andWhere('tx.createdAt <= :end', { end });
    }

    // 4. pagination
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 10);

    const [transactions, total] = await queryBuilder
      .orderBy('tx.createdAt', 'DESC')
      .skip((pageNum - 1) * limitNum)
      .take(limitNum)
      .getManyAndCount();

    return {
      transactions,
      total,
      page: pageNum,
      limit: limitNum,
    };
  }

  async transfer(
    userId: string,
    idempotencyKey: string | undefined,
    dto: TransferDto,
  ) {
    // 1. Kiểm tra Idempotency-Key
    if (!idempotencyKey) {
      throw new AppException(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key là bắt buộc',
        HttpStatus.BAD_REQUEST,
      );
    }
    const requestHash = createHash('sha256')
      .update(JSON.stringify(dto))
      .digest('hex');

    // 2. kiểm tra số tiền nhập vào
    if (compareAmounts(dto.amount, '9999999999999999.99') > 0) {
      throw new AppException(
        'AMOUNT_TOO_LARGE',
        'Số tiền không được vượt quá 9,999,999,999,999,999.99',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // transfer
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const accountRepo = queryRunner.manager.getRepository(Account);
      const txRepo = queryRunner.manager.getRepository(Transaction);
      const idempotencyRepo = queryRunner.manager.getRepository(IdempotencyKey);

      const reservation = await idempotencyRepo
        .createQueryBuilder()
        .insert()
        .into(IdempotencyKey)
        .values({
          userId,
          key: idempotencyKey,
          requestHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .orIgnore()
        .execute();

      if (reservation.raw.length === 0) {
        const existingKey = await idempotencyRepo.findOneBy({
          userId,
          key: idempotencyKey,
        });
        if (!existingKey || existingKey.requestHash !== requestHash) {
          throw new AppException(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency-Key đã được sử dụng với yêu cầu khác',
            HttpStatus.CONFLICT,
          );
        }
        await queryRunner.commitTransaction();
        return existingKey.responseBody;
      }
      const idempotency = await idempotencyRepo.findOneByOrFail({
        userId,
        key: idempotencyKey,
      });

      // 3. Lấy account_number KHÔNG LOCK — chỉ để sort
      const fromAccountMeta = await accountRepo.findOne({
        where: { id: dto.fromAccountId, userId },
        select: { id: true, accountNumber: true },
      });

      if (!fromAccountMeta) {
        throw new AppException(
          'SENDER_ACCOUNT_NOT_FOUND',
          'Không tìm thấy tài khoản người gửi',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      if (fromAccountMeta.accountNumber === dto.toAccountNumber) {
        throw new AppException(
          'SAME_ACCOUNT',
          'Không thể chuyển khoản đến cùng một tài khoản',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      // 4. Lock theo thứ tự cố định — chống deadlock
      const shouldLockFromFirst =
        fromAccountMeta.accountNumber < dto.toAccountNumber;

      let fromAccount: Account | null = null;
      let toAccount: Account | null = null;

      if (shouldLockFromFirst) {
        fromAccount = await accountRepo.findOne({
          where: { id: dto.fromAccountId, userId },
          lock: { mode: 'pessimistic_write' },
        });
        toAccount = await accountRepo.findOne({
          where: { accountNumber: dto.toAccountNumber },
          lock: { mode: 'pessimistic_write' },
        });
      } else {
        toAccount = await accountRepo.findOne({
          where: { accountNumber: dto.toAccountNumber },
          lock: { mode: 'pessimistic_write' },
        });
        fromAccount = await accountRepo.findOne({
          where: { id: dto.fromAccountId, userId },
          lock: { mode: 'pessimistic_write' },
        });
      }

      if (!fromAccount)
        throw new AppException(
          'SENDER_ACCOUNT_NOT_FOUND',
          'Không tìm thấy tài khoản người gửi',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      if (!toAccount)
        throw new AppException(
          'TARGET_ACCOUNT_NOT_FOUND',
          'Không tìm thấy tài khoản người nhận',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );

      // 5. Validate sau khi lock (đọc data mới nhất)
      if (fromAccount.status !== AccountStatus.ACTIVE) {
        throw new AppException(
          'SENDER_ACCOUNT_NOT_ACTIVE',
          'Tài khoản người gửi không hoạt động',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      if (toAccount.status !== AccountStatus.ACTIVE) {
        throw new AppException(
          'TARGET_ACCOUNT_NOT_ACTIVE',
          'Tài khoản người nhận không hoạt động',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      // 6. Kiểm tra số dư
      if (compareAmounts(fromAccount.balance, dto.amount) < 0) {
        throw new AppException(
          'INSUFFICIENT_FUNDS',
          'Số dư không đủ để thực hiện chuyển khoản',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      // 7. Cập nhật balance
      const debitResult = await accountRepo
        .createQueryBuilder()
        .update(Account)
        .set({ balance: () => 'balance - :amount' })
        .where('id = :id', { id: fromAccount.id, amount: dto.amount })
        .returning('balance')
        .execute();
      const newFromBalance = debitResult.raw[0].balance as string;

      await accountRepo
        .createQueryBuilder()
        .update(Account)
        .set({ balance: () => 'balance + :amount' })
        .where('id = :id', { id: toAccount.id, amount: dto.amount })
        .execute();

      // 8. Tạo transaction record va idempotency key record
      const transaction = txRepo.create({
        type: TransactionType.TRANSFER,
        status: TransactionStatus.COMPLETED,
        fromAccountId: fromAccount.id,
        toAccountId: toAccount.id,
        amount: dto.amount,
        description: dto.description || null,
        initiatedBy: userId,
        completedAt: new Date(),
      });

      await txRepo.save(transaction);

      // Update the idempotency record with the transaction ID
      idempotency.transactionId = transaction.id;
      idempotency.responseCode = HttpStatus.CREATED;
      idempotency.responseBody = formatTransactionResponse(
        transaction,
        newFromBalance,
        {
          fromAccountNumber: fromAccount.accountNumber,
          toAccountNumber: toAccount.accountNumber,
        },
      );
      await idempotencyRepo.save(idempotency);

      await queryRunner.commitTransaction();

      return idempotency.responseBody;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}

function formatTransactionResponse(
  tx: Transaction,
  newBalance?: string,
  parties?: {
    fromAccountNumber?: string;
    toAccountNumber?: string;
  },
) {
  return {
    message: 'Giao dịch thành công',
    transaction: {
      id: tx.id,
      amount: tx.amount,
      status: tx.status,
      description: tx.description,
      createdAt: tx.createdAt,
      ...parties,
    },
    ...(newBalance && { newBalance }),
  };
}

function compareAmounts(left: string, right: string): number {
  const toMinorUnits = (amount: string) => {
    const [whole, fraction = ''] = amount.split('.');
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  };

  const difference = toMinorUnits(left) - toMinorUnits(right);
  return difference === 0n ? 0 : difference > 0n ? 1 : -1;
}

function buildDateRangeFilter(fromDate?: string, toDate?: string) {
  let start: Date | undefined;
  let end: Date | undefined;

  if (fromDate) {
    start = new Date(fromDate);
    start.setHours(0, 0, 0, 0);
  }

  if (toDate) {
    end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
  }

  return { start, end };
}
