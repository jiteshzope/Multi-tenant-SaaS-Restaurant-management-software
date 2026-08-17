import { LayoutGrid } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingGrid } from '@/components/common/States';
import { Money } from '@/components/common/Money';
import { PageHeader } from '@/components/layout/AppShell';
import { useMyTables } from '@/hooks/queries';
import { cn } from '@/lib/cn';
import { TableCard } from '../tables/TableCard';

type Filter = 'ALL' | 'VACANT' | 'OCCUPIED';

export function MyTablesPage() {
  const tables = useMyTables();
  const [filter, setFilter] = useState<Filter>('ALL');

  const rows = tables.data ?? [];
  const filtered = useMemo(
    () => rows.filter((t) => filter === 'ALL' || t.status === filter),
    [rows, filter],
  );

  const occupied = rows.filter((t) => t.status === 'OCCUPIED');
  const runningTotalPaise = occupied.reduce(
    (sum, t) => sum + Math.round(parseFloat(t.runningTotal || '0') * 100),
    0,
  );

  return (
    <>
      <PageHeader
        title="My tables"
        description={
          rows.length
            ? `${occupied.length} of ${rows.length} occupied`
            : 'Tables the owner has assigned to you'
        }
        actions={
          occupied.length > 0 && (
            <div
              style={{ '--tone': 'var(--status-occupied)' } as CSSProperties}
              className="toned w-full rounded-xl border px-4 py-2 sm:w-auto sm:text-right"
            >
              <p className="text-[11px] tracking-wider text-muted-foreground uppercase">
                Open tables total
              </p>
              <Money
                value={(runningTotalPaise / 100).toFixed(2)}
                className="text-lg font-semibold text-primary"
              />
            </div>
          )
        }
      />

      {/* Tablet-first: a filter strip, not a sidebar. Each pill carries the
          colour of the status it filters to, so the strip doubles as a legend
          for the grid underneath it. */}
      <div className="mb-5 flex gap-2">
        {(['ALL', 'VACANT', 'OCCUPIED'] as const).map((f) => {
          const active = filter === f;
          const tone =
            f === 'VACANT'
              ? 'var(--status-vacant)'
              : f === 'OCCUPIED'
                ? 'var(--status-occupied)'
                : 'var(--primary)';
          return (
            <Button
              key={f}
              size="sm"
              variant="outline"
              aria-pressed={active}
              onClick={() => setFilter(f)}
              style={{ '--tone': tone } as CSSProperties}
              className={cn(
                'min-h-11 flex-1 sm:flex-none',
                active && 'toned text-[var(--tone)] ring-1 ring-[var(--tone)]/40',
              )}
            >
              {f === 'ALL' ? 'All' : f === 'VACANT' ? 'Vacant' : 'Occupied'}
              <span className="tabular text-xs opacity-70">
                {f === 'ALL' ? rows.length : rows.filter((t) => t.status === f).length}
              </span>
            </Button>
          );
        })}
      </div>

      {tables.isLoading ? (
        <LoadingGrid count={6} />
      ) : tables.isError ? (
        <ErrorState error={tables.error} onRetry={() => void tables.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="size-6" />}
          title="No tables assigned yet"
          description="Ask the owner to assign you some tables — they will appear here immediately."
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nothing matches this filter" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((table) => (
            <TableCard key={table.id} table={table} basePath="/waiter" />
          ))}
        </div>
      )}
    </>
  );
}
