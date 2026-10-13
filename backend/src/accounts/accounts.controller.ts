import { Controller, Get, NotImplementedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Phụ trách: TV3 Nhật
 * TODO(TV2 cung cấp guard): @UseGuards(JwtAuthGuard), lấy user từ @CurrentUser()
 */
@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts')
export class AccountsController {
  @Get('me')
  @ApiOperation({ summary: 'Tài khoản và số dư của người đang đăng nhập' })
  getMyAccounts() {
    // TODO(TV3): trả danh sách { id, accountNumber, balance, currency, status } của user hiện tại
    throw new NotImplementedException();
  }
}
