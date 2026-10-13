import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Gắn requestId cho mỗi request: dùng lại header X-Request-Id nếu client gửi, không thì tự sinh. */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.header(REQUEST_ID_HEADER);
    const requestId =
      incoming && incoming.length <= 64 ? incoming : randomUUID();
    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}
