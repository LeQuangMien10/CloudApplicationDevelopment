import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setupApp(app);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(
    `API: http://localhost:${port}/api  |  Swagger: http://localhost:${port}/api/docs`,
    'Bootstrap',
  );
}
await bootstrap();
