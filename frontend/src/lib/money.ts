import type { Money } from '@/types/domain';

/**
 * Money never becomes a float. Everything here works in integer paise; the
 * decimal string is only reconstructed at the edges.
 *
 *   0.1 + 0.2 !== 0.3   ← the entire reason numeric(10,2) exists
 */

/** "250.00" → 25000 */
export function toPaise(m: Money | null | undefined): number {
  if (!m) return 0;
  const [whole, frac = ''] = String(m).trim().split('.');
  const sign = whole.startsWith('-') ? -1 : 1;
  const rupees = Math.abs(parseInt(whole, 10) || 0);
  const paise = parseInt((frac + '00').slice(0, 2), 10) || 0;
  return sign * (rupees * 100 + paise);
}

/** 25000 → "250.00" */
export function fromPaise(p: number): Money {
  const sign = p < 0 ? '-' : '';
  const abs = Math.abs(Math.round(p));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Integer addition only — a cart subtotal must never drift. */
export function sumPaise(lines: { unitPrice: Money; quantity: number }[]): number {
  return lines.reduce((total, l) => total + toPaise(l.unitPrice) * l.quantity, 0);
}

export function multiplyPaise(unitPrice: Money, quantity: number): number {
  return toPaise(unitPrice) * quantity;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string): Intl.NumberFormat {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatters.set(currency, f);
  }
  return f;
}

/** Display only. The value that reaches the DOM, never the value that is summed. */
export function formatMoney(m: Money | null | undefined, currency = 'INR'): string {
  return formatter(currency).format(toPaise(m) / 100);
}

export function formatPaise(paise: number, currency = 'INR'): string {
  return formatter(currency).format(paise / 100);
}

/** Charts cannot plot strings — this is the only place a Money becomes a number. */
export function moneyToChartNumber(m: Money | null | undefined): number {
  return toPaise(m) / 100;
}
