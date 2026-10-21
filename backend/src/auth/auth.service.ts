import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { DataSource } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service.js';
import { AppException } from '../common/exceptions/app.exception.js';
import { User, UserStatus } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import {
  LoginDto,
  LoginResponseDto,
  RegisterDto,
  RegisterResponseDto,
} from './dto/auth.dto.js';

const BCRYPT_COST = 12;

/**
 * Hash của một mật khẩu ngẫu nhiên. Khi email không tồn tại vẫn chạy
 * bcrypt.compare với hash này để thời gian phản hồi không tiết lộ
 * email có tồn tại trong hệ thống hay không (timing attack).
 */
const DUMMY_HASH =
  '$2b$12$VfMBfdYr4NiKjLwVlN9R6.CLZWXNTlpZy72bsJkUYc5c0wCBYscwG';

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
 * - login(): so khớp mật khẩu, kiểm tra trạng thái, ký JWT { sub, role }
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly accountsService: AccountsService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
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

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    // Luôn chạy bcrypt.compare (kể cả khi email không tồn tại) để thời gian
    // phản hồi đồng nhất; sai email hoặc sai mật khẩu -> cùng một thông báo
    const passwordOk = await compare(
      dto.password,
      user?.passwordHash ?? DUMMY_HASH,
    );
    if (!user || !passwordOk) {
      throw new AppException(
        'INVALID_CREDENTIALS',
        'Email hoặc mật khẩu không đúng',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // So khớp mật khẩu TRƯỚC, khóa SAU: chỉ người biết đúng mật khẩu mới thấy tài khoản bị khóa
    if (user.status !== UserStatus.ACTIVE) {
      throw new AppException(
        'USER_LOCKED',
        'Tài khoản đã bị khóa',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
    });
    const { exp, iat } = this.jwtService.decode(accessToken) as {
      exp: number;
      iat: number;
    };

    return { accessToken, expiresIn: exp - iat };
  }
}
