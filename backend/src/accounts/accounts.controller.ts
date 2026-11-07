import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { RequestUser } from '../auth/jwt.strategy.js';
import { AccountsService } from './accounts.service.js';

/**
 * Phụ trách: TV3 Nhật
 * TODO(TV2 cung cấp guard): @UseGuards(JwtAuthGuard), lấy user từ @CurrentUser()
 */
@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Tài khoản và số dư của người đang đăng nhập' })
  getMyAccounts(@CurrentUser() user: RequestUser) {
    return this.accountsService.findByUserId(user.id);
  }
  // Thêm endpoint tra cứu (đặt bên dưới getMyAccounts)
  @Get('lookup/:accountNumber')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Tra cứu tên chủ tài khoản theo số tài khoản' })
  lookup(@Param('accountNumber') accountNumber: string) {
    return this.accountsService.lookupByAccountNumber(accountNumber);
  }
}
