import { DataSource, EntityManager } from 'typeorm';
import { AuditAction } from '../audit/entities/audit-log.entity.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/exceptions/app.exception.js';
import { AccountsService } from './accounts.service.js';
import { Account, AccountStatus } from './entities/account.entity.js';

describe('AccountsService.updateStatus (F3)', () => {
  const manager = {
    findOneBy: vi.fn(),
    save: vi.fn(async (a: Account) => a),
  };
  const dataSource = {
    transaction: vi.fn(async (cb: (m: EntityManager) => unknown) =>
      cb(manager as unknown as EntityManager),
    ),
  } as unknown as DataSource;
  const auditService = { log: vi.fn(), logStandalone: vi.fn() };
  const accountsRepository = {} as never;

  const service = new AccountsService(
    accountsRepository,
    dataSource,
    auditService as unknown as AuditService,
  );

  const actor = { id: 'operator-1', role: 'operator' };

  const makeAccount = (overrides: Partial<Account> = {}): Account =>
    ({
      id: 'acc-1',
      accountNumber: '100000000001',
      status: AccountStatus.ACTIVE,
      isSystem: false,
      updatedAt: new Date('2026-11-09T00:00:00Z'),
      ...overrides,
    }) as Account;

  beforeEach(() => {
    vi.clearAllMocks();
    manager.findOneBy.mockResolvedValue(makeAccount());
  });

  it('khóa tài khoản: đổi trạng thái, ghi ACCOUNT_FROZEN kèm reason trong cùng transaction', async () => {
    const res = await service.updateStatus(
      'acc-1',
      AccountStatus.FROZEN,
      'Nghi ngờ gian lận',
      actor,
    );

    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: AccountStatus.FROZEN }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        actorId: 'operator-1',
        actorRole: 'operator',
        action: AuditAction.ACCOUNT_FROZEN,
        targetType: 'account',
        targetId: '100000000001',
        metadata: { reason: 'Nghi ngờ gian lận', previousStatus: 'active' },
      }),
    );
    expect(res).toMatchObject({
      id: 'acc-1',
      accountNumber: '100000000001',
      status: AccountStatus.FROZEN,
    });
  });

  it('mở tài khoản: ghi ACCOUNT_UNFROZEN', async () => {
    manager.findOneBy.mockResolvedValue(
      makeAccount({ status: AccountStatus.FROZEN }),
    );

    await service.updateStatus('acc-1', AccountStatus.ACTIVE, undefined, actor);

    expect(auditService.log).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ action: AuditAction.ACCOUNT_UNFROZEN }),
    );
  });

  it('gọi đúng trạng thái hiện có: không đổi, không ghi log (idempotent)', async () => {
    manager.findOneBy.mockResolvedValue(
      makeAccount({ status: AccountStatus.FROZEN }),
    );

    const res = await service.updateStatus(
      'acc-1',
      AccountStatus.FROZEN,
      'lại',
      actor,
    );

    expect(manager.save).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
    expect(res.status).toBe(AccountStatus.FROZEN);
  });

  it('tài khoản không tồn tại -> 404 ACCOUNT_NOT_FOUND', async () => {
    manager.findOneBy.mockResolvedValue(null);

    const err = await service
      .updateStatus('acc-1', AccountStatus.FROZEN, 'lý do', actor)
      .then(
        () => null,
        (e) => e,
      );

    expect(err).toBeInstanceOf(AppException);
    expect(err.code).toBe('ACCOUNT_NOT_FOUND');
    expect(err.getStatus()).toBe(404);
  });

  it('tài khoản quỹ -> 422 CANNOT_MODIFY_SYSTEM_ACCOUNT, không đổi gì', async () => {
    manager.findOneBy.mockResolvedValue(
      makeAccount({ isSystem: true, accountNumber: '000000000000' }),
    );

    const err = await service
      .updateStatus('acc-1', AccountStatus.FROZEN, 'lý do', actor)
      .then(
        () => null,
        (e) => e,
      );

    expect(err).toBeInstanceOf(AppException);
    expect(err.code).toBe('CANNOT_MODIFY_SYSTEM_ACCOUNT');
    expect(err.getStatus()).toBe(422);
    expect(manager.save).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });
});
