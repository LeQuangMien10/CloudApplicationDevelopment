import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import { AppException } from '../exceptions/app.exception.js';

/**
 * F9: lớp guard rate limit dùng chung — vượt ngưỡng trả 429 RATE_LIMITED theo
 * định dạng lỗi chung của hệ thống, kèm details.retryAfter (giây) để client
 * biết khi nào thử lại được. Lớp con chọn tracker (IP hay user) qua getTracker.
 */
export class RateLimitedGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<never> {
    throw new AppException(
      'RATE_LIMITED',
      'Quá nhiều yêu cầu, thử lại sau',
      HttpStatus.TOO_MANY_REQUESTS,
      {
        retryAfter: Math.max(1, Math.ceil(throttlerLimitDetail.timeToBlockExpire)),
      },
    );
  }
}
