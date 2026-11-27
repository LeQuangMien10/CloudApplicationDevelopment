import { loadOutboxWorkerConfig } from './outbox-worker.config.js';

describe('loadOutboxWorkerConfig', () => {
  it('không đặt biến nào thì dùng mặc định', () => {
    expect(loadOutboxWorkerConfig({})).toEqual({
      pollIntervalMs: 2000,
      batchSize: 20,
      maxAttempts: 5,
      backoffBaseMs: 5000,
      backoffMaxMs: 600_000,
    });
  });

  it('đọc giá trị từ biến môi trường, bỏ khoảng trắng thừa', () => {
    expect(
      loadOutboxWorkerConfig({
        OUTBOX_POLL_INTERVAL_MS: '500',
        OUTBOX_BATCH_SIZE: ' 50 ',
        OUTBOX_MAX_ATTEMPTS: '3',
        OUTBOX_BACKOFF_BASE_MS: '1000',
        OUTBOX_BACKOFF_MAX_MS: '60000',
      }),
    ).toEqual({
      pollIntervalMs: 500,
      batchSize: 50,
      maxAttempts: 3,
      backoffBaseMs: 1000,
      backoffMaxMs: 60_000,
    });
  });

  it('biến rỗng coi như không đặt', () => {
    expect(loadOutboxWorkerConfig({ OUTBOX_BATCH_SIZE: '' }).batchSize).toBe(
      20,
    );
  });

  it.each(['0', '-1', '1.5', 'abc', '10s', '007'])(
    'giá trị "%s" không phải số nguyên dương thì báo lỗi ngay',
    (value) => {
      expect(() =>
        loadOutboxWorkerConfig({ OUTBOX_MAX_ATTEMPTS: value }),
      ).toThrow('OUTBOX_MAX_ATTEMPTS phải là số nguyên dương');
    },
  );

  it('backoff tối đa nhỏ hơn backoff ban đầu thì báo lỗi', () => {
    expect(() =>
      loadOutboxWorkerConfig({
        OUTBOX_BACKOFF_BASE_MS: '10000',
        OUTBOX_BACKOFF_MAX_MS: '5000',
      }),
    ).toThrow('OUTBOX_BACKOFF_MAX_MS');
  });
});
