import { Injectable } from '@nestjs/common';

/**
 * Phụ trách: TV2 Châu Anh
 * TODO(TV2):
 * - register(): hash bcrypt, tạo User + Account (generateAccountNumber) trong 1 DB transaction
 * - login(): kiểm tra mật khẩu, trạng thái user, ký JWT (cài thêm @nestjs/jwt, @nestjs/passport nếu cần)
 * - JwtAuthGuard, RolesGuard, decorator @Roles(), @CurrentUser() đặt trong src/auth/
 */
@Injectable()
export class AuthService {}
