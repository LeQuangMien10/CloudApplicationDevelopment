import { Module } from '@nestjs/common';
import { OutboxHandlerRegistry } from './outbox-handler.registry.js';
import {
  loadOutboxWorkerConfig,
  OUTBOX_WORKER_CONFIG,
} from './outbox-worker.config.js';
import { OutboxProcessor } from './outbox.processor.js';

/**
 * Xử lý outbox trong worker (F5). Module có handler (ví dụ F6) import module này để lấy
 * OutboxHandlerRegistry và đăng ký trong onModuleInit.
 */
@Module({
  providers: [
    OutboxHandlerRegistry,
    OutboxProcessor,
    {
      provide: OUTBOX_WORKER_CONFIG,
      useFactory: () => loadOutboxWorkerConfig(),
    },
  ],
  exports: [OutboxHandlerRegistry, OutboxProcessor],
})
export class OutboxWorkerModule {}
