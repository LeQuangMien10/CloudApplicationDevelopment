import { HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { DataSource, EntityManager } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service.js';
import { AppException } from '../common/exceptions/app.exception.js';
import { User, UserRole, UserStatus } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/auth.dto.js';

vi.mock('bcrypt', () => ({ hash: vi.fn(), compare: vi.fn() }));

describe('AuthService', () => {
  const usersService = { findByEmailWithPassword: vi.fn() };
  const accountsService = { createForUser: vi.fn() };
  const jwtService = { signAsync: vi.fn(), decode: vi.fn() };
  const manager = { insert: vi.fn() };
  const dataSource = {
    transaction: vi.fn(async (cb: (m: EntityManager) => unknown) =>
      cb(manager),
    ),
  };

  const service = new AuthService(
    dataSource as unknown as DataSource,
    accountsService as unknown as AccountsService,
    usersService as unknown as UsersService,
    jwtService as unknown as JwtService,
  );

  const dto: RegisterDto = {
    fullName: 'Test User',
    email: 'test@example.com',
    password: 'Password@123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('register()', () => {
    it('tạo user + account trong cùng 1 transaction, không trả passwordHash', async () => {
      vi.mocked(hash).mockResolvedValue('hashed-pw' as never);
      manager.insert.mockResolvedValue({ identifiers: [{ id: 'user-1' }] });
      accountsService.createForUser.mockResolvedValue({
        accountNumber: '123456789012',
      });

      const res = await service.register(dto);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.insert).toHaveBeenCalledWith(User, {
        fullName: dto.fullName,
        email: dto.email,
        passwordHash: 'hashed-pw',
      });
      expect(accountsService.createForUser).toHaveBeenCalledWith(
        manager,
        'user-1',
      );
      expect(res).toEqual({
        id: 'user-1',
        fullName: 'Test User',
        email: 'test@example.com',
        accountNumber: '123456789012',
      });
      expect(res).not.toHaveProperty('passwordHash');
    });

    it('email trùng -> 409 EMAIL_ALREADY_EXISTS', async () => {
      vi.mocked(hash).mockResolvedValue('hashed-pw' as never);
      manager.insert.mockRejectedValue({
        code: '23505',
        constraint: 'users_email_key',
      });

      const err = await service.register(dto).then(
        () => null,
        (e) => e,
      );

      expect(err).toBeInstanceOf(AppException);
      expect(err.code).toBe('EMAIL_ALREADY_EXISTS');
      expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
    });

    it('lỗi khác được ném lại nguyên trạng', async () => {
      manager.insert.mockRejectedValue(new Error('db down'));

      await expect(service.register(dto)).rejects.toThrow('db down');
    });
  });

  describe('login()', () => {
    const makeUser = (overrides: Partial<User> = {}): User =>
      ({
        id: 'u1',
        email: 'an@example.com',
        passwordHash: '$2b$12$hash',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        ...overrides,
      }) as User;

    it('đăng nhập đúng -> trả accessToken và expiresIn 900', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(makeUser());
      vi.mocked(compare).mockResolvedValue(true as never);
      jwtService.signAsync.mockResolvedValue('token-abc' as never);
      jwtService.decode.mockReturnValue({ exp: 1000, iat: 100 });

      const res = await service.login({
        email: 'an@example.com',
        password: 'Password@123',
      });

      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: 'u1',
        role: 'customer',
      });
      expect(res).toEqual({ accessToken: 'token-abc', expiresIn: 900 });
    });

    it('sai mật khẩu -> 401 INVALID_CREDENTIALS', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(makeUser());
      vi.mocked(compare).mockResolvedValue(false as never);

      const err = await service
        .login({ email: 'an@example.com', password: 'Sai@123' })
        .then(
          () => null,
          (e) => e,
        );

      expect(err).toBeInstanceOf(AppException);
      expect(err.code).toBe('INVALID_CREDENTIALS');
      expect(err.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('email không tồn tại -> INVALID_CREDENTIALS, vẫn so hash giả (chống timing attack)', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(null);
      vi.mocked(compare).mockResolvedValue(false as never);

      const err = await service
        .login({ email: 'nobody@example.com', password: 'Password@123' })
        .then(
          () => null,
          (e) => e,
        );

      expect(err.code).toBe('INVALID_CREDENTIALS');
      expect(vi.mocked(compare)).toHaveBeenCalledTimes(1);
    });

    it('user bị khóa -> 401 USER_LOCKED', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(
        makeUser({ status: UserStatus.LOCKED }),
      );
      vi.mocked(compare).mockResolvedValue(true as never);

      const err = await service
        .login({ email: 'an@example.com', password: 'Password@123' })
        .then(
          () => null,
          (e) => e,
        );

      expect(err).toBeInstanceOf(AppException);
      expect(err.code).toBe('USER_LOCKED');
      expect(err.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });
  });
});
