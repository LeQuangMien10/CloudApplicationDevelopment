import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../users/entities/user.entity.js';
import { AppException } from '../common/exceptions/app.exception.js';
import { ROLES_KEY } from './roles.decorator.js';
import type { RequestUser } from './jwt.strategy.js';

/**
 * Phân quyền theo @Roles(). PHẢI đứng sau JwtAuthGuard trong @UseGuards()
 * để request.user đã được xác thực:
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Endpoint không khai báo @Roles() -> mọi user đã đăng nhập đều được gọi
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;

    if (!user || !required.includes(user.role)) {
      throw new AppException(
        'FORBIDDEN',
        'Không có quyền thực hiện hành động này',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
