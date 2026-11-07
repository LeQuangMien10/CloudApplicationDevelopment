import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditAction } from '../audit/entities/audit-log.entity.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/exceptions/app.exception.js';
import { DEFAULT_CURRENCY } from '../common/money.js';
import { generateAccountNumber } from './account-number.util.js';
import { Account, AccountStatus } from './entities/account.entity.js';

/** Phụ trách: TV3 Nhật (đọc tài khoản), TV2 Châu Anh dùng để tạo tài khoản khi đăng ký và khóa/mở (F3). */
@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly accountsRepository: Repository<Account>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  findByUserId(userId: string) {
    return this.accountsRepository.find({
      select: {
        id: true,
        accountNumber: true,
        balance: true,
        currency: true,
        status: true,
      },
      where: { userId },
    });
  }

  /**
   * Tạo tài khoản VND số dư 0 cho user mới.
   * Nhận EntityManager để chạy chung transaction với việc tạo user (đề nghị của TV1).
   *
   * Trùng số tài khoản thì sinh số khác và thử lại. Dùng INSERT ... ON CONFLICT DO NOTHING
   * thay vì bắt lỗi UNIQUE: trong PostgreSQL, sau một lỗi thì cả transaction bị hủy
   * và lần INSERT tiếp theo cũng lỗi, nên không thể thử lại bằng try/catch.
   *
   * @param nextNumber cho phép test truyền số tài khoản cố định
   */
  async createForUser(
    manager: EntityManager,
    userId: string,
    nextNumber: () => string = generateAccountNumber,
  ): Promise<Account> {
    const MAX_TRIES = 5;

    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      const accountNumber = nextNumber();
      const result = await manager
        .createQueryBuilder()
        .insert()
        .into(Account)
        .values({ userId, accountNumber, currency: DEFAULT_CURRENCY })
        .orIgnore()
        .returning('id')
        .execute();

      const inserted = result.raw as { id: string }[];
      if (inserted.length > 0) {
        return manager.create(Account, {
          id: inserted[0].id,
          userId,
          accountNumber,
        });
      }
      // trùng số tài khoản (xác suất rất nhỏ): vòng lặp sinh số khác rồi thử lại
    }
    throw new AppException(
      'ACCOUNT_NUMBER_GENERATION_FAILED',
      'Không sinh được số tài khoản',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  /**
   * F3: operator khóa (frozen) hoặc mở (active) tài khoản ngân hàng.
   * Đổi trạng thái và audit log trong cùng DB transaction. Gọi đúng trạng thái
   * hiện có thì trả về như cũ, không ghi log trùng (idempotent).
   * Chuyển khoản đã chặn tài khoản không active từ Phase 1, không cần sửa transfer.
   */
  async updateStatus(
    id: string,
    status: AccountStatus,
    reason: string | undefined,
    actor: { id: string; role: string },
  ): Promise<{
    id: string;
    accountNumber: string;
    status: AccountStatus;
    updatedAt: Date;
  }> {
    return this.dataSource.transaction(async (manager) => {
      const account = await manager.findOneBy(Account, { id });
      if (!account) {
        throw new AppException(
          'ACCOUNT_NOT_FOUND',
          'Không tìm thấy tài khoản',
          HttpStatus.NOT_FOUND,
        );
      }
      if (account.isSystem) {
        throw new AppException(
          'CANNOT_MODIFY_SYSTEM_ACCOUNT',
          'Không thể thay đổi trạng thái tài khoản quỹ của ngân hàng',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      const previousStatus = account.status;
      if (previousStatus !== status) {
        account.status = status;
        await manager.save(account);
        await this.auditService.log(manager, {
          actorId: actor.id,
          actorRole: actor.role,
          action:
            status === AccountStatus.FROZEN
              ? AuditAction.ACCOUNT_FROZEN
              : AuditAction.ACCOUNT_UNFROZEN,
          targetType: 'account',
          targetId: account.accountNumber,
          metadata: { reason: reason ?? null, previousStatus },
        });
      }
      return {
        id: account.id,
        accountNumber: account.accountNumber,
        status: account.status,
        updatedAt: account.updatedAt,
      };
    });
  }
}
