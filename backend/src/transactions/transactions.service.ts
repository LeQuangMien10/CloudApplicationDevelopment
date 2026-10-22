// transactions.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity.js';
import { Account } from '../accounts/entities/account.entity.js';
import { ListTransactionsQuery } from './dto/list-transactions.query.js';
import { InjectRepository } from '@nestjs/typeorm';

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
    ) { }

    async getTransactionHistory(userId: string, query: ListTransactionsQuery) {
        const { accountId, page = 1, limit = 10, from, to } = query;
        const { start, end } = buildDateRangeFilter(from, to);

        // 1. Kiểm tra & Xác định tài khoản thuộc về User
        let targetAccountId = accountId;

        if (targetAccountId) {
            const account = await this.accountRepo.findOne({
                where: { id: targetAccountId, userId },
            });
            if (!account) {
                throw new NotFoundException('Tài khoản không tồn tại hoặc không thuộc sở hữu của bạn');
            }
        } else {
            const account = await this.accountRepo.findOne({
                where: { userId },
            });
            if (!account) {
                throw new NotFoundException('Không tìm thấy tài khoản nào của người dùng');
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
