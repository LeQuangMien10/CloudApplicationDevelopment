import { computeBackoffMs } from './backoff.js';

describe('computeBackoffMs', () => {
  const BASE = 5000;
  const MAX = 600_000;

  it.each([
    [1, 5000],
    [2, 10_000],
    [3, 20_000],
    [4, 40_000],
    [5, 80_000],
  ])('lần lỗi thứ %i chờ %i ms', (attempts, expected) => {
    expect(computeBackoffMs(attempts, BASE, MAX)).toBe(expected);
  });

  it('không vượt quá max', () => {
    // 5000 · 2^7 = 640.000 > 600.000
    expect(computeBackoffMs(8, BASE, MAX)).toBe(MAX);
  });

  it('số lần lỗi rất lớn vẫn trả về max, không ra Infinity hay NaN', () => {
    expect(computeBackoffMs(10_000, BASE, MAX)).toBe(MAX);
  });

  it.each([0, -1, 1.5, Number.NaN])('từ chối attempts = %s', (attempts) => {
    expect(() => computeBackoffMs(attempts, BASE, MAX)).toThrow(RangeError);
  });
});
