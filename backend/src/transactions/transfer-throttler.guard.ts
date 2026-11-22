import { Injectable } from '@nestjs/common';
import { RateLimitedGuard } from '../common/throttling/rate-limited.guard.js';

/**
 * F9: giới hạn chuyển khoản theo USER, mặc định 30 lần/phút
 * (RATE_LIMIT_TRANSFER_PER_MIN) — khác đăng nhập (theo IP): một NAT chung
 * nhiều khách hàng không được trừ vào nhau. Phải đứng SAU JwtAuthGuard trong
 * @UseGuards(JwtAuthGuard, TransferThrottlerGuard) để có request.user.
 */
@Injectable()
export class TransferThrottlerGuard extends RateLimitedGuard {
  protected override async getTracker(
    req: Record<string, any>,
  ): Promise<string> {
    const user = req.user as { id?: string } | undefined;
    return user?.id ?? req.ip;
  }
}
