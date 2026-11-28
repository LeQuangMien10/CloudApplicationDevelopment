import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { LoginThrottlerGuard } from './login-throttler.guard.js';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { RequestUser } from './jwt.strategy.js';
import {
  LoginDto,
  LoginResponseDto,
  RegisterDto,
  RegisterResponseDto,
} from './dto/auth.dto.js';

/** Phụ trách: TV2 Châu Anh */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Đăng ký khách hàng, tự tạo 1 tài khoản VND số dư 0',
  })
  @ApiResponse({ status: 201, type: RegisterResponseDto })
  @ApiResponse({ status: 409, description: 'EMAIL_ALREADY_EXISTS' })
  register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LoginThrottlerGuard)
  @ApiOperation({ summary: 'Đăng nhập bằng email + mật khẩu, trả JWT' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiResponse({
    status: 401,
    description: 'INVALID_CREDENTIALS hoặc USER_LOCKED',
  })
  @ApiResponse({
    status: 423,
    description:
      'LOGIN_TEMPORARILY_LOCKED: sai mật khẩu đủ 5 lần trong 15 phút (F9), kèm details.retryAfter',
  })
  @ApiResponse({
    status: 429,
    description:
      'RATE_LIMITED: vượt ngưỡng đăng nhập theo IP (mặc định 5 lần/phút, F9), kèm details.retryAfter',
  })
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Thông tin người dùng đang đăng nhập (từ JWT)' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  me(@CurrentUser() user: RequestUser): RequestUser {
    return user;
  }
}
