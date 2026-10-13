import { randomInt } from 'node:crypto';

/** Số tài khoản của quỹ ngân hàng, tạo bởi seed. */
export const SYSTEM_ACCOUNT_NUMBER = '000000000000';

/**
 * Sinh số tài khoản 12 chữ số, chữ số đầu khác 0.
 * Có thể trùng (xác suất rất nhỏ): DB có UNIQUE, nơi gọi bắt lỗi trùng rồi sinh lại.
 */
export function generateAccountNumber(): string {
  let s = String(randomInt(1, 10));
  for (let i = 0; i < 11; i++) s += String(randomInt(0, 10));
  return s;
}
