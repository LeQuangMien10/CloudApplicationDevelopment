/**
 * Quy ước tiền tệ:
 * - DB dùng numeric(18,2). TypeORM trả về dạng string, KHÔNG đổi sang number để cộng trừ.
 * - Cộng trừ số dư làm bằng SQL (balance = balance - :amount) trong DB transaction.
 * - API nhận và trả số tiền dạng string, ví dụ "1500000.00".
 */

/** Số dương, tối đa 16 chữ số phần nguyên và 2 chữ số thập phân. Không nhận 0. */
export const AMOUNT_REGEX = /^(?!0+(?:\.0{1,2})?$)\d{1,16}(?:\.\d{1,2})?$/;

export const DEFAULT_CURRENCY = 'VND';

/**
 * Đưa số tiền đã qua AMOUNT_REGEX về đúng dạng DB trả về cho numeric(18,2),
 * ví dụ "0001000.5" → "1000.50", "1000" → "1000.00". Tính bằng BigInt, không qua number.
 */
export function normalizeAmount(amount: string): string {
  const [whole, fraction = ''] = amount.split('.');
  const minorUnits = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return `${minorUnits / 100n}.${(minorUnits % 100n).toString().padStart(2, '0')}`;
}
