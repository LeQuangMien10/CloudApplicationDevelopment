import { parsePositiveInt, parseTrustProxyHops } from './env-limits.js';

describe('parsePositiveInt', () => {
  it.each([
    ['5', 5],
    ['30', 30],
  ])('%s -> %i', (raw, expected) => {
    expect(parsePositiveInt(raw, 99)).toBe(expected);
  });

  it.each([undefined, '', 'abc', '0', '-3'])('%s -> mặc định', (raw) => {
    expect(parsePositiveInt(raw, 99)).toBe(99);
  });
});

describe('parseTrustProxyHops', () => {
  it('không đặt thì tin 2 lớp proxy (Caddy, nginx)', () => {
    expect(parseTrustProxyHops(undefined)).toBe(2);
    expect(parseTrustProxyHops('')).toBe(2);
  });

  it.each([
    ['0', 0],
    ['1', 1],
    ['2', 2],
  ])('%s -> %i', (raw, expected) => {
    expect(parseTrustProxyHops(raw)).toBe(expected);
  });

  it.each(['abc', '-1', '1.5'])('%s không hợp lệ -> 2', (raw) => {
    expect(parseTrustProxyHops(raw)).toBe(2);
  });
});
