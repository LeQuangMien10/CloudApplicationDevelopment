import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { UserRole } from '../users/entities/user.entity.js';
import { AuditService } from './audit.service.js';
import { ListAuditLogsQuery } from './dto/list-audit-logs.query.js';

/** Phụ trách: TV2 Châu Anh. Chỉ auditor (chỉ đọc) và admin được tra cứu. */
@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.AUDITOR, UserRole.ADMIN)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({
    summary: 'Tra cứu audit log, có bộ lọc actorId/action/from/to/requestId',
  })
  list(@Query() query: ListAuditLogsQuery) {
    return this.auditService.findPaginated(query);
  }
}
