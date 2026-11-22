import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import type { StringValue } from 'ms';
import { AccountsModule } from '../accounts/accounts.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { UsersModule } from '../users/users.module.js';
import { LoginAttempt } from './entities/login-attempt.entity.js';
import { LoginAttemptsService } from './login-attempts.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';

/** Env rỗng hoặc không phải số dương thì dùng mặc định. */
export function parsePositiveInt(raw: string | undefined, fallback: number) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

@Module({
  imports: [
    UsersModule,
    AccountsModule,
    AuditModule,
    PassportModule,
    TypeOrmModule.forFeature([LoginAttempt]),
    // F9: rate limit đăng nhập theo IP, ngưỡng chỉnh qua env để demo/load test không phải sửa code
    ThrottlerModule.forRoot([
      {
        name: 'login-ip',
        ttl: 60_000,
        limit: () => parsePositiveInt(process.env.RATE_LIMIT_LOGIN_PER_MIN, 5),
      },
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ??
            '15m') as StringValue,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LoginAttemptsService],
})
export class AuthModule {}
