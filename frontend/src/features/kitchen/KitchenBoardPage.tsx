import { ChefHat, CircleCheck, Clock, Play, Timer, Undo2 } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import { Scroller } from '@/components/common/Scroller';
import { EmptyState, ErrorState } from '@/components/common/States';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/AppShell';
import { useKitchenBoard, useKitchenCounts } from '@/hooks/queries';
import { useTransitionOrder } from '@/hooks/mutations';
import { useElapsed } from '@/hooks/useElapsed';
import { useSocket } from '@/hooks/useSocket';
import { useTimezone } from '@/hooks/useAuth';
import { AGE_LATE_SECONDS, AGE_WARN_SECONDS } from '@/lib/constants';
import { cn } from '@/lib/cn';
import { formatClock, formatTime } from '@/lib/datetime';
import type { KitchenOrder } from '@/types/domain';

type Column = 'PENDING' | 'PREPARING' | 'COMPLETED';

const COLUMNS: {
  key: Column;
  title: string;
  accent: string;
  bar: string;
  tone: string;
  Icon: typeof Clock;
}[] = [
  {
    key: 'PENDING',
    title: 'Pending',
    accent: 'text-status-pending',
    bar: 'bg-status-pending',
    tone: 'var(--status-pending)',
    Icon: Clock,
  },
  {
    key: 'PREPARING',
    title: 'Preparing',
    accent: 'text-status-preparing',
    bar: 'bg-status-preparing',
    tone: 'var(--status-preparing)',
    Icon: ChefHat,
  },
  {
    key: 'COMPLETED',
    title: 'Completed',
    accent: 'text-status-completed',
    bar: 'bg-status-completed',
    tone: 'var(--status-completed)',
    Icon: CircleCheck,
  },
];

export function KitchenBoardPage() {
  const connection = useSocket();
  const connected = connection === 'connected';
  const board = useKitchenBoard(connected);
  const counts = useKitchenCounts(connected);
  const transition = useTransitionOrder();

  const total = useMemo(() => {
    const d = board.data;
    if (!d) return 0;
    return d.PENDING.length + d.PREPARING.length + d.COMPLETED.length;
  }, [board.data]);

  return (
    <>
      <PageHeader
        title="Kitchen board"
        description={
          board.data
            ? `${total} orders today · ${board.data.PENDING.length} waiting to start`
            : 'Today’s orders, oldest first'
        }
        actions={
          <div className="text-xs text-muted-foreground">
            {connected ? 'Live updates on' : 'Refreshing every 15 s'}
          </div>
        }
      />

      {board.isError ? (
        <ErrorState error={board.error} onRetry={() => void board.refetch()} />
      ) : (
        /*
          Three columns from `md` up — a 768px tablet held in landscape is the
          kitchen's actual screen, and stacking there wasted two thirds of the
          width. Below that the columns stack, and each one sizes to its
          contents instead of holding a fixed viewport-height box: an empty
          PENDING column used to reserve 220px of nothing before the reader
          could reach the orders that mattered.
        */
        <div className="grid items-start gap-4 md:grid-cols-3">
          {COLUMNS.map((column) => {
            const orders = board.data?.[column.key] ?? [];
            const count = counts.data?.[column.key] ?? orders.length;
            return (
              <section
                key={column.key}
                aria-label={`${column.title} orders`}
                style={{ '--tone': column.tone } as CSSProperties}
                className="toned flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card/30"
              >
                <header className="flex items-center justify-between gap-2 border-b border-[color-mix(in_oklch,var(--tone)_28%,transparent)] bg-[color-mix(in_oklch,var(--tone)_12%,transparent)] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn('size-2.5 shrink-0 rounded-full', column.bar)}
                      aria-hidden
                    />
                    <h2
                      className={cn('text-sm font-semibold tracking-wide uppercase', column.accent)}
                    >
                      {column.title}
                    </h2>
                  </div>
                  <span
                    className={cn(
                      'tabular rounded-full px-2.5 py-0.5 text-xs font-bold',
                      count > 0
                        ? 'bg-[color-mix(in_oklch,var(--tone)_25%,transparent)]'
                        : 'bg-muted text-muted-foreground',
                      count > 0 && column.accent,
                    )}
                  >
                    {count}
                  </span>
                </header>

                <Scroller
                  orientation="y"
                  /* Capped only where there is a viewport to cap against. On a
                     phone the column simply grows and the page scrolls. */
                  className="md:max-h-[calc(100vh-15rem)]"
                  viewportClassName="space-y-3 p-3"
                  fadeSize={36}
                >
                  {board.isLoading ? (
                    Array.from({ length: 2 }, (_, i) => (
                      <Skeleton key={i} className="h-40 rounded-xl" />
                    ))
                  ) : orders.length === 0 ? (
                    <EmptyState
                      icon={<column.Icon className="size-5" />}
                      title={`Nothing ${column.title.toLowerCase()}`}
                      className="border-0 py-6 md:py-10"
                    />
                  ) : (
                    orders.map((order) => (
                      <KitchenOrderCard
                        key={order.id}
                        order={order}
                        onAdvance={
                          column.key === 'COMPLETED'
                            ? undefined
                            : () =>
                                transition.mutate({
                                  id: order.id,
                                  from: column.key,
                                  to: column.key === 'PENDING' ? 'PREPARING' : 'COMPLETED',
                                })
                        }
                        // Undo for the handler who tapped "Mark complete" on the
                        // wrong card. The order goes back to the position in the
                        // PREPARING queue it left, not to the end of it.
                        onReopen={
                          column.key === 'COMPLETED'
                            ? () =>
                                transition.mutate({
                                  id: order.id,
                                  from: 'COMPLETED',
                                  to: 'PREPARING',
                                })
                            : undefined
                        }
                        busy={transition.isPending && transition.variables?.id === order.id}
                      />
                    ))
                  )}
                </Scroller>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

/**
 * One visible border wraps the entire order, so every item in it reads as one
 * unit that moves together. Exactly one action per card — items are never moved
 * individually, because there is no per-item status in the schema. That one
 * action is `Start` in PENDING, `Mark complete` in PREPARING, and `Move back`
 * in COMPLETED.
 */
function KitchenOrderCard({
  order,
  onAdvance,
  onReopen,
  busy,
}: {
  order: KitchenOrder;
  onAdvance?: () => void;
  onReopen?: () => void;
  busy: boolean;
}) {
  const tz = useTimezone();
  const age = useElapsed(order.ageSeconds);

  /*
    Age drives one hue that the whole card wears — border, timer and the little
    "late" pill all read off `tone`, so a card can never show a green rim above
    a red clock. Completed orders opt out of the ramp entirely: they are done,
    and how long they took is history, not an alarm.
  */
  const late = order.status !== 'COMPLETED' && age > AGE_LATE_SECONDS;
  const warn = order.status !== 'COMPLETED' && !late && age > AGE_WARN_SECONDS;

  const tone =
    order.status === 'COMPLETED'
      ? 'var(--status-completed)'
      : late
        ? 'var(--destructive)'
        : warn
          ? 'var(--status-pending)'
          : 'var(--status-completed)';

  const ageTone = late
    ? 'text-destructive'
    : warn
      ? 'text-status-pending'
      : order.status === 'COMPLETED'
        ? 'text-muted-foreground'
        : 'text-status-completed';

  return (
    <article
      style={{ '--tone': tone } as CSSProperties}
      className={cn(
        'animate-in overflow-hidden rounded-xl border-2 bg-card shadow-lg shadow-black/20 duration-300 fade-in slide-in-from-bottom-2',
        'border-[color-mix(in_oklch,var(--tone)_45%,transparent)]',
        late && 'shadow-[0_0_0_1px_color-mix(in_oklch,var(--destructive)_30%,transparent)]',
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-[color-mix(in_oklch,var(--tone)_25%,transparent)] bg-[color-mix(in_oklch,var(--tone)_10%,transparent)] px-3.5 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="tabular text-lg font-bold">#{order.orderNumber}</span>
          <span className="truncate text-sm text-muted-foreground">Table {order.tableNumber}</span>
        </div>
        <span
          className={cn(
            'tabular flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
            'bg-[color-mix(in_oklch,var(--tone)_16%,transparent)]',
            ageTone,
          )}
        >
          <Timer className="size-3.5" aria-hidden />
          {formatClock(age)}
          {late && <span className="sr-only"> — running late</span>}
        </span>
      </header>

      <ul className="space-y-1.5 px-3.5 py-3">
        {order.items.map((item, i) => (
          <li key={`${item.name}-${i}`} className="flex gap-2 text-sm leading-snug">
            <span className="tabular shrink-0 font-bold text-primary">{item.quantity}×</span>
            <span className="min-w-0">
              {/* Item names wrap. A kitchen that cannot read the whole dish
                  name has been given nothing. */}
              <span className="break-words">{item.name}</span>
              {item.note && (
                <span className="block text-xs text-status-pending italic">{item.note}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {order.note && (
        <p className="border-t border-status-pending/25 bg-status-pending/10 px-3.5 py-2 text-xs font-medium break-words text-status-pending">
          {order.note}
        </p>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-3.5 py-2.5">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {order.placedBy} · {formatTime(order.placedAt, tz)}
        </span>
        {onAdvance && (
          <Button size="sm" onClick={onAdvance} loading={busy} className="min-h-10">
            {!busy &&
              (order.status === 'PENDING' ? (
                <Play className="size-3.5" />
              ) : (
                <CircleCheck className="size-3.5" />
              ))}
            {order.status === 'PENDING' ? 'Start' : 'Mark complete'}
          </Button>
        )}
        {onReopen && (
          /*
            An undo, not a primary action — `outline` so it never competes with
            the Start and Mark complete buttons a handler is aiming for during
            service, but still a full 44px touch target.
          */
          <Button
            size="sm"
            variant="outline"
            onClick={onReopen}
            loading={busy}
            className="min-h-10"
            aria-label={`Move order ${order.orderNumber} back to preparing`}
          >
            {!busy && <Undo2 className="size-3.5" />}
            Move back
          </Button>
        )}
      </footer>
    </article>
  );
}
