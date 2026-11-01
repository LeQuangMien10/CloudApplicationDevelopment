import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception.js';

/**
 * Phụ trách: TV5 Hiếu
 * Dùng cho Docker HEALTHCHECK và kiểm tra sau khi deploy lên cloud.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({ summary: 'Kiểm tra app và kết nối database' })
  async check() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new AppException(
        'DB_UNAVAILABLE',
        'Database không phản hồi',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { status: 'ok', db: 'up', time: new Date().toISOString() };
  }
}
