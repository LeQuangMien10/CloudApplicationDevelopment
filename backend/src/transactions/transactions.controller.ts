import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ListTransactionsQuery } from './dto/list-transactions.query.js';
import { TransferDto } from './dto/transfer.dto.js';
import { TransactionsService } from './transactions.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { RequestUser } from '../auth/jwt.strategy.js';

/**
 * Phụ trách: TV3 Nhật
 * TODO(TV2 cung cấp guard): @UseGuards(JwtAuthGuard), lấy user từ @CurrentUser()
 */
@ApiTags('transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('transfer')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Chuyển khoản nội bộ trong 1 DB transaction' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID do client sinh khi mở form, giữ nguyên khi gửi lại',
  })
  @ApiResponse({ status: 201, description: 'COMPLETED' })
  @ApiResponse({
    status: 400,
    description:
      'IDEMPOTENCY_KEY_REQUIRED; VALIDATION_ERROR (sai body hoặc key dài quá 64 ký tự)',
  })
  @ApiResponse({
    status: 404,
    description: 'SENDER_ACCOUNT_NOT_FOUND, TARGET_ACCOUNT_NOT_FOUND',
  })
  @ApiResponse({
    status: 409,
    description: 'IDEMPOTENCY_CONFLICT: cùng key nhưng khác nội dung',
  })
  @ApiResponse({
    status: 422,
    description:
      'SENDER_ACCOUNT_NOT_ACTIVE, TARGET_ACCOUNT_NOT_ACTIVE, INSUFFICIENT_FUNDS, SAME_ACCOUNT',
  })
  transfer(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: RequestUser,
    @Body() dto: TransferDto,
  ) {
    return this.transactionsService.transfer(user.id, idempotencyKey, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Lịch sử giao dịch của tôi: tiền vào, tiền ra, phân trang',
  })
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: ListTransactionsQuery,
  ) {
    return this.transactionsService.getTransactionHistory(user.id, query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Chi tiết và trạng thái một giao dịch',
  })
  getOne(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) transactionId: string,
  ) {
    return this.transactionsService.getTransactionById(user.id, transactionId);
  }
}
