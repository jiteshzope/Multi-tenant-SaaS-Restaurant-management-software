import { ArrowLeft, Ban, History, Plus, Receipt } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Money } from '@/components/common/Money';
import { EmptyState, ErrorState, LoadingRows } from '@/components/common/States';
import { StatusBadge, TableStatusBadge } from '@/components/common/StatusBadge';
import { useSession, useSessionHistory, useTable } from '@/hooks/queries';
import { useCancelOrder, useCloseSession } from '@/hooks/mutations';
import { useAuth, useTimezone } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';
import { formatDateTime, formatTime } from '@/lib/datetime';
import { ApiError } from '@/types/api';
import { BillDialog } from './BillView';

export function TableDetail() {
  const { tableId = '' } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const tz = useTimezone();
  const basePath = role === 'OWNER' ? '/owner' : '/waiter';

  const table = useTable(tableId);
  const sessionId = table.data?.sessionId ?? undefined;
  const session = useSession(sessionId);
  const closeSession = useCloseSession();
  const cancelOrder = useCancelOrder();

  const [billOpen, setBillOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const unfinished = session.data?.unfinishedOrders ?? 0;

  const doClose = async () => {
    if (!sessionId) return;
    try {
      await closeSession.mutateAsync(sessionId);
      toast.success(`Table ${table.data?.tableNumber} closed`);
      setConfirmClose(false);
      navigate(basePath);
    } catch (e) {
      if (ApiError.isApiError(e) && e.code === 'ORDERS_IN_PROGRESS') {
        toast.error('Orders are still in the kitchen', {
          description: 'Wait for them to be completed, or cancel the pending ones.',
        });
        setConfirmClose(false);
        return;
      }
      toast.error(e instanceof Error ? e.message : 'Could not close the table');
    }
  };

  const doCancel = async (orderId: string) => {
    try {
      await cancelOrder.mutateAsync(orderId);
      toast.success('Order cancelled');
      setCancelling(null);
    } catch (e) {
      if (ApiError.isApiError(e) && e.code === 'ORDER_ALREADY_MOVED') {
        toast.warning('The kitchen already started this order');
        setCancelling(null);
        return;
      }
      toast.error(e instanceof Error ? e.message : 'Could not cancel the order');
    }
  };

  if (table.isLoading) return <LoadingRows count={4} />;
  if (table.isError) {
    return <ErrorState error={table.error} onRetry={() => void table.refetch()} />;
  }
  if (!table.data) return null;

  const t = table.data;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 sm:mb-6 sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-2 sm:gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Back" className="shrink-0">
            <Link to={basePath}>
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">Table {t.tableNumber}</h1>
              <TableStatusBadge status={t.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.label ? `${t.label} · ` : ''}
              {t.capacity} seats
              {t.waiterName ? ` · served by ${t.waiterName}` : ''}
              {session.data?.openedAt ? ` · opened ${formatTime(session.data.openedAt, tz)}` : ''}
            </p>
          </div>
        </div>

        {/* Four actions do not fit one phone row; they wrap into an even grid
            instead of squeezing to unreadable widths. */}
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <Button
            variant="ghost"
            className="min-h-11 w-full sm:min-h-10 sm:w-auto"
            onClick={() => setShowHistory((v) => !v)}
          >
            <History className="size-4" />
            History
          </Button>
          <Button asChild variant="outline" className="min-h-11 w-full sm:min-h-10 sm:w-auto">
            <Link to={`${basePath}/tables/${t.id}/order`}>
              <Plus className="size-4" />
              {t.status === 'OCCUPIED' ? 'Add order' : 'Take order'}
            </Link>
          </Button>
          {sessionId && (
            <>
              <Button
                variant="outline"
                className="min-h-11 w-full sm:min-h-10 sm:w-auto"
                onClick={() => setBillOpen(true)}
              >
                <Receipt className="size-4" />
                View bill
              </Button>
              <CloseButton
                disabled={unfinished > 0}
                unfinished={unfinished}
                onClick={() => setConfirmClose(true)}
              />
            </>
          )}
        </div>
      </div>

      {/* Running total. `Card` is flex-col by default, so this row says flex-row. */}
      {sessionId && (
        <Card
          style={{ '--tone': 'var(--status-occupied)' } as CSSProperties}
          className="toned mb-6 flex-row flex-wrap items-center justify-between gap-4 p-4 sm:p-5"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              Running total
            </p>
            <Money
              value={session.data?.runningTotal ?? '0.00'}
              className="text-3xl font-semibold text-primary"
            />
          </div>
          <div className="flex gap-5 text-sm sm:gap-6">
            <Stat label="Orders" value={String(session.data?.orders.length ?? 0)} />
            <Stat
              label="In kitchen"
              value={String(unfinished)}
              tone={unfinished > 0 ? 'text-status-pending' : undefined}
            />
            <Stat label="Guests" value={session.data?.guestCount?.toString() ?? '—'} />
          </div>
        </Card>
      )}

      {/* Timeline */}
      {!sessionId ? (
        <EmptyState
          title="This table is vacant"
          description="Taking an order opens a new session for the guests sitting down."
          action={
            <Button asChild>
              <Link to={`${basePath}/tables/${t.id}/order`}>Take order</Link>
            </Button>
          }
        />
      ) : session.isLoading ? (
        <LoadingRows count={3} />
      ) : session.isError ? (
        <ErrorState error={session.error} onRetry={() => void session.refetch()} />
      ) : (session.data?.orders.length ?? 0) === 0 ? (
        <EmptyState
          title="No orders yet"
          description="Nothing has been sent to the kitchen for this session."
        />
      ) : (
        <ol className="space-y-4">
          {session.data!.orders.map((order) => (
            <li key={order.id}>
              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border/60 px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-3">
                    <span className="tabular text-lg font-semibold">#{order.orderNumber}</span>
                    <StatusBadge status={order.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="whitespace-nowrap">{formatDateTime(order.placedAt, tz)}</span>
                    <span className="whitespace-nowrap">by {order.placedBy}</span>
                    {order.status === 'PENDING' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCancelling(order.id)}
                        className="text-destructive"
                      >
                        <Ban className="size-3.5" />
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                <ul className="divide-y divide-border/50">
                  {order.items.map((line) => (
                    <li
                      key={line.id}
                      className="flex items-start justify-between gap-3 px-4 py-2.5 sm:px-5"
                    >
                      <div className="min-w-0">
                        <p
                          className={
                            order.status === 'CANCELLED'
                              ? 'text-sm break-words text-muted-foreground line-through'
                              : 'text-sm break-words'
                          }
                        >
                          <span className="tabular mr-2 font-semibold text-primary">
                            {line.quantity}×
                          </span>
                          {line.itemName}
                        </p>
                        {line.note && (
                          <p className="text-xs break-words text-muted-foreground italic">
                            {line.note}
                          </p>
                        )}
                      </div>
                      <Money value={line.lineTotal} className="shrink-0 text-sm" />
                    </li>
                  ))}
                </ul>

                {order.note && (
                  <p className="border-t border-border/60 bg-status-pending/8 px-4 py-2 text-xs break-words text-status-pending sm:px-5">
                    Note: {order.note}
                  </p>
                )}

                <div className="flex items-center justify-between gap-3 bg-muted/25 px-4 py-2.5 sm:px-5">
                  <span className="text-xs text-muted-foreground">Order total</span>
                  <Money value={order.orderTotal} className="font-semibold" />
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}

      {showHistory && <PastSessions tableId={t.id} />}

      <BillDialog sessionId={sessionId} open={billOpen} onOpenChange={setBillOpen} />

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title={`Close table ${t.tableNumber}?`}
        description="The bill is finalised and the table becomes vacant. Past orders stay in the session history."
        confirmLabel="Close table"
        loading={closeSession.isPending}
        onConfirm={() => void doClose()}
      />

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(open) => !open && setCancelling(null)}
        title="Cancel this order?"
        description="Only orders the kitchen has not started can be cancelled."
        confirmLabel="Cancel order"
        destructive
        loading={cancelOrder.isPending}
        onConfirm={() => cancelling && void doCancel(cancelling)}
      />
    </>
  );
}

function CloseButton({
  disabled,
  unfinished,
  onClick,
}: {
  disabled: boolean;
  unfinished: number;
  onClick: () => void;
}) {
  const cls = 'min-h-11 w-full sm:min-h-10 sm:w-auto';
  if (!disabled) {
    return (
      <Button className={cls} onClick={onClick}>
        Close table
      </Button>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button swallows pointer events — the span keeps the tooltip reachable. */}
        <span tabIndex={0} className="w-full sm:w-auto">
          <Button disabled className={cls}>
            Close table
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {unfinished} order{unfinished === 1 ? '' : 's'} still in the kitchen. The server rejects a
        close until they are completed or cancelled.
      </TooltipContent>
    </Tooltip>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="text-right">
      <p className="text-[11px] tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className={cn('tabular text-lg font-semibold', tone)}>{value}</p>
    </div>
  );
}

function PastSessions({ tableId }: { tableId: string }) {
  const tz = useTimezone();
  const history = useSessionHistory(tableId);

  return (
    <div className="mt-8">
      <Separator className="mb-4" />
      <h2 className="mb-3 text-sm font-medium tracking-wide text-muted-foreground uppercase">
        Past sessions
      </h2>
      {history.isLoading ? (
        <LoadingRows count={3} />
      ) : (history.data ?? []).length === 0 ? (
        <EmptyState title="No closed sessions yet" />
      ) : (
        <ul className="space-y-2">
          {(history.data ?? []).map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between rounded-lg border border-border/60 bg-card/40 px-4 py-3 text-sm"
            >
              <div>
                <p>{formatDateTime(row.openedAt, tz)}</p>
                <p className="text-xs text-muted-foreground">served by {row.servedBy}</p>
              </div>
              <Money value={row.total} className="font-medium" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
