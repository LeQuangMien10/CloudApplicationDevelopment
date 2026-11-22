import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginAttempt } from './entities/login-attempt.entity.js';

/** Số lần sai liên tiếp cho phép trước khi khóa đăng nhập. */
export const LOCKOUT_THRESHOLD = 5;

/** Cửa sổ đếm và thời gian khóa: sai đủ ngưỡng thì phải chờ dòng fail cũ nhất rời khỏi cửa sổ này. */
export const LOCKOUT_WINDOW_MINUTES = 15;

/**
 * F9: ghi nhận các lần thử đăng nhập vào bảng login_attempts (append-only bằng
 * GRANT) và đếm số lần sai liên tiếp sau lần thành công gần nhất, trong cửa sổ
 * 15 phút. Truy vấn luôn giới hạn cửa sổ nên không cần job dọn dòng cũ.
 */
@Injectable()
export class LoginAttemptsService {
  private readonly logger = new Logger(LoginAttemptsService.name);

  constructor(
    @InjectRepository(LoginAttempt)
    private readonly attempts: Repository<LoginAttempt>,
  ) {}

  /**
   * Ghi một lần thử đăng nhập. Lỗi DB không được làm hỏng luồng đăng nhập —
   * chỉ warn: người dùng phải nhận 401/200 đúng định dạng dù bảng ghi bị trục trặc.
   */
  async record(
    emailNorm: string,
    ip: string | null,
    success: boolean,
  ): Promise<void> {
    try {
      await this.attempts.insert({ emailNorm, ip: ip ?? null, success });
    } catch (err) {
      this.logger.warn(
        `Ghi login_attempts thất bại cho ${emailNorm}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Số lần sai LIÊN TIẾP sau lần thành công gần nhất, tính trong cửa sổ 15 phút.
   * Đăng nhập thành công giữa chừng đưa bộ đếm về 0 mà không cần xóa dòng cũ:
   * điều kiện `created_at > max(created_at) WHERE success = true` bỏ qua mọi
   * dòng fail nằm trước lần thành công đó.
   */
  async recentFailures(
    emailNorm: string,
  ): Promise<{ count: number; oldestFailureAt: Date | null }> {
    const rows = await this.attempts.query(
      `SELECT created_at FROM login_attempts
       WHERE email_norm = $1 AND success = false
         AND created_at > now() - ($2 || ' minutes')::interval
         AND created_at > COALESCE(
           (SELECT max(created_at) FROM login_attempts
            WHERE email_norm = $1 AND success = true),
           '-infinity'::timestamptz)
       ORDER BY created_at ASC`,
      [emailNorm, String(LOCKOUT_WINDOW_MINUTES)],
    );
    const failures = rows as { created_at: Date }[];
    return {
      count: failures.length,
      oldestFailureAt: failures[0]?.created_at ?? null,
    };
  }
}
