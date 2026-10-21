import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
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
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import type { RequestUser } from '../auth/jwt.strategy.js';
import { AppException } from '../common/exceptions/app.exception.js';
import { UserRole, UserStatus } from './entities/user.entity.js';
import { ListUsersQuery } from './dto/list-users.query.js';
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
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR (page < 1...)' })
  list(@Query() query: ListUsersQuery) {
    return this.usersService.findPaginated(query.page, query.limit);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '(Bonus) Khóa hoặc mở người dùng' })
  @ApiResponse({ status: 200, description: 'User sau khi cập nhật trạng thái' })
  @ApiResponse({ status: 404, description: 'USER_NOT_FOUND' })
  @ApiResponse({
    status: 422,
    description: 'CANNOT_LOCK_SELF - admin không thể tự khóa mình',
  })
  async updateStatus(
    @CurrentUser() admin: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    if (admin.id === id && dto.status === UserStatus.LOCKED) {
      throw new AppException(
        'CANNOT_LOCK_SELF',
        'Không thể tự khóa tài khoản của chính mình',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
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
