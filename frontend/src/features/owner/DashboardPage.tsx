import {
  Armchair,
  ChefHat,
  CircleCheck,
  Clock,
  IndianRupee,
  Receipt,
  ShoppingBag,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Money } from '@/components/common/Money';
import { ErrorState, LoadingGrid } from '@/components/common/States';
import { ChartCard, StatTile } from '@/components/charts/primitives';
import { HourlyBarChart, RevenueAreaChart } from '@/components/charts/lazy';
import { PageHeader } from '@/components/layout/AppShell';
import { useDaily, useHourly, useKitchenCounts, useSummary, useTables } from '@/hooks/queries';
import { useSocket } from '@/hooks/useSocket';
import { formatMoney } from '@/lib/money';
import { useCurrency } from '@/hooks/useAuth';

const LAST_14_DAYS = { from: new Date(Date.now() - 14 * 864e5).toISOString() };

export function OwnerDashboardPage() {
  const connection = useSocket();
  const summary = useSummary();
  const daily = useDaily(LAST_14_DAYS);
  const hourly = useHourly(LAST_14_DAYS);
  const tables = useTables();
  const counts = useKitchenCounts(connection === 'connected');
  const currency = useCurrency();

  const occupied = (tables.data ?? []).filter((t) => t.status === 'OCCUPIED');

  return (
    <>
      <PageHeader
        title="Today"
        description="Revenue, covers and kitchen load — in your restaurant's timezone."
        actions={
          <Button asChild variant="outline">
            <Link to="/owner/reports">Full reports</Link>
          </Button>
        }
      />

      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : summary.isLoading ? (
        <LoadingGrid count={4} className="mb-6" />
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Revenue today"
            value={formatMoney(summary.data?.revenue ?? '0.00', currency)}
            hint={`${summary.data?.sessionsServed ?? 0} tables served`}
            icon={<IndianRupee className="size-4" />}
            accent="var(--chart-1)"
          />
          <StatTile
            label="Orders placed"
            value={summary.data?.ordersPlaced ?? 0}
            hint={`${counts.data?.PENDING ?? 0} waiting in the kitchen`}
            icon={<ShoppingBag className="size-4" />}
            accent="var(--status-preparing)"
          />
          <StatTile
            label="Average bill"
            value={summary.data?.avgBill ? formatMoney(summary.data.avgBill, currency) : '—'}
            hint="Per closed and open session"
            icon={<Receipt className="size-4" />}
            accent="var(--status-completed)"
          />
          {/* Occupancy wears the same violet the table grid uses for OCCUPIED. */}
          <StatTile
            label="Tables occupied"
            value={`${summary.data?.openTables ?? 0} / ${summary.data?.activeTables ?? 0}`}
            hint="Right now"
            icon={<Armchair className="size-4" />}
            accent="var(--status-occupied)"
          />
        </div>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Revenue"
          subtitle="Last 14 days"
          accent="var(--chart-1)"
          loading={daily.isLoading}
          isEmpty={(daily.data ?? []).length === 0}
        >
          <RevenueAreaChart data={daily.data ?? []} />
        </ChartCard>

        <ChartCard
          title="Orders by hour"
          subtitle="Last 14 days · when the kitchen is busiest"
          accent="var(--chart-2)"
          loading={hourly.isLoading}
          isEmpty={(hourly.data ?? []).every((h) => h.orders === 0)}
        >
          <HourlyBarChart data={hourly.data ?? []} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Open tables</h3>
            <Button asChild size="sm" variant="ghost">
              <Link to="/owner/tables">View all</Link>
            </Button>
          </div>

          {occupied.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Every table is vacant right now.
            </p>
          ) : (
            <ul className="divide-y divide-border/50">
              {occupied.slice(0, 6).map((table) => (
                <li key={table.id}>
                  <Link
                    to={`/owner/tables/${table.id}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/40"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden
                        className="h-8 w-1 shrink-0 rounded-full bg-status-occupied"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Table {table.tableNumber}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {table.waiterName ?? 'Unassigned'} · {table.orderCount}{' '}
                          {table.orderCount === 1 ? 'order' : 'orders'}
                        </p>
                      </div>
                    </div>
                    <Money value={table.runningTotal} className="shrink-0 text-sm font-semibold" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="min-w-0 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Kitchen load</h3>
            <Button asChild size="sm" variant="ghost">
              <Link to="/owner/kitchen">Open board</Link>
            </Button>
          </div>

          {/*
            Each tile is the status colour it counts, so this card and the
            kitchen board agree at a glance. The three StatusBadges that used to
            sit underneath were a legend for labels that are already written on
            the tiles — they said nothing the tiles did not.
          */}
          <div className="grid gap-3 sm:grid-cols-3">
            <LoadTile
              label="Pending"
              value={counts.data?.PENDING ?? 0}
              icon={<Clock className="size-4" />}
              tone="var(--status-pending)"
            />
            <LoadTile
              label="Preparing"
              value={counts.data?.PREPARING ?? 0}
              icon={<ChefHat className="size-4" />}
              tone="var(--status-preparing)"
            />
            <LoadTile
              label="Completed"
              value={counts.data?.COMPLETED ?? 0}
              icon={<CircleCheck className="size-4" />}
              tone="var(--status-completed)"
            />
          </div>
        </Card>
      </div>
    </>
  );
}

function LoadTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div
      style={{ '--tone': tone } as CSSProperties}
      className="toned flex items-center justify-between gap-2 rounded-lg border p-3 sm:block"
    >
      <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: tone }}>
        {icon}
        {label}
      </span>
      <p className="tabular text-2xl font-semibold sm:mt-1" style={{ color: tone }}>
        {value}
      </p>
    </div>
  );
}
