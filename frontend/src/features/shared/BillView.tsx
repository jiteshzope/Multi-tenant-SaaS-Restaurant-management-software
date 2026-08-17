import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Money } from '@/components/common/Money';
import { ErrorState, LoadingRows } from '@/components/common/States';
import { useBill } from '@/hooks/queries';
import { useTimezone } from '@/hooks/useAuth';
import { formatDateTime } from '@/lib/datetime';
import type { Bill } from '@/types/domain';

export function BillDialog({
  sessionId,
  open,
  onOpenChange,
}: {
  sessionId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const bill = useBill(sessionId, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogTitle className="sr-only">Bill</DialogTitle>

        {bill.isLoading ? (
          <div className="p-6">
            <LoadingRows count={5} />
          </div>
        ) : bill.isError ? (
          <div className="p-6">
            <ErrorState error={bill.error} onRetry={() => void bill.refetch()} />
          </div>
        ) : bill.data ? (
          <>
            <BillView bill={bill.data} />
            <div className="no-print flex gap-2 border-t border-border/60 p-4">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button className="flex-1" onClick={() => window.print()}>
                <Printer className="size-4" />
                Print bill
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Totals are rendered from the server's payload, never recomputed — the browser
 * would drift from the database's ROUND.
 */
export function BillView({ bill }: { bill: Bill }) {
  const tz = useTimezone();

  return (
    <article className="print-area px-6 py-6">
      <header className="mb-4 border-b border-dashed border-border/60 pb-4 text-center">
        <h2 className="text-lg font-semibold tracking-tight">{bill.restaurant.name}</h2>
        {bill.restaurant.address && (
          <p className="text-xs text-muted-foreground">{bill.restaurant.address}</p>
        )}
        {bill.restaurant.phone && (
          <p className="text-xs text-muted-foreground">{bill.restaurant.phone}</p>
        )}
      </header>

      <dl className="mb-4 grid grid-cols-2 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Table</dt>
        <dd className="text-right">
          {bill.tableNumber}
          {bill.tableLabel ? ` · ${bill.tableLabel}` : ''}
        </dd>

        <dt className="text-muted-foreground">Guests</dt>
        <dd className="text-right">{bill.guestCount ?? '—'}</dd>

        <dt className="text-muted-foreground">Served by</dt>
        <dd className="text-right">{bill.servedBy}</dd>

        <dt className="text-muted-foreground">Opened</dt>
        <dd className="text-right">{formatDateTime(bill.openedAt, tz)}</dd>

        {bill.closedAt && (
          <>
            <dt className="text-muted-foreground">Closed</dt>
            <dd className="text-right">{formatDateTime(bill.closedAt, tz)}</dd>
          </>
        )}
      </dl>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-xs tracking-wide uppercase">
            <th className="pb-2 text-left font-medium text-muted-foreground">Item</th>
            <th className="pb-2 text-right font-medium text-muted-foreground">Qty</th>
            <th className="pb-2 text-right font-medium text-muted-foreground">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.lines.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-6 text-center text-xs text-muted-foreground">
                Nothing ordered in this session.
              </td>
            </tr>
          ) : (
            bill.lines.map((line) => (
              <tr key={`${line.itemName}-${line.unitPrice}`} className="border-b border-border/40">
                <td className="py-2">
                  <span className="block">{line.itemName}</span>
                  <span className="text-xs text-muted-foreground">
                    <Money value={line.unitPrice} currency={bill.currency} /> each
                  </span>
                </td>
                <td className="tabular py-2 text-right">{line.quantity}</td>
                <td className="py-2 text-right">
                  <Money value={line.amount} currency={bill.currency} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <dl className="mt-4 space-y-1.5 text-sm">
        <Row label="Subtotal" value={bill.subtotal} currency={bill.currency} />
        <Row label={`Tax (${bill.taxPercent}%)`} value={bill.taxAmount} currency={bill.currency} />
        <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2 text-base font-semibold">
          <span>Grand total</span>
          <Money value={bill.grandTotal} currency={bill.currency} />
        </div>
      </dl>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Thank you — please visit again.
      </p>
    </article>
  );
}

function Row({ label, value, currency }: { label: string; value: string; currency: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>
        <Money value={value} currency={currency} />
      </dd>
    </div>
  );
}
