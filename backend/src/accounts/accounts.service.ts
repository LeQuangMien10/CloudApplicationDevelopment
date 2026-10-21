import { HttpStatus, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception.js';
import { DEFAULT_CURRENCY } from '../common/money.js';
import { generateAccountNumber } from './account-number.util.js';
import { Account } from './entities/account.entity.js';

/** Phụ trách: TV3 Nhật (đọc tài khoản), TV2 Châu Anh dùng để tạo tài khoản khi đăng ký. */
@Injectable()
export class AccountsService {
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
}
