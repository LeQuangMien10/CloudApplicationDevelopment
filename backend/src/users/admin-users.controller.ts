import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AppException } from '../common/exceptions/app.exception.js';
import { UserRole } from './entities/user.entity.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';
import { UsersService } from './users.service.js';

/** Phụ trách: TV2 Châu Anh. Tính năng bonus của đề, chỉ ADMIN được gọi. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: '(Bonus) Danh sách người dùng, phân trang' })
  @ApiResponse({ status: 200, description: '{ items, total, page, limit }' })
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.usersService.findPaginated(
      page,
      Math.min(Math.max(limit, 1), 100),
    );
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '(Bonus) Khóa hoặc mở người dùng' })
  @ApiResponse({ status: 200, description: 'User sau khi cập nhật trạng thái' })
  @ApiResponse({ status: 404, description: 'USER_NOT_FOUND' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    const user = await this.usersService.updateStatus(id, dto.status);
    if (!user) {
      throw new AppException(
        'USER_NOT_FOUND',
        'Không tìm thấy người dùng',
        HttpStatus.NOT_FOUND,
      );
    }
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
    };
  }
}
