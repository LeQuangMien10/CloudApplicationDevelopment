import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from './accounts/accounts.module.js';
import { AuthModule } from './auth/auth.module.js';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { buildDataSourceOptions } from './database/typeorm.config.js';
import { HealthController } from './health/health.controller.js';
import { TransactionsModule } from './transactions/transactions.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    // Đọc .env ở thư mục backend, sau đó ở thư mục gốc repo
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    TypeOrmModule.forRootAsync({ useFactory: () => buildDataSourceOptions() }),
    UsersModule,
    AccountsModule,
    AuthModule,
    TransactionsModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*path');
  }
}
