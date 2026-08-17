import type { ColumnDef } from '@tanstack/react-table';
import { Gauge, Timer, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type ColumnMeta } from '@/components/common/DataTable';
import { Money } from '@/components/common/Money';
import { ErrorState } from '@/components/common/States';
import { ChartCard, StatTile } from '@/components/charts/primitives';
import { HourlyBarChart, RevenueAreaChart, TopItemsBarChart } from '@/components/charts/lazy';
import { PageHeader } from '@/components/layout/AppShell';
import {
  useDaily,
  useHourly,
  usePrepTime,
  useTopItems,
  useWaiterPerformance,
} from '@/hooks/queries';
import { cn } from '@/lib/cn';
import type { DateRange, WaiterRow } from '@/types/domain';

const PRESETS = [
  { key: '7', label: '7 days', days: 7 },
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
] as const;

export function OwnerReportsPage() {
  const [preset, setPreset] = useState<(typeof PRESETS)[number]['key']>('30');

  // The range is part of every query key, so switching it refetches cleanly.
  const range: DateRange = useMemo(() => {
    const days = PRESETS.find((p) => p.key === preset)?.days ?? 30;
    return { from: new Date(Date.now() - days * 864e5).toISOString() };
  }, [preset]);

  const daily = useDaily(range);
  const topItems = useTopItems(range);
  const hourly = useHourly(range);
  const prepTime = usePrepTime(range);
  const waiters = useWaiterPerformance(range);

  const waiterColumns = useMemo<ColumnDef<WaiterRow, never>[]>(
    () => [
      {
        accessorKey: 'waiter',
        header: 'Waiter',
        meta: { className: 'w-full min-w-[8rem] font-medium' } satisfies ColumnMeta,
      },
      {
        accessorKey: 'ordersTaken',
        header: 'Orders',
        meta: { className: 'whitespace-nowrap' } satisfies ColumnMeta,
        cell: ({ row }) => <span className="tabular">{row.original.ordersTaken}</span>,
      },
      {
        accessorKey: 'tablesServed',
        header: 'Tables',
        // Dropped on a phone so Revenue — the column this table is read for —
        // fits on screen without a sideways scroll.
        meta: { className: 'hidden whitespace-nowrap sm:table-cell' } satisfies ColumnMeta,
        cell: ({ row }) => <span className="tabular">{row.original.tablesServed}</span>,
      },
      {
        accessorKey: 'revenue',
        header: 'Revenue',
        // Money is the answer this table exists to give — it never wraps and
        // never gets clipped off the right edge of a phone.
        meta: {
          className: 'whitespace-nowrap text-right',
          headClassName: 'text-right',
        } satisfies ColumnMeta,
        cell: ({ row }) => (
          <Money value={row.original.revenue} className="font-semibold text-primary" />
        ),
        sortingFn: (a, b) => parseFloat(a.original.revenue) - parseFloat(b.original.revenue),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Reports"
        description="Sales, menu performance and kitchen speed."
        actions={
          <div
            role="group"
            aria-label="Date range"
            className="flex w-full rounded-lg border border-border/60 bg-card/40 p-1 sm:w-auto"
          >
            {PRESETS.map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant="ghost"
                aria-pressed={preset === p.key}
                onClick={() => setPreset(p.key)}
                className={cn(
                  'h-9 flex-1 sm:h-8 sm:flex-none',
                  preset === p.key &&
                    'bg-primary/20 text-primary ring-1 ring-primary/30 hover:bg-primary/20',
                )}
              >
                {p.label}
              </Button>
            ))}
          </div>
        }
      />

      {daily.isError ? (
        <ErrorState error={daily.error} onRetry={() => void daily.refetch()} />
      ) : (
        <div className="space-y-4">
          <ChartCard
            title="Revenue per day"
            subtitle={`Last ${PRESETS.find((p) => p.key === preset)?.label}`}
            accent="var(--chart-1)"
            loading={daily.isLoading}
            isEmpty={(daily.data ?? []).length === 0}
          >
            <RevenueAreaChart data={daily.data ?? []} />
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Top selling items"
              subtitle="By units sold"
              accent="var(--chart-3)"
              loading={topItems.isLoading}
              isEmpty={(topItems.data ?? []).length === 0}
            >
              <TopItemsBarChart data={topItems.data ?? []} />
            </ChartCard>

            <ChartCard
              title="Orders by hour"
              subtitle="Bucketed in the restaurant's timezone"
              accent="var(--chart-2)"
              loading={hourly.isLoading}
              isEmpty={(hourly.data ?? []).every((h) => h.orders === 0)}
            >
              <HourlyBarChart data={hourly.data ?? []} />
            </ChartCard>
          </div>

          {/* Three headline numbers, not a chart — a plot of two values would be
              a one-bar bar chart in disguise. The hues are the kitchen's own
              status colours, so "slowest" reads as the warning it is rather
              than as an arbitrary fourth series colour. */}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              label="Average prep time"
              value={prepTime.data?.avgMinutes ? `${prepTime.data.avgMinutes} min` : '—'}
              hint="Order placed → marked complete"
              icon={<Timer className="size-4" />}
              accent="var(--status-preparing)"
            />
            <StatTile
              label="Slowest order"
              value={prepTime.data?.worstMinutes ? `${prepTime.data.worstMinutes} min` : '—'}
              hint="Worst case in this range"
              icon={<TrendingUp className="size-4" />}
              accent="var(--status-pending)"
            />
            <StatTile
              label="Orders measured"
              value={prepTime.data?.ordersMeasured ?? 0}
              hint="Completed orders only"
              icon={<Gauge className="size-4" />}
              accent="var(--status-completed)"
            />
          </div>

          <Card className="p-4 sm:p-5">
            <h3 className="mb-4 text-sm font-semibold">Waiter performance</h3>
            <DataTable
              columns={waiterColumns}
              data={waiters.data ?? []}
              minWidth={300}
              empty={
                <span className="text-sm text-muted-foreground">No orders taken in this range</span>
              }
            />
          </Card>
        </div>
      )}
    </>
  );
}
