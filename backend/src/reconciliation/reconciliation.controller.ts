import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
import type { RequestUser } from '../auth/jwt.strategy.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { UserRole } from '../users/entities/user.entity.js';
import { ListReconciliationReportsQuery } from './dto/list-reconciliation-reports.query.js';
import { ReconciliationTrigger } from './entities/reconciliation-report.entity.js';
import { ReconciliationService } from './reconciliation.service.js';

/** Phụ trách: TV1 Miền. Auditor chỉ xem báo cáo, admin xem và chạy tay (F7). */
@ApiTags('reconciliation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.AUDITOR, UserRole.ADMIN)
@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Get('reports')
  @ApiOperation({ summary: 'Danh sách báo cáo đối soát, mới nhất trước' })
  list(@Query() query: ListReconciliationReportsQuery) {
    return this.reconciliationService.findPaginated(query);
  }

  @Get('reports/:id')
  @ApiOperation({ summary: 'Chi tiết một báo cáo đối soát' })
  @ApiResponse({ status: 404, description: 'RECONCILIATION_REPORT_NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.reconciliationService.findOne(id);
  }

  @Post('run')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Chạy đối soát ngay, trả về báo cáo vừa lưu. Ghi audit log',
  })
  @ApiResponse({ status: 201, description: 'Báo cáo, status ok hoặc mismatch' })
  @ApiResponse({
    status: 409,
    description: 'RECONCILIATION_IN_PROGRESS: đang có lần đối soát khác chạy',
  })
  run(@CurrentUser() admin: RequestUser) {
    return this.reconciliationService.run({
      trigger: ReconciliationTrigger.MANUAL,
      actor: admin,
    });
  }
}
