import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppException } from '../common/exceptions/app.exception.js';
import { User, UserRole, UserStatus } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';

/** Payload nằm trong token do AuthService.login() ký. */
export interface JwtPayload {
  sub: string;
  role: UserRole;
}

export interface RequestUser {
  id: string;
  role: UserRole;
}

/**
 * Xác thực token ở header Authorization: Bearer <token>.
 * Chữ ký hợp lệ + chưa hết hạn thì validate() chạy; giá trị trả về gắn vào request.user.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Kiểm tra cả trạng thái user trong DB: khóa user có hiệu lực NGAY cả với
   * token đã cấp trước đó, token của user bị xóa cũng vô nghĩa.
   */
  async validate(payload: JwtPayload): Promise<RequestUser> {
    const user: User | null = await this.usersService.findById(payload.sub);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new AppException(
        'USER_LOCKED',
        'Tài khoản đã bị khóa hoặc không tồn tại',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return { id: user.id, role: user.role };
  }
}
