import { HttpStatus, Injectable } from '@nestjs/common';
import { hash } from 'bcrypt';
import { DataSource } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service.js';
import { AppException } from '../common/exceptions/app.exception.js';
import { User } from '../users/entities/user.entity.js';
import { RegisterDto, RegisterResponseDto } from './dto/auth.dto.js';

const BCRYPT_COST = 12;

/** Mã 23505 = vi phạm UNIQUE của Postgres; kiểm tra đúng ràng buộc cụ thể. */
function isUniqueViolation(err: unknown, constraint: string): boolean {
  const e = err as {
    code?: string;
    constraint?: string;
    driverError?: { code?: string; constraint?: string };
  };
  const code = e.code ?? e.driverError?.code;
  const name = e.constraint ?? e.driverError?.constraint;
  return code === '23505' && name === constraint;
}

/** Phụ trách: TV2 Châu Anh
 * - register(): hash bcrypt, tạo User + Account trong 1 DB transaction
 * - login(): sẽ làm ở task 3  
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly accountsService: AccountsService,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    // Hash TRƯỚC khi mở transaction — đừng giữ transaction chờ ~100ms hash CPU
    const passwordHash = await hash(dto.password, BCRYPT_COST);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const userResult = await manager.insert(User, {
          fullName: dto.fullName,
          email: dto.email,
          passwordHash,
        });
        const userId: string = userResult.identifiers[0].id;

        const account = await this.accountsService.createForUser(
          manager,
          userId,
        );

        return {
          id: userId,
          fullName: dto.fullName,
          email: dto.email,
          accountNumber: account.accountNumber,
        };
      });
    } catch (err) {
      if (isUniqueViolation(err, 'users_email_key')) {
        throw new AppException(
          'EMAIL_ALREADY_EXISTS',
          'Email đã được sử dụng',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
  }
}
