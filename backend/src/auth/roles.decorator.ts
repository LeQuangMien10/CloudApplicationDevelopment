import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity.js';

export const ROLES_KEY = 'roles';

/** Khai báo vai trò được gọi endpoint:
 *   @Roles(UserRole.ADMIN)
 * Không gắn @Roles() thì mọi user đã đăng nhập đều gọi được. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
