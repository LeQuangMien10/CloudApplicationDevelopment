import { DataSource, EntityManager } from 'typeorm';
import { AuditAction } from '../audit/entities/audit-log.entity.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/exceptions/app.exception.js';
import { AccountsService } from './accounts.service.js';
import { Account, AccountStatus } from './entities/account.entity.js';
import { UserRole } from '../users/entities/user.entity.js';

describe('AccountsService.updateStatus (F3)', () => {
  const manager = {
    findOne: vi.fn(),
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
    manager.findOne.mockResolvedValue(makeAccount());
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
    manager.findOne.mockResolvedValue(
      makeAccount({ status: AccountStatus.FROZEN }),
    );

    await service.updateStatus('acc-1', AccountStatus.ACTIVE, undefined, actor);

    expect(auditService.log).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ action: AuditAction.ACCOUNT_UNFROZEN }),
    );
  });

  it('gọi đúng trạng thái hiện có: không đổi, không ghi log (idempotent)', async () => {
    manager.findOne.mockResolvedValue(
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
    manager.findOne.mockResolvedValue(null);

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
    manager.findOne.mockResolvedValue(
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

  it('tài khoản đã đóng -> 422 ACCOUNT_CLOSED dù muốn khóa hay mở, không đổi gì', async () => {
    for (const target of [AccountStatus.FROZEN, AccountStatus.ACTIVE]) {
      manager.findOne.mockResolvedValue(
        makeAccount({ status: AccountStatus.CLOSED }),
      );

      const err = await service
        .updateStatus('acc-1', target, 'lý do', actor)
        .then(
          () => null,
          (e) => e,
        );

      expect(err).toBeInstanceOf(AppException);
      expect(err.code).toBe('ACCOUNT_CLOSED');
      expect(err.getStatus()).toBe(422);
    }
    expect(manager.save).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('đọc tài khoản với khóa pessimistic_write để hai operator đổi cùng lúc không ghi log trùng', async () => {
    manager.findOne.mockResolvedValue(makeAccount());

    await service.updateStatus('acc-1', AccountStatus.FROZEN, 'lý do', actor);

    expect(manager.findOne).toHaveBeenCalledWith(Account, {
      where: { id: 'acc-1' },
      lock: { mode: 'pessimistic_write' },
    });
  });
});

describe('AccountsService.findByAccountNumberForStaff (Issue #11)', () => {
  const accountsRepository = { findOne: vi.fn() };
  const dataSource = {} as DataSource;
  const auditService = { log: vi.fn(), logStandalone: vi.fn() };
  const service = new AccountsService(
    accountsRepository as never,
    dataSource,
    auditService as unknown as AuditService,
  );

  const makeAccount = (): Account =>
    ({
      id: 'acc-9',
      accountNumber: '100000000009',
      balance: '500000.00',
      currency: 'VND',
      status: AccountStatus.ACTIVE,
      isSystem: false,
      user: { id: 'user-9', fullName: 'Nguyễn Văn Tra Cứu' },
    }) as unknown as Account;

  beforeEach(() => {
    vi.clearAllMocks();
    accountsRepository.findOne.mockResolvedValue(makeAccount());
  });

  it('operator nhận đủ id, fullName, status, balance; tìm theo accountNumber', async () => {
    const res = await service.findByAccountNumberForStaff('100000000009', UserRole.OPERATOR);

    expect(accountsRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountNumber: '100000000009' } }),
    );
    expect(res).toMatchObject({
      id: 'acc-9',
      accountNumber: '100000000009',
      fullName: 'Nguyễn Văn Tra Cứu',
      status: AccountStatus.ACTIVE,
      isSystem: false,
      balance: '500000.00',
      currency: 'VND',
    });
  });

  it('auditor không nhận balance', async () => {
    const res = await service.findByAccountNumberForStaff('100000000009', UserRole.AUDITOR);

    expect(res).toHaveProperty('id', 'acc-9');
    expect(res).not.toHaveProperty('balance');
    expect(res).not.toHaveProperty('currency');
  });

  it('tài khoản không tồn tại -> 404 ACCOUNT_NOT_FOUND', async () => {
    accountsRepository.findOne.mockResolvedValue(null);

    const err = await service
      .findByAccountNumberForStaff('999999999999', UserRole.OPERATOR)
      .then(
        () => null,
        (e) => e,
      );

    expect(err).toBeInstanceOf(AppException);
    expect(err.code).toBe('ACCOUNT_NOT_FOUND');
    expect(err.getStatus()).toBe(404);
  });

  it('tài khoản quỹ vẫn trả về với isSystem=true (khác endpoint khách hàng)', async () => {
    accountsRepository.findOne.mockResolvedValue({
      id: 'acc-9',
      accountNumber: '000000000000',
      balance: '500000.00',
      currency: 'VND',
      status: AccountStatus.ACTIVE,
      isSystem: true,
      user: { id: 'user-9', fullName: 'Quỹ ngân hàng' },
    } as unknown as Account);

    const res = await service.findByAccountNumberForStaff('000000000000', UserRole.OPERATOR);

    expect(res.isSystem).toBe(true);
  });
});
