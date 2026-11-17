import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import type { RequestUser } from '../auth/jwt.strategy.js';
import { UserRole } from '../users/entities/user.entity.js';
import { AccountsService } from './accounts.service.js';
import { UpdateAccountStatusDto } from './dto/update-account-status.dto.js';

/** Phụ trách: TV2 Châu Anh. Operator khóa/mở tài khoản ngân hàng khi nghi ngờ gian lận (F3). */
@ApiTags('operator')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OPERATOR, UserRole.ADMIN)
@Controller('operator/accounts')
export class OperatorAccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Khóa hoặc mở tài khoản ngân hàng, bắt buộc reason khi khóa',
  })
  @ApiResponse({
    status: 200,
    description: '{ id, accountNumber, status, updatedAt }',
  })
  @ApiResponse({ status: 404, description: 'ACCOUNT_NOT_FOUND' })
  @ApiResponse({
    status: 422,
    description:
      'CANNOT_MODIFY_SYSTEM_ACCOUNT - tài khoản quỹ không đổi được; ACCOUNT_CLOSED - tài khoản đã đóng, không khóa/mở được',
  })
  updateStatus(
    @CurrentUser() operator: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountStatusDto,
  ) {
    return this.accountsService.updateStatus(id, dto.status, dto.reason, operator);
  }
}
