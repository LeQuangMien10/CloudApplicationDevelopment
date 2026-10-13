import { generateAccountNumber } from './account-number.util.js';

describe('generateAccountNumber', () => {
  it('sinh đúng 12 chữ số, chữ số đầu khác 0', () => {
    for (let i = 0; i < 1000; i++) {
      expect(generateAccountNumber()).toMatch(/^[1-9][0-9]{11}$/);
    }
  });
});
