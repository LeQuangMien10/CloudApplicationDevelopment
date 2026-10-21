import { HttpStatus, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { isUniqueViolation } from '../common/db-errors.js';
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
   */
  async createForUser(
    manager: EntityManager,
    userId: string,
  ): Promise<Account> {
    const MAX_TRIES = 5;

    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      try {
        const accountNumber = generateAccountNumber();
        const result = await manager.insert(Account, {
          userId,
          accountNumber,
          currency: DEFAULT_CURRENCY,
        });
        return manager.create(Account, {
          id: result.identifiers[0].id,
          userId,
          accountNumber,
        });
      } catch (err) {
        if (
          !isUniqueViolation(err, 'accounts_account_number_key') ||
          attempt === MAX_TRIES
        ) {
          throw err;
        }
        // trùng số tài khoản (xác suất rất nhỏ) -> vòng lặp sinh số khác rồi thử lại
      }
    }
    throw new AppException(
      'ACCOUNT_NUMBER_GENERATION_FAILED',
      'Không sinh được số tài khoản',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
