import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/** Định dạng lỗi chung cho mọi API: { code, message, requestId, details? } */
export interface ErrorBody {
  code: string;
  message: string;
  requestId?: string;
  details?: unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = { code: 'INTERNAL_ERROR', message: 'Lỗi hệ thống' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      const r = (
        typeof response === 'object' && response !== null ? response : {}
      ) as Record<string, unknown>;
      body = {
        code:
          typeof r.code === 'string' ? r.code : (HttpStatus[status] ?? 'ERROR'),
        message: typeof r.message === 'string' ? r.message : exception.message,
        details: r.details,
      };
    } else {
      this.logger.error(
        `[${req.requestId}] ${String(exception)}`,
        (exception as Error)?.stack,
      );
    }

    body.requestId = req.requestId;
    res.status(status).json(body);
  }
}
