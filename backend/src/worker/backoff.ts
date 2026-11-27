/**
 * Thời gian chờ trước lần thử lại tiếp theo của một sự kiện outbox: base · 2^(attempts − 1),
 * không quá max. Ví dụ base 5 giây: 5s, 10s, 20s, 40s, ...
 *
 * @param attempts số lần handler đã lỗi, tính cả lần vừa lỗi (từ 1)
 */
export function computeBackoffMs(
  attempts: number,
  baseMs: number,
  maxMs: number,
): number {
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new RangeError(`attempts phải là số nguyên >= 1, nhận ${attempts}`);
  }
  // Số mũ lớn cho ra Infinity, Math.min vẫn trả về maxMs
  return Math.min(baseMs * 2 ** (attempts - 1), maxMs);
}
