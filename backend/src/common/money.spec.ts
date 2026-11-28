import { AMOUNT_REGEX, normalizeAmount } from './money.js';

describe('AMOUNT_REGEX', () => {
  it.each(['1', '100000', '1500000.5', '1500000.50', '9999999999999999.99'])(
    'chấp nhận %s',
    (v) => {
      expect(AMOUNT_REGEX.test(v)).toBe(true);
    },
  );

  it.each([
    '0',
    '0.00',
    '-1',
    '1.234',
    '1e5',
    'abc',
    '',
    ' 1',
    '10000000000000000',
  ])('từ chối %s', (v) => {
    expect(AMOUNT_REGEX.test(v)).toBe(false);
  });
});

describe('normalizeAmount', () => {
  it.each([
    ['1000', '1000.00'],
    ['1000.5', '1000.50'],
    ['1000.50', '1000.50'],
    ['0001000.5', '1000.50'],
    ['0.01', '0.01'],
    ['00.5', '0.50'],
    ['9999999999999999.99', '9999999999999999.99'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeAmount(input)).toBe(expected);
  });
});
