import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotImplementedException,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { LoginDto, LoginResponseDto, RegisterDto } from './dto/auth.dto.js';

/** Phụ trách: TV2 Châu Anh */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Đăng ký khách hàng, tự tạo 1 tài khoản VND số dư 0',
  })
  @ApiResponse({ status: 201, description: 'Tạo thành công' })
  @ApiResponse({ status: 409, description: 'EMAIL_ALREADY_EXISTS' })
  register(@Body() dto: RegisterDto) {
    // TODO(TV2): hash bcrypt, tạo user + account trong 1 DB transaction, không trả passwordHash
    void dto;
    throw new NotImplementedException();
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập bằng email + mật khẩu, trả JWT' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiResponse({ status: 401, description: 'INVALID_CREDENTIALS' })
  login(@Body() dto: LoginDto): LoginResponseDto {
    // TODO(TV2): kiểm tra user active, bcrypt.compare, ký JWT { sub, role }
    void dto;
    throw new NotImplementedException();
  }
}
