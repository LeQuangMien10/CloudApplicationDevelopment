import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { parseTrustProxyHops } from './common/throttling/env-limits.js';

/** Cấu hình dùng chung cho main.ts và e2e test. */
export function setupApp(app: INestApplication) {
  // Request đi qua 2 lớp proxy (Caddy rồi nginx), xem parseTrustProxyHops. Tin đúng số lớp
  // để req.ip là IP client thật: rate limit đăng nhập (F9) đếm theo IP và audit_logs.ip
  // ghi IP của khách, không phải IP của proxy.
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', parseTrustProxyHops(process.env.TRUST_PROXY_HOPS));
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? 'http://localhost:5173',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Dữ liệu không hợp lệ',
          details: errors.flatMap((e) => Object.values(e.constraints ?? {})),
        }),
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Digital Banking Simulator API')
    .setDescription('Lỗi trả về dạng { code, message, requestId, details? }')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, () =>
    SwaggerModule.createDocument(app, swaggerConfig),
  );
}
