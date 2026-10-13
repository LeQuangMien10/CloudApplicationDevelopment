import { AMOUNT_REGEX } from './money.js';

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
