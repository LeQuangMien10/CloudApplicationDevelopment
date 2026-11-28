import type { DataSource, EntityManager } from 'typeorm';
import { OutboxEventType } from '../outbox/entities/outbox-event.entity.js';
import { OutboxHandlerRegistry } from './outbox-handler.registry.js';
import type { OutboxWorkerConfig } from './outbox-worker.config.js';
import { OutboxProcessor } from './outbox.processor.js';

describe('OutboxProcessor', () => {
  const config: OutboxWorkerConfig = {
    pollIntervalMs: 100,
    batchSize: 20,
    maxAttempts: 3,
    backoffBaseMs: 5000,
    backoffMaxMs: 60_000,
  };
  const event = {
    id: 'evt-1',
    eventType: OutboxEventType.TRANSFER_COMPLETED,
    payload: { transactionId: 'tx-1' },
    attempts: 1,
  };
  const manager = { query: vi.fn() };
  const dataSource = {
    transaction: vi.fn(async (cb: (m: EntityManager) => unknown) =>
      cb(manager as unknown as EntityManager),
    ),
    query: vi.fn(),
  };
  let registry: OutboxHandlerRegistry;
  let processor: OutboxProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new OutboxHandlerRegistry();
    processor = new OutboxProcessor(
      dataSource as unknown as DataSource,
      registry,
      config,
    );
  });

  it('chưa có handler nào thì không truy vấn DB', async () => {
    await expect(processor.processNext()).resolves.toBeNull();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('lỗi khi lấy sự kiện (chưa lấy được sự kiện nào) thì ném ra cho vòng poll', async () => {
    registry.register(OutboxEventType.TRANSFER_COMPLETED, async () => {});
    manager.query.mockRejectedValueOnce(new Error('connection lost'));

    await expect(processor.processNext()).rejects.toThrow('connection lost');
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('handler lỗi: ghi lần lỗi với backoff theo số lần đã lỗi, cắt ngắn last_error', async () => {
    registry.register(OutboxEventType.TRANSFER_COMPLETED, () =>
      Promise.reject(new Error('x'.repeat(5000))),
    );
    manager.query.mockResolvedValueOnce([event]);
    dataSource.query.mockResolvedValueOnce([
      [{ status: 'pending', attempts: 2 }],
      1,
    ]);

    await expect(processor.processNext()).resolves.toEqual({
      eventId: 'evt-1',
      eventType: OutboxEventType.TRANSFER_COMPLETED,
      outcome: 'retry',
    });

    const [, params] = dataSource.query.mock.calls[0] as [string, unknown[]];
    const [id, lastError, maxAttempts, , backoffMs] = params;
    expect(id).toBe('evt-1');
    expect((lastError as string).length).toBe(1000);
    expect(maxAttempts).toBe(3);
    // Đã lỗi 1 lần trước đó, lần này là lần 2: 5000 · 2 = 10000
    expect(backoffMs).toBe(10_000);
  });

  it('worker khác đã xử lý xong sự kiện trước khi kịp ghi lỗi thì trả skipped', async () => {
    registry.register(OutboxEventType.TRANSFER_COMPLETED, () =>
      Promise.reject(new Error('boom')),
    );
    manager.query.mockResolvedValueOnce([event]);
    dataSource.query.mockResolvedValueOnce([[], 0]);

    await expect(processor.processNext()).resolves.toMatchObject({
      outcome: 'skipped',
    });
  });
});

describe('OutboxHandlerRegistry', () => {
  it('không cho đăng ký hai handler cho cùng một loại sự kiện', () => {
    const registry = new OutboxHandlerRegistry();
    registry.register(OutboxEventType.TRANSFER_COMPLETED, async () => {});

    expect(() =>
      registry.register(OutboxEventType.TRANSFER_COMPLETED, async () => {}),
    ).toThrow('Đã có handler cho sự kiện TRANSFER_COMPLETED');
    expect(registry.eventTypes()).toEqual([OutboxEventType.TRANSFER_COMPLETED]);
  });
});
