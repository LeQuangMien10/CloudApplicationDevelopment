import { DataSource, EntityManager, Repository } from 'typeorm';
import { getRequestContext, runWithRequestContext } from '../common/request-context.js';
import { AuditAction } from './entities/audit-log.entity.js';
import { AuditService } from './audit.service.js';

describe('AuditService', () => {
  const manager = { insert: vi.fn() };
  const auditLogs = {} as unknown as Repository<unknown>;
  const dataSource = {
    transaction: vi.fn(async (cb: (m: EntityManager) => unknown) =>
      cb(manager as unknown as EntityManager),
    ),
  } as unknown as DataSource;
  const service = new AuditService(dataSource, auditLogs);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('log() chèn đủ trường, lấy requestId/ip từ request context', async () => {
    manager.insert.mockResolvedValue({});

    await runWithRequestContext(
      { requestId: 'req-123', ip: '10.0.0.9' },
      () =>
        service.log(manager as unknown as EntityManager, {
          actorId: 'actor-1',
          actorRole: 'admin',
          action: AuditAction.USER_LOCKED,
          targetType: 'user',
          targetId: 'target-1',
          metadata: { newStatus: 'locked' },
        }),
    );

    expect(manager.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: 'actor-1',
        actorRole: 'admin',
        action: AuditAction.USER_LOCKED,
        targetId: 'target-1',
        requestId: 'req-123',
        ip: '10.0.0.9',
        metadata: { newStatus: 'locked' },
      }),
    );
  });

  it('log() ngoài request context vẫn ghi được, requestId đánh dấu rõ ràng', async () => {
    manager.insert.mockResolvedValue({});
    expect(getRequestContext()).toBeUndefined();

    await service.log(manager as unknown as EntityManager, {
      action: AuditAction.AUTH_REGISTER,
    });

    expect(manager.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: null,
        requestId: 'no-request-context',
        ip: null,
        metadata: {},
      }),
    );
  });

  it('logStandalone() tự mở transaction', async () => {
    manager.insert.mockResolvedValue({});

    await service.logStandalone({ action: AuditAction.AUTH_LOGIN_FAILED });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.insert).toHaveBeenCalled();
  });

  it('logStandalone() lỗi DB không ném ra ngoài — nghiệp vụ vẫn chạy tiếp', async () => {
    vi.mocked(dataSource.transaction).mockRejectedValue(
      new Error('connection refused'),
    );

    await expect(
      service.logStandalone({ action: AuditAction.AUTH_LOGIN_SUCCESS }),
    ).resolves.toBeUndefined();
  });
});
