import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { setTimeout as sleep } from 'node:timers/promises';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/database/typeorm.config.js';
import {
  OutboxEvent,
  OutboxEventStatus,
  OutboxEventType,
} from '../src/outbox/entities/outbox-event.entity.js';
import {
  type OutboxHandler,
  OutboxHandlerRegistry,
} from '../src/worker/outbox-handler.registry.js';
import {
  OUTBOX_WORKER_CONFIG,
  type OutboxWorkerConfig,
} from '../src/worker/outbox-worker.config.js';
import { OutboxWorkerModule } from '../src/worker/outbox-worker.module.js';
import { OutboxProcessor } from '../src/worker/outbox.processor.js';
import { openOwnerDataSource } from './support/owner-data-source.js';

/**
 * Loại sự kiện chỉ dùng trong test. Worker chỉ lấy loại đã đăng ký handler, nên sự kiện thật
 * (TRANSFER_COMPLETED do file test khác để lại) không bị đụng tới.
 */
const TYPE = {
  OK: 'E2E_WORKER_OK',
  FAIL: 'E2E_WORKER_FAIL',
  SIDE_EFFECT: 'E2E_WORKER_SIDE_EFFECT',
  CONCURRENT: 'E2E_WORKER_CONCURRENT',
  UNHANDLED: 'E2E_WORKER_UNHANDLED',
} as const;

const CONFIG: OutboxWorkerConfig = {
  pollIntervalMs: 100,
  batchSize: 20,
  maxAttempts: 3,
  backoffBaseMs: 60_000,
  backoffMaxMs: 600_000,
};

describe('Worker xử lý outbox (F5, e2e)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let owner: DataSource;
  let processor: OutboxProcessor;
  /** Handler của từng loại test, đổi được trong từng test */
  const handlers = new Map<string, OutboxHandler>();

  const register = (type: string, handler: OutboxHandler) =>
    handlers.set(type, handler);

  /** Chèn sự kiện bằng user của app, trả id */
  const insertEvent = async (
    eventType: string,
    payload: Record<string, unknown> = {},
    extra: { attempts?: number; availableAt?: string } = {},
  ) => {
    const [{ id }] = (await dataSource.query(
      `INSERT INTO outbox_events (event_type, payload, attempts, available_at)
       VALUES ($1, $2::jsonb, $3, COALESCE($4::timestamptz, now()))
       RETURNING id`,
      [
        eventType,
        JSON.stringify(payload),
        extra.attempts ?? 0,
        extra.availableAt ?? null,
      ],
    )) as { id: string }[];
    return id;
  };

  const findEvent = (id: string) =>
    dataSource.getRepository(OutboxEvent).findOneByOrFail({ id });

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env', '../.env'],
        }),
        TypeOrmModule.forRootAsync({
          useFactory: () => buildDataSourceOptions(),
        }),
        OutboxWorkerModule,
      ],
    })
      .overrideProvider(OUTBOX_WORKER_CONFIG)
      .useValue(CONFIG)
      .compile();
    await moduleRef.init();

    dataSource = moduleRef.get(DataSource);
    processor = moduleRef.get(OutboxProcessor);
    owner = await openOwnerDataSource();

    // Đăng ký một lần, mỗi test đổi hành vi qua map handlers
    const registry = moduleRef.get(OutboxHandlerRegistry);
    for (const type of [
      TYPE.OK,
      TYPE.FAIL,
      TYPE.SIDE_EFFECT,
      TYPE.CONCURRENT,
    ]) {
      registry.register(type as OutboxEventType, (manager, payload) =>
        handlers.get(type)!(manager, payload),
      );
    }
  });

  afterEach(async () => {
    handlers.clear();
    // banking_app không có DELETE trên outbox_events, dọn bằng owner
    await owner.query(
      `DELETE FROM outbox_events WHERE event_type LIKE 'E2E_WORKER_%'`,
    );
  });

  afterAll(async () => {
    await owner.destroy();
    await moduleRef.close();
  });

  it('1. handler chạy xong: sự kiện done, có processed_at, handler nhận đúng payload', async () => {
    const received: unknown[] = [];
    register(TYPE.OK, async (_manager, payload) => {
      received.push(payload);
    });
    const id = await insertEvent(TYPE.OK, {
      transactionId: 'tx-1',
      amount: '1.00',
    });

    await expect(processor.processNext()).resolves.toEqual({
      eventId: id,
      eventType: TYPE.OK,
      outcome: 'done',
    });

    expect(received).toEqual([{ transactionId: 'tx-1', amount: '1.00' }]);
    const event = await findEvent(id);
    expect(event).toMatchObject({
      status: OutboxEventStatus.DONE,
      attempts: 0,
      lastError: null,
    });
    expect(event.processedAt).toBeInstanceOf(Date);
  });

  it('2. handler lỗi: tăng attempts, ghi last_error, lùi available_at theo backoff', async () => {
    register(TYPE.FAIL, () => Promise.reject(new Error('boom')));
    const id = await insertEvent(TYPE.FAIL);

    await expect(processor.processNext()).resolves.toMatchObject({
      eventId: id,
      outcome: 'retry',
    });

    const event = await findEvent(id);
    expect(event).toMatchObject({
      status: OutboxEventStatus.PENDING,
      attempts: 1,
      lastError: 'Error: boom',
      processedAt: null,
    });
    // Lần lỗi đầu chờ backoffBaseMs (60 giây), so bằng đồng hồ DB
    const [{ delaySeconds }] = (await dataSource.query(
      `SELECT extract(epoch FROM available_at - now())::float AS "delaySeconds"
       FROM outbox_events WHERE id = $1`,
      [id],
    )) as { delaySeconds: number }[];
    expect(delaySeconds).toBeGreaterThan(55);
    expect(delaySeconds).toBeLessThanOrEqual(60);

    // Chưa đến hạn thử lại thì không bị lấy
    await expect(processor.processNext()).resolves.toBeNull();
  });

  it('3. lỗi đến lần cuối: đánh dấu failed, có processed_at, không lấy lại nữa', async () => {
    register(TYPE.FAIL, () => Promise.reject(new Error('still broken')));
    const id = await insertEvent(
      TYPE.FAIL,
      {},
      { attempts: CONFIG.maxAttempts - 1 },
    );

    await expect(processor.processNext()).resolves.toMatchObject({
      eventId: id,
      outcome: 'failed',
    });

    const event = await findEvent(id);
    expect(event).toMatchObject({
      status: OutboxEventStatus.FAILED,
      attempts: CONFIG.maxAttempts,
      lastError: 'Error: still broken',
    });
    expect(event.processedAt).toBeInstanceOf(Date);
    await expect(processor.processNext()).resolves.toBeNull();
  });

  it('4. handler lỗi thì dữ liệu handler đã ghi cũng bị rollback', async () => {
    register(TYPE.SIDE_EFFECT, async (manager) => {
      // Ghi một dòng qua manager của worker rồi mới lỗi
      await manager.query(
        `INSERT INTO outbox_events (event_type, payload) VALUES ($1, '{}'::jsonb)`,
        [TYPE.UNHANDLED],
      );
      throw new Error('fail after write');
    });
    const id = await insertEvent(TYPE.SIDE_EFFECT);

    await expect(processor.processNext()).resolves.toMatchObject({
      outcome: 'retry',
    });

    await expect(
      dataSource
        .getRepository(OutboxEvent)
        .countBy({ eventType: TYPE.UNHANDLED as OutboxEventType }),
    ).resolves.toBe(0);
    await expect(findEvent(id)).resolves.toMatchObject({ attempts: 1 });
  });

  it('5. sự kiện chưa đến hạn và loại chưa có handler đều giữ nguyên pending', async () => {
    register(TYPE.OK, async () => {});
    const future = await insertEvent(
      TYPE.OK,
      {},
      {
        availableAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    );
    const unhandled = await insertEvent(TYPE.UNHANDLED);

    await expect(processor.processBatch()).resolves.toBe(0);

    for (const id of [future, unhandled]) {
      await expect(findEvent(id)).resolves.toMatchObject({
        status: OutboxEventStatus.PENDING,
        attempts: 0,
      });
    }
  });

  it('6. processBatch xử lý tối đa batchSize sự kiện mỗi lần', async () => {
    register(TYPE.OK, async () => {});
    for (let i = 0; i < CONFIG.batchSize + 5; i++) {
      await insertEvent(TYPE.OK);
    }

    await expect(processor.processBatch()).resolves.toBe(CONFIG.batchSize);
    await expect(processor.processBatch()).resolves.toBe(5);
    await expect(processor.processBatch()).resolves.toBe(0);
  });

  it('7. nhiều worker chạy song song: mỗi sự kiện được xử lý đúng một lần (SKIP LOCKED)', async () => {
    const EVENTS = 30;
    const WORKERS = 4;
    const handled: string[] = [];
    register(TYPE.CONCURRENT, async (_manager, payload) => {
      // Giữ khóa một lúc để các worker thật sự chạy chồng lên nhau
      await sleep(20);
      handled.push((payload as { n: string }).n);
    });
    for (let i = 0; i < EVENTS; i++) {
      await insertEvent(TYPE.CONCURRENT, { n: String(i) });
    }

    const counts = await Promise.all(
      Array.from({ length: WORKERS }, () => processor.processBatch()),
    );

    expect(counts.reduce((a, b) => a + b, 0)).toBe(EVENTS);
    expect(handled).toHaveLength(EVENTS);
    expect(new Set(handled).size).toBe(EVENTS);
    // Có ít nhất 2 worker cùng lấy được việc, tức chạy song song thật
    expect(counts.filter((c) => c > 0).length).toBeGreaterThan(1);
    await expect(
      dataSource.getRepository(OutboxEvent).countBy({
        eventType: TYPE.CONCURRENT as OutboxEventType,
        status: OutboxEventStatus.DONE,
      }),
    ).resolves.toBe(EVENTS);
  }, 30_000);
});
