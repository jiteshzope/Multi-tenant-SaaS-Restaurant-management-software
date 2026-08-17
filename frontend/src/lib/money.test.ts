import { describe, expect, it } from 'vitest';
import { formatMoney, fromPaise, multiplyPaise, sumPaise, toPaise } from './money';

describe('money', () => {
  it('round-trips through integer paise', () => {
    for (const value of ['0.00', '0.05', '40.00', '250.00', '1234.56', '99999.99']) {
      expect(fromPaise(toPaise(value))).toBe(value);
    }
  });

  it('does not drift where a float would — 3 × ₹0.10', () => {
    const paise = sumPaise([{ unitPrice: '0.10', quantity: 3 }]);
    expect(paise).toBe(30);
    expect(fromPaise(paise)).toBe('0.30');
    // The float version of the same sum is famously not 0.3.
    expect(0.1 + 0.1 + 0.1).not.toBe(0.3);
  });

  it('sums a cart in integers only', () => {
    const lines = [
      { unitPrice: '250.00', quantity: 2 },
      { unitPrice: '60.00', quantity: 2 },
      { unitPrice: '50.00', quantity: 4 },
    ];
    expect(sumPaise(lines)).toBe(82_000);
    expect(fromPaise(sumPaise(lines))).toBe('820.00');
  });

  it('multiplies a line without leaving integer space', () => {
    expect(multiplyPaise('12.35', 3)).toBe(3705);
    expect(fromPaise(multiplyPaise('12.35', 3))).toBe('37.05');
  });

  it('treats a missing amount as zero rather than NaN', () => {
    expect(toPaise(null)).toBe(0);
    expect(toPaise(undefined)).toBe(0);
    expect(toPaise('')).toBe(0);
  });

  it('handles a single-digit fraction from the wire', () => {
    expect(toPaise('250.5')).toBe(25_050);
    expect(fromPaise(25_050)).toBe('250.50');
  });

  it('formats for display without changing the stored value', () => {
    const formatted = formatMoney('250.00', 'INR');
    expect(formatted).toContain('250');
    expect(toPaise('250.00')).toBe(25_000);
  });
});
