/** Mã lỗi PostgreSQL thường gặp. Danh sách đầy đủ: https://www.postgresql.org/docs/current/errcodes-appendix.html */
export const PG_UNIQUE_VIOLATION = '23505';

/**
 * Lỗi có phải vi phạm UNIQUE của đúng ràng buộc `constraint` không.
 * Đọc được cả lỗi gốc của driver pg và QueryFailedError của TypeORM (bọc trong driverError).
 *
 * Lưu ý: trong một DB transaction, sau lỗi này transaction bị hủy, mọi câu lệnh tiếp theo
 * đều lỗi. Muốn thử lại trong transaction thì dùng INSERT ... ON CONFLICT DO NOTHING
 * (TypeORM: .orIgnore()) thay vì bắt lỗi.
 */
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  const e = err as {
    code?: string;
    constraint?: string;
    driverError?: { code?: string; constraint?: string };
  };
  const code = e?.code ?? e?.driverError?.code;
  const name = e?.constraint ?? e?.driverError?.constraint;
  return code === PG_UNIQUE_VIOLATION && name === constraint;
}
