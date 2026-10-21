import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestUser } from './jwt.strategy.js';

/**
 * Lấy user từ JWT trong handler:
 *   me(@CurrentUser() user: RequestUser) { ... user.id, user.role }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    return ctx.switchToHttp().getRequest<Record<string, RequestUser>>().user;
  },
);

export type { RequestUser };
