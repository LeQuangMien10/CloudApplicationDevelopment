import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [UsersModule, AccountsModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
