import {
  Body,
  Controller,
  Get,
  Headers,
  NotImplementedException,
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
  constructor(private readonly transactionsService: TransactionsService) { }

  @Post('transfer')
  @ApiOperation({ summary: 'Chuyển khoản nội bộ trong 1 DB transaction' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID do client sinh khi mở form, giữ nguyên khi gửi lại',
  })
  @ApiResponse({ status: 201, description: 'COMPLETED' })
  @ApiResponse({
    status: 409,
    description: 'IDEMPOTENCY_CONFLICT: cùng key nhưng khác nội dung',
  })
  @ApiResponse({
    status: 422,
    description: 'INSUFFICIENT_FUNDS, ACCOUNT_NOT_ACTIVE, SAME_ACCOUNT, ...',
  })
  transfer(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: TransferDto,
  ) {
    // TODO(TV3): xem các bước trong transactions.service.ts
    void idempotencyKey;
    void dto;
    throw new NotImplementedException();
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Lịch sử giao dịch của tôi: tiền vào, tiền ra, phân trang',
  })
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: ListTransactionsQuery) {
    return this.transactionsService.getTransactionHistory(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết và trạng thái một giao dịch' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    void id;
    throw new NotImplementedException();
  }
}
