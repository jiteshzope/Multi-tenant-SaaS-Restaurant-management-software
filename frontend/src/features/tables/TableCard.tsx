import { Clock, Pencil, Plus, Receipt, ShoppingBag, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Money } from '@/components/common/Money';
import { TableStatusBadge } from '@/components/common/StatusBadge';
import { useElapsed } from '@/hooks/useElapsed';
import { cn } from '@/lib/cn';
import { elapsedSince, formatDuration } from '@/lib/datetime';
import type { TableCard as TableCardData } from '@/types/domain';

/**
 * One card, both grids. The owner's copy adds an "Assign" action; the waiter's
 * does not, because assigning is not their job.
 */
export function TableCard({
  table,
  basePath,
  onAssign,
  onEdit,
}: {
  table: TableCardData;
  basePath: string;
  onAssign?: (table: TableCardData) => void;
  onEdit?: (table: TableCardData) => void;
}) {
  const occupied = table.status === 'OCCUPIED';
  const tone = occupied ? 'var(--status-occupied)' : 'var(--status-vacant)';

  return (
    <Card
      style={{ '--tone': tone } as React.CSSProperties}
      className={cn(
        'group toned toned-hover relative gap-0 overflow-hidden transition-all hover:-translate-y-0.5',
      )}
    >
      {/* Status rail — colour plus the badge below, never colour alone. */}
      <span aria-hidden className="tone-rail absolute inset-x-0 top-0 h-1" />

      <div className="flex items-start justify-between gap-3 p-4 pb-3 sm:p-5 sm:pb-3">
        <div className="min-w-0">
          <p className="text-2xl leading-none font-semibold tracking-tight">
            Table {table.tableNumber}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {table.label ? `${table.label} · ` : ''}
            {table.capacity} seats
          </p>
        </div>
        <TableStatusBadge status={table.status} />
      </div>

      <div className="space-y-2 px-4 pb-4 text-sm sm:px-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <UserRound className="size-3.5 shrink-0" />
          <span className="truncate">
            {table.waiterName ?? <span className="italic">No waiter assigned</span>}
          </span>
        </div>

        {occupied ? (
          <>
            <OpenFor openedAt={table.openedAt} />
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1">
              <span className="flex items-center gap-2 text-muted-foreground">
                <ShoppingBag className="size-3.5 shrink-0" />
                {table.orderCount} {table.orderCount === 1 ? 'order' : 'orders'}
              </span>
              <Money
                value={table.runningTotal}
                className="text-base font-semibold text-status-occupied"
              />
            </div>
          </>
        ) : (
          <p className="py-1 text-xs text-muted-foreground/70">Ready for the next guests</p>
        )}
      </div>

      {/*
        The action row used to be a single non-wrapping flex line inside an
        `overflow-hidden` card, so the owner's third and fourth buttons were
        sliced off the right edge at every width. The primary action now owns
        its own full-width row and the secondaries wrap underneath it, which
        holds from a 320px phone up to a four-across desktop grid.
      */}
      <div className="mt-auto space-y-2 border-t border-border/60 p-3">
        {occupied ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" className="min-h-9 flex-1 basis-32">
              <Link to={`${basePath}/tables/${table.id}`}>
                <Receipt className="size-4" />
                View table
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="min-h-9 flex-1 basis-28">
              <Link to={`${basePath}/tables/${table.id}/order`}>
                <Plus className="size-4" />
                Add order
              </Link>
            </Button>
          </div>
        ) : (
          <Button asChild size="sm" className="min-h-9 w-full">
            <Link to={`${basePath}/tables/${table.id}/order`}>
              <Plus className="size-4" />
              Take order
            </Link>
          </Button>
        )}

        {(onAssign ?? onEdit) && (
          <div className="flex flex-wrap gap-2">
            {onAssign && (
              <Button
                size="sm"
                variant="ghost"
                className="min-h-9 flex-1 basis-24"
                onClick={() => onAssign(table)}
              >
                <UserRound className="size-3.5" />
                Assign
              </Button>
            )}
            {onEdit && (
              <Button
                size="sm"
                variant="ghost"
                className="min-h-9 flex-1 basis-24"
                onClick={() => onEdit(table)}
              >
                <Pencil className="size-3.5" />
                Edit
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function OpenFor({ openedAt }: { openedAt: string | null }) {
  const seconds = useElapsed(openedAt ? elapsedSince(openedAt) : 0, 30_000);
  if (!openedAt) return null;
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Clock className="size-3.5 shrink-0" />
      <span>Open {formatDuration(seconds)}</span>
    </div>
  );
}
