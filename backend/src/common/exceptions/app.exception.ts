import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Lỗi nghiệp vụ có mã lỗi riêng, ví dụ:
 *   throw new AppException('INSUFFICIENT_FUNDS', 'Số dư không đủ', HttpStatus.UNPROCESSABLE_ENTITY);
 * HttpExceptionFilter sẽ trả về { code, message, requestId }.
 */
export class AppException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}
