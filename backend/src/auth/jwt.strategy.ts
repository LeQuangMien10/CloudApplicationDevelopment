import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '../users/entities/user.entity.js';

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
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload): RequestUser {
    return { id: payload.sub, role: payload.role };
  }
}
