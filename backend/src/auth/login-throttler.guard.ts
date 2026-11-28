import { Injectable } from '@nestjs/common';
import { RateLimitedGuard } from '../common/throttling/rate-limited.guard.js';

/**
 * F9: giới hạn đăng nhập theo IP, mặc định 5 lần/phút
 * (RATE_LIMIT_LOGIN_PER_MIN). Tracker mặc định của ThrottlerGuard là IP —
 * dùng nguyên trạng. Gắn trên POST /auth/login bằng @UseGuards.
 */
@Injectable()
export class LoginThrottlerGuard extends RateLimitedGuard {}
