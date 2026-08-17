import { Prisma } from '@prisma/client';
import { serialize } from './transform.interceptor';

describe('serialize', () => {
  it('turns Prisma.Decimal into a fixed-2 string, never a number', () => {
    const out = serialize({ price: new Prisma.Decimal('250.5') }) as { price: unknown };
    expect(out.price).toBe('250.50');
    expect(typeof out.price).toBe('string');
  });

  it('keeps paise that a float would lose', () => {
    const out = serialize({ total: new Prisma.Decimal('0.1').plus('0.2') }) as { total: string };
    expect(out.total).toBe('0.30');
  });

  it('turns COUNT(*) bigints into numbers', () => {
    expect(serialize({ orders: 12n })).toEqual({ orders: 12 });
  });

  it('walks arrays and nested objects', () => {
    const input = {
      lines: [{ amount: new Prisma.Decimal('10'), qty: 3n }],
      meta: { nested: { amount: new Prisma.Decimal('2.05') } },
    };
    expect(serialize(input)).toEqual({
      lines: [{ amount: '10.00', qty: 3 }],
      meta: { nested: { amount: '2.05' } },
    });
  });

  it('serializes dates to ISO and preserves null', () => {
    const out = serialize({ at: new Date('2026-08-16T14:03:11.123Z'), gone: null }) as {
      at: string;
      gone: null;
    };
    expect(out.at).toBe('2026-08-16T14:03:11.123Z');
    expect(out.gone).toBeNull();
  });
});
