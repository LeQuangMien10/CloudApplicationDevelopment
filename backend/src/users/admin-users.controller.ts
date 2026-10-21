import {
  Body,
  Controller,
  Get,
  NotImplementedException,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { UserRole } from './entities/user.entity.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';

/** Phụ trách: TV2 Châu Anh. Tính năng bonus của đề, chỉ ADMIN được gọi. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  @Get()
  @ApiOperation({ summary: '(Bonus) Danh sách người dùng' })
  list() {
    throw new NotImplementedException();
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '(Bonus) Khóa hoặc mở người dùng' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    void id;
    void dto;
    throw new NotImplementedException();
  }
}
