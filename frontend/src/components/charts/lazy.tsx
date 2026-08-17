import { lazy, Suspense, type ComponentType } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import type { DailyRow, HourlyRow, TopItemRow } from '@/types/domain';

/**
 * Recharts is the heaviest dependency in the app and only the OWNER screens
 * plot anything. Loading it lazily means a waiter on a tablet and a kitchen
 * handler on a wall screen never download it at all.
 */
const load = () => import('./charts');

function withSuspense<P extends object>(
  pick: (m: Awaited<ReturnType<typeof load>>) => ComponentType<P>,
) {
  const Lazy = lazy(async () => ({ default: pick(await load()) }));
  return function LazyChart(props: P) {
    return (
      <Suspense fallback={<Skeleton className="h-56 w-full rounded-lg" />}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}

export const RevenueAreaChart = withSuspense<{ data: DailyRow[] }>((m) => m.RevenueAreaChart);
export const TopItemsBarChart = withSuspense<{ data: TopItemRow[] }>((m) => m.TopItemsBarChart);
export const HourlyBarChart = withSuspense<{ data: HourlyRow[] }>((m) => m.HourlyBarChart);
