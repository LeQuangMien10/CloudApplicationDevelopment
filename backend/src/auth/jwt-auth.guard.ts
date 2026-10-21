import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppException } from '../common/exceptions/app.exception.js';

/** Bảo vệ endpoint: yêu cầu Authorization: Bearer <token> hợp lệ. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  /** Ghi đè để trả 401 đúng format lỗi chung thay vì JSON mặc định của Passport. */
  handleRequest<TUser>(
    err: unknown,
    user: TUser | false,
    info: unknown,
  ): TUser {
    void info;
    if (err || !user) {
      throw new AppException(
        'UNAUTHORIZED',
        'Chưa đăng nhập hoặc token không hợp lệ',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return user;
  }
}
