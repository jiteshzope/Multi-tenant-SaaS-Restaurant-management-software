import { useCurrency } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';
import { formatMoney, formatPaise } from '@/lib/money';
import type { Money as MoneyString } from '@/types/domain';

/** The only way money reaches the DOM. */
export function Money({
  value,
  className,
  currency,
}: {
  value: MoneyString | null | undefined;
  className?: string;
  currency?: string;
}) {
  const fallback = useCurrency();
  return (
    <span className={cn('tabular', className)}>{formatMoney(value, currency ?? fallback)}</span>
  );
}

/** For cart subtotals, which are computed in integer paise and never as a string. */
export function PaiseMoney({ paise, className }: { paise: number; className?: string }) {
  const currency = useCurrency();
  return <span className={cn('tabular', className)}>{formatPaise(paise, currency)}</span>;
}
