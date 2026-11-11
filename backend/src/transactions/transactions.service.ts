// transactions.service.ts
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
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
import { LedgerPostingService } from './services/ledger-posting.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditAction } from '../audit/entities/audit-log.entity.js';
import type { RequestUser } from '../auth/jwt.strategy.js';

/** Lỗi nghiệp vụ được lưu thành giao dịch failed (F4). Các lỗi khác không lưu. */
const FAILED_TRANSFER_CODES = new Set([
  'INSUFFICIENT_FUNDS',
  'SENDER_ACCOUNT_NOT_ACTIVE',
  'TARGET_ACCOUNT_NOT_ACTIVE',
]);

interface TransferParties {
  fromAccountId: string;
  toAccountId: string;
  /** Id hai tài khoản theo đúng thứ tự transfer() đã khóa. */
  lockOrder: [string, string];
}

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
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(IdempotencyKey)
    private readonly idempotencyRepo: Repository<IdempotencyKey>,
    private readonly dataSource: DataSource,
    private readonly ledgerPostingService: LedgerPostingService,
    private readonly auditService: AuditService,
  ) {}

  async getTransactionById(userId: string, transactionId: string) {
    const transaction = await this.txRepo
      .createQueryBuilder('transaction')
      .innerJoin('transaction.fromAccount', 'fromAccount')
      .innerJoin('transaction.toAccount', 'toAccount')
      .where('transaction.id = :transactionId', { transactionId })
      // Giao dịch failed chỉ bên gửi xem được
      .andWhere(
        '(fromAccount.userId = :userId OR (toAccount.userId = :userId AND transaction.status <> :failed))',
        { userId, failed: TransactionStatus.FAILED },
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
      })
      // Giao dịch failed chỉ hiện ở lịch sử bên gửi
      .andWhere('(tx.status <> :failed OR tx.fromAccount = :accountId)', {
        failed: TransactionStatus.FAILED,
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
    user: RequestUser,
    idempotencyKey: string | undefined,
    dto: TransferDto,
  ) {
    const userId = user.id;
    // 1. Kiểm tra Idempotency-Key
    if (!idempotencyKey) {
      throw new AppException(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key là bắt buộc',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (idempotencyKey.length > 64) {
      throw new AppException(
        'VALIDATION_ERROR',
        'Dữ liệu không hợp lệ',
        HttpStatus.BAD_REQUEST,
        ['Idempotency-Key không được vượt quá 64 ký tự'],
      );
    }

    const requestHash = createHash('sha256')
      .update(JSON.stringify(dto))
      .digest('hex');

    // transfer
    // Chỉ có giá trị sau khi đã khóa được cả hai tài khoản và nguồn thuộc user
    let parties: TransferParties | null = null;
    let failure: unknown;

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
        // Lần gửi trước thất bại nghiệp vụ: trả lại đúng lỗi 422 đã lưu
        if (existingKey.responseCode === HttpStatus.UNPROCESSABLE_ENTITY) {
          const saved = existingKey.responseBody as {
            code: string;
            message: string;
          };
          throw new AppException(saved.code, saved.message, existingKey.responseCode);
        }
        return existingKey.responseBody;
      }
      const idempotency = await idempotencyRepo.findOneByOrFail({
        userId,
        key: idempotencyKey,
      });

      // 2. Lấy account_number KHÔNG LOCK — chỉ để sort
      const fromAccountMeta = await accountRepo.findOne({
        where: { id: dto.fromAccountId, userId },
        select: { id: true, accountNumber: true },
      });

      if (!fromAccountMeta) {
        throw new AppException(
          'SENDER_ACCOUNT_NOT_FOUND',
          'Không tìm thấy tài khoản người gửi',
          HttpStatus.NOT_FOUND,
        );
      }

      if (fromAccountMeta.accountNumber === dto.toAccountNumber) {
        throw new AppException(
          'SAME_ACCOUNT',
          'Không thể chuyển khoản đến cùng một tài khoản',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      // 3. Lock theo thứ tự cố định — chống deadlock
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
          HttpStatus.NOT_FOUND,
        );
      if (!toAccount)
        throw new AppException(
          'TARGET_ACCOUNT_NOT_FOUND',
          'Không tìm thấy tài khoản người nhận',
          HttpStatus.NOT_FOUND,
        );

      parties = {
        fromAccountId: fromAccount.id,
        toAccountId: toAccount.id,
        lockOrder: shouldLockFromFirst
          ? [fromAccount.id, toAccount.id]
          : [toAccount.id, fromAccount.id],
      };

      // 4. Validate sau khi lock (đọc data mới nhất)
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

      // 5. Kiểm tra số dư
      if (compareAmounts(fromAccount.balance, dto.amount) < 0) {
        throw new AppException(
          'INSUFFICIENT_FUNDS',
          'Số dư không đủ để thực hiện chuyển khoản',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      // 6. Cập nhật balance
      const debitResult = await accountRepo
        .createQueryBuilder()
        .update(Account)
        .set({ balance: () => 'balance - :amount' })
        .where('id = :id', { id: fromAccount.id, amount: dto.amount })
        .returning('balance')
        .execute();
      const newFromBalance = debitResult.raw[0].balance as string;

      const creditResult = await accountRepo
        .createQueryBuilder()
        .update(Account)
        .set({ balance: () => 'balance + :amount' })
        .where('id = :id', { id: toAccount.id, amount: dto.amount })
        .returning('balance')
        .execute();
      const newToBalance = creditResult.raw[0].balance as string;

      // 7. Tạo transaction record va idempotency key record
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

      await this.ledgerPostingService.postTransfer(queryRunner.manager, {
        transactionId: transaction.id,
        fromAccountId: fromAccount.id,
        toAccountId: toAccount.id,
        amount: dto.amount,
        fromBalanceAfter: newFromBalance,
        toBalanceAfter: newToBalance,
      });

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

      await this.auditService.log(queryRunner.manager, {
        actorId: userId,
        actorRole: user.role,
        action: AuditAction.TRANSFER_COMPLETED,
        targetType: 'transaction',
        targetId: transaction.id,
        metadata: {
          amount: dto.amount,
          fromAccountId: fromAccount.id,
          toAccountId: toAccount.id,
        },
      });

      await queryRunner.commitTransaction();

      return idempotency.responseBody;
    } catch (error) {
      // Lỗi replay 422 ném ra sau khi đã commit
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      failure = error;
    } finally {
      await queryRunner.release();
    }

    // Lưu sau khi đã rollback và trả connection: không giữ khóa tài khoản,
    // không chiếm 2 connection cùng lúc khi nhiều request lỗi đồng thời
    if (
      parties &&
      failure instanceof AppException &&
      FAILED_TRANSFER_CODES.has(failure.code)
    ) {
      await this.recordFailedTransfer(
        user,
        idempotencyKey,
        requestHash,
        dto,
        parties,
        failure,
      );
    }
    throw failure;
  }

  /**
   * Lưu giao dịch failed kèm failure_reason trong transaction riêng, không ghi sổ cái.
   * Lưu luôn Idempotency-Key với response 422 để gửi lại cùng key không sinh thêm bản ghi.
   * Lỗi khi lưu chỉ ghi log, client vẫn nhận lỗi 422 gốc.
   */
  private async recordFailedTransfer(
    user: RequestUser,
    idempotencyKey: string,
    requestHash: string,
    dto: TransferDto,
    parties: TransferParties,
    error: AppException,
  ): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const reservation = await manager
          .createQueryBuilder()
          .insert()
          .into(IdempotencyKey)
          .values({
            userId: user.id,
            key: idempotencyKey,
            requestHash,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          })
          .orIgnore()
          .execute();
        // Request khác cùng key đã ghi kết quả trong lúc rollback
        if (reservation.raw.length === 0) return;

        // INSERT transactions khóa KEY SHARE hai tài khoản qua khóa ngoại, theo thứ tự
        // from rồi to. Khóa trước theo đúng thứ tự của transfer() để không tạo vòng chờ
        // với lệnh chuyển chiều ngược lại đang giữ FOR UPDATE (deadlock)
        for (const accountId of parties.lockOrder) {
          await manager
            .getRepository(Account)
            .createQueryBuilder('account')
            .select('account.id')
            .where('account.id = :accountId', { accountId })
            .setLock('for_key_share')
            .getOne();
        }

        const transaction = await manager.save(
          manager.create(Transaction, {
            type: TransactionType.TRANSFER,
            status: TransactionStatus.FAILED,
            fromAccountId: parties.fromAccountId,
            toAccountId: parties.toAccountId,
            amount: dto.amount,
            description: dto.description || null,
            failureReason: error.code,
            initiatedBy: user.id,
            completedAt: null,
          }),
        );

        await manager.update(
          IdempotencyKey,
          { userId: user.id, key: idempotencyKey },
          {
            transactionId: transaction.id,
            responseCode: error.getStatus(),
            responseBody: { code: error.code, message: error.message },
          },
        );

        await this.auditService.log(manager, {
          actorId: user.id,
          actorRole: user.role,
          action: AuditAction.TRANSFER_FAILED,
          targetType: 'transaction',
          targetId: transaction.id,
          metadata: {
            amount: dto.amount,
            reason: error.code,
            fromAccountId: parties.fromAccountId,
            toAccountId: parties.toAccountId,
          },
        });
      });
    } catch (err) {
      this.logger.error(
        `Lưu giao dịch failed thất bại (${error.code}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
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
