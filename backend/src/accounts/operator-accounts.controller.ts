import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
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
import { LookupAccountQuery } from './dto/lookup-account.query.js';
import { UpdateAccountStatusDto } from './dto/update-account-status.dto.js';

/**
 * Phụ trách: TV2 Châu Anh. Operator khóa/mở tài khoản ngân hàng khi nghi ngờ
 * gian lận (F3), tra cứu tài khoản theo số tài khoản (Issue #11).
 * @Roles() khai báo ở từng method vì GET nhận cả Auditor còn PATCH thì không.
 */
@ApiTags('operator')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('operator/accounts')
export class OperatorAccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  @Roles(UserRole.OPERATOR, UserRole.AUDITOR, UserRole.ADMIN)
  @ApiQuery({ name: 'accountNumber', description: 'Số tài khoản gồm 12 chữ số' })
  @ApiOperation({
    summary:
      'Tra cứu tài khoản theo số tài khoản, trả id để gọi API khóa/mở. Auditor không nhận số dư.',
  })
  @ApiResponse({
    status: 200,
    description:
      '{ id, accountNumber, fullName, status, isSystem, balance?, currency? }',
  })
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 404, description: 'ACCOUNT_NOT_FOUND' })
  lookup(
    @CurrentUser() staff: RequestUser,
    @Query() query: LookupAccountQuery,
  ) {
    return this.accountsService.findByAccountNumberForStaff(
      query.accountNumber,
      staff.role,
    );
  }

  @Patch(':id/status')
  @Roles(UserRole.OPERATOR, UserRole.ADMIN)
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
