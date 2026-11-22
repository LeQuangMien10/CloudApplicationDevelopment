import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  LOCKOUT_THRESHOLD,
  LoginAttemptsService,
} from './login-attempts.service.js';

describe('LoginAttemptsService', () => {
  const insert = vi.fn();
  const query = vi.fn();
  const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  const service = new LoginAttemptsService({
    insert,
    query,
  } as unknown as Repository<never>);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ghi một dòng attempt đủ email, ip và kết quả', async () => {
    insert.mockResolvedValue({});

    await service.record('an@example.com', '127.0.0.1', false);

    expect(insert).toHaveBeenCalledWith({
      emailNorm: 'an@example.com',
      ip: '127.0.0.1',
      success: false,
    });
  });

  it('lỗi DB khi ghi không làm hỏng luồng đăng nhập — chỉ warn', async () => {
    insert.mockRejectedValue(new Error('db down'));

    await expect(
      service.record('an@example.com', null, false),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('recentFailures trả count và thời điểm fail cũ nhất từ kết quả truy vấn', async () => {
    query.mockResolvedValue([
      { created_at: new Date('2026-11-22T10:00:00Z') },
      { created_at: new Date('2026-11-22T10:01:00Z') },
    ]);

    const res = await service.recentFailures('an@example.com');

    expect(res).toEqual({
      count: 2,
      oldestFailureAt: new Date('2026-11-22T10:00:00Z'),
    });
  });

  it('chưa có dữ liệu thì count 0 và oldestFailureAt null', async () => {
    query.mockResolvedValue([]);

    const res = await service.recentFailures('moi@example.com');

    expect(res).toEqual({ count: 0, oldestFailureAt: null });
  });

  it('ngưỡng khóa là 5 lần sai', () => {
    expect(LOCKOUT_THRESHOLD).toBe(5);
  });
});
