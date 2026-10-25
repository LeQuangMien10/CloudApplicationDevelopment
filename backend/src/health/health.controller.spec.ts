import { HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const dataSource = { query: vi.fn() };
  const controller = new HealthController(dataSource as unknown as DataSource);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('DB phản hồi -> status ok', async () => {
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]);

    const res = await controller.check();

    expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
    expect(res).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('DB lỗi -> 503 DB_UNAVAILABLE', async () => {
    dataSource.query.mockRejectedValue(new Error('connection refused'));

    const err = await controller.check().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).code).toBe('DB_UNAVAILABLE');
    expect((err as AppException).getStatus()).toBe(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  });
});
