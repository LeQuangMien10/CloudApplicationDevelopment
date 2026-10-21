import { isUniqueViolation } from './db-errors.js';

describe('isUniqueViolation', () => {
  it('nhận lỗi gốc của driver pg', () => {
    expect(
      isUniqueViolation(
        { code: '23505', constraint: 'users_email_key' },
        'users_email_key',
      ),
    ).toBe(true);
  });

  it('nhận QueryFailedError của TypeORM (driverError)', () => {
    expect(
      isUniqueViolation(
        { driverError: { code: '23505', constraint: 'users_email_key' } },
        'users_email_key',
      ),
    ).toBe(true);
  });

  it('khác ràng buộc thì false', () => {
    expect(
      isUniqueViolation(
        { code: '23505', constraint: 'accounts_account_number_key' },
        'users_email_key',
      ),
    ).toBe(false);
  });

  it('khác mã lỗi hoặc không phải object thì false', () => {
    expect(
      isUniqueViolation(
        { code: '23503', constraint: 'users_email_key' },
        'users_email_key',
      ),
    ).toBe(false);
    expect(isUniqueViolation(undefined, 'users_email_key')).toBe(false);
    expect(isUniqueViolation(new Error('x'), 'users_email_key')).toBe(false);
  });
});
