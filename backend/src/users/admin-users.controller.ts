import {
  Body,
  Controller,
  Get,
  NotImplementedException,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';

/**
 * Phụ trách: TV2 Châu Anh. Tính năng bonus của đề, chỉ ADMIN được gọi.
 * TODO(TV2): @UseGuards(JwtAuthGuard, RolesGuard) và @Roles(UserRole.ADMIN)
 */
@ApiTags('admin')
@ApiBearerAuth()
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
