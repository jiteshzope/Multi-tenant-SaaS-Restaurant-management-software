import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Check, Minus, Plus, Search, ShoppingCart, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, useDeferredValue } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { sessionsApi } from '@/api/resources';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Money, PaiseMoney } from '@/components/common/Money';
import { Scroller } from '@/components/common/Scroller';
import { EmptyState, ErrorState, LoadingGrid } from '@/components/common/States';
import { useMenu, useMenuSearch } from '@/hooks/queries';
import { usePlaceOrder } from '@/hooks/mutations';
import { useDebounce } from '@/hooks/useDebounce';
import { useElapsed } from '@/hooks/useElapsed';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';
import { elapsedSince, formatDuration } from '@/lib/datetime';
import { SEARCH_DEBOUNCE_MS } from '@/lib/constants';
import { multiplyPaise } from '@/lib/money';
import { useCartStore } from '@/store/cart.store';
import { ApiError } from '@/types/api';
import type { MenuItem } from '@/types/domain';

/**
 * The core screen. One implementation for OWNER and WAITER, parameterized by
 * the role's base path.
 *
 *   ┌──────────────┬──────────────────────────────┐
 *   │  CATEGORIES  │  search + item grid          │
 *   │     30%      │            70%               │
 *   └──────────────┴──────────────────────────────┘
 */
export function TakeOrderScreen() {
  const { tableId = '' } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const basePath = role === 'OWNER' ? '/owner' : '/waiter';

  const menu = useMenu();
  const placeOrder = usePlaceOrder();

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [rawSearch, setRawSearch] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [orderNote, setOrderNote] = useState('');
  const [unavailableIds, setUnavailableIds] = useState<string[]>([]);

  const debouncedSearch = useDebounce(rawSearch.trim(), SEARCH_DEBOUNCE_MS);
  const deferredSearch = useDeferredValue(debouncedSearch);
  const search = useMenuSearch(deferredSearch);

  /**
   * Entering the screen opens the session first — idempotent, so a double-tap
   * returns the same one (database/CLAUDE.md query 23). The returned id keys
   * the cart.
   */
  const session = useMutation({
    mutationFn: () => sessionsApi.open({ tableId }),
  });

  useEffect(() => {
    if (tableId) session.mutate();
    // Opening the session is a one-shot side effect of arriving at this table.
  }, [tableId]);

  const sessionId = session.data?.id ?? '';

  const carts = useCartStore((s) => s.carts);
  const addToCart = useCartStore((s) => s.add);
  const setQty = useCartStore((s) => s.setQty);
  const setNote = useCartStore((s) => s.setNote);
  const clearCart = useCartStore((s) => s.clear);

  const lines = useMemo(() => carts[sessionId] ?? [], [carts, sessionId]);
  const totalCount = lines.reduce((n, l) => n + l.quantity, 0);
  const totalPaise = lines.reduce((sum, l) => sum + multiplyPaise(l.unitPrice, l.quantity), 0);

  const categories = menu.data ?? [];
  useEffect(() => {
    if (!activeCategory && categories.length > 0) setActiveCategory(categories[0].id);
  }, [categories, activeCategory]);

  const searching = deferredSearch.length > 0;
  const visibleItems: (MenuItem & { categoryName?: string })[] = searching
    ? (search.data ?? [])
    : (categories.find((c) => c.id === activeCategory)?.items ?? []);

  const qtyOf = (menuItemId: string) =>
    lines.find((l) => l.menuItemId === menuItemId)?.quantity ?? 0;

  const send = async () => {
    if (!sessionId || lines.length === 0) return;
    try {
      const order = await placeOrder.mutateAsync({
        sessionId,
        // Only ids, quantities and notes — a price field here would be a bug.
        items: lines.map((l) => ({
          menuItemId: l.menuItemId,
          quantity: l.quantity,
          note: l.note,
        })),
        note: orderNote.trim() || undefined,
      });
      clearCart(sessionId);
      setOrderNote('');
      setPreviewOpen(false);
      toast.success(`Order #${order.orderNumber} sent to kitchen`);
      navigate(`${basePath}/tables/${tableId}`);
    } catch (e) {
      if (ApiError.isApiError(e)) {
        if (e.code === 'ITEM_UNAVAILABLE') {
          const ids = (e.details as { menuItemIds?: string[] } | undefined)?.menuItemIds ?? [];
          setUnavailableIds(ids);
          toast.error('Some items just went out of stock', {
            description: 'They are marked in the preview — remove them and send again.',
          });
          return;
        }
        if (e.code === 'SESSION_NOT_OPEN') {
          toast.error('This table was closed', { description: 'Open it again to keep ordering.' });
          navigate(`${basePath}/tables/${tableId}`);
          return;
        }
      }
      toast.error(e instanceof Error ? e.message : 'Could not send the order');
    }
  };

  if (session.isError) {
    return (
      <ErrorState
        error={session.error}
        onRetry={() => session.mutate()}
        className="mx-auto max-w-lg"
      />
    );
  }

  const categoryButtons = (
    <>
      {menu.isLoading
        ? Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="h-11 w-28 shrink-0 animate-pulse rounded-lg bg-muted/50 md:w-full"
            />
          ))
        : categories.map((category) => {
            const active = !searching && category.id === activeCategory;
            return (
              <button
                key={category.id}
                onClick={() => {
                  setActiveCategory(category.id);
                  setRawSearch('');
                }}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex min-h-11 shrink-0 snap-start items-center justify-between gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors md:w-full',
                  active
                    ? 'bg-primary/18 text-primary ring-1 ring-primary/30'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <span className="truncate">{category.name}</span>
                <span
                  className={cn(
                    'tabular shrink-0 rounded-full px-1.5 py-0.5 text-xs',
                    active ? 'bg-primary/25' : 'bg-muted',
                  )}
                >
                  {category.items.length}
                </span>
              </button>
            );
          })}
    </>
  );

  return (
    <div className="flex min-h-[calc(100vh-9rem)] flex-col md:h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Back to table">
            <Link to={`${basePath}/tables/${tableId}`}>
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">Take order</h1>
            {session.data && <OpenFor openedAt={session.data.openedAt} />}
          </div>
        </div>

        {/* On a phone the cart lives in a fixed bar at the thumb, not up here. */}
        <Button
          size="lg"
          onClick={() => setPreviewOpen(true)}
          disabled={totalCount === 0}
          className="hidden gap-3 sm:inline-flex"
        >
          <ShoppingCart className="size-4" />
          Preview
          {totalCount > 0 && (
            <span className="tabular rounded-full bg-primary-foreground/25 px-2 py-0.5 text-xs">
              {totalCount} · <PaiseMoney paise={totalPaise} />
            </span>
          )}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
        {/*
          Categories: a vertical rail from md up, a horizontal strip below it.
          The strip is wrapped in a Scroller so the categories that run past the
          right edge of a phone announce themselves — before this, "Drinks" and
          "Desserts" were simply invisible with nothing to suggest a swipe.
        */}
        <Scroller
          orientation="x"
          aria-label="Menu categories"
          className="shrink-0 rounded-xl border border-border/60 bg-card/40 md:hidden"
          viewportClassName="flex snap-x gap-2 p-2"
          fadeSize={32}
        >
          {categoryButtons}
        </Scroller>

        <Scroller
          orientation="y"
          aria-label="Menu categories"
          className="hidden shrink-0 rounded-xl border border-border/60 bg-card/40 md:block md:w-[30%] md:max-w-64"
          viewportClassName="flex flex-col gap-2 p-2"
          fadeSize={28}
        >
          {categoryButtons}
        </Scroller>

        {/* Items — 70% */}
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="sticky top-0 z-10 bg-background/80 pb-3 backdrop-blur">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={rawSearch}
                onChange={(e) => setRawSearch(e.target.value)}
                placeholder="Search items across all categories…"
                className="h-12 pr-10 pl-10 text-base"
                aria-label="Search menu items"
              />
              {rawSearch && (
                <button
                  onClick={() => setRawSearch('')}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {menu.isLoading ? (
              <LoadingGrid count={6} className="lg:grid-cols-3" />
            ) : menu.isError ? (
              <ErrorState error={menu.error} onRetry={() => void menu.refetch()} />
            ) : visibleItems.length === 0 ? (
              <EmptyState
                title={searching ? `No items match “${deferredSearch}”` : 'This category is empty'}
                description={
                  searching
                    ? 'Try a shorter search term.'
                    : 'Add items to it from the menu manager.'
                }
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 pb-4 lg:grid-cols-3 2xl:grid-cols-4">
                {visibleItems.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    quantity={qtyOf(item.id)}
                    showCategory={searching}
                    onAdd={() => {
                      setUnavailableIds((ids) => ids.filter((id) => id !== item.id));
                      addToCart(sessionId, item);
                    }}
                    onDecrease={() => setQty(sessionId, item.id, qtyOf(item.id) - 1)}
                    disabled={!sessionId}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/*
        Phone cart bar. The desktop Preview button sits in the header, which on
        a phone is above the fold and out of thumb reach once you have scrolled
        into the menu — so below `sm` the cart follows you, pinned above the
        home indicator.
      */}
      {totalCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-xl sm:hidden">
          <Button size="lg" className="w-full justify-between" onClick={() => setPreviewOpen(true)}>
            <span className="flex items-center gap-2">
              <ShoppingCart className="size-4" />
              Preview order
            </span>
            <span className="tabular rounded-full bg-primary-foreground/25 px-2.5 py-0.5 text-xs">
              {totalCount} · <PaiseMoney paise={totalPaise} />
            </span>
          </Button>
        </div>
      )}
      {/* Reserve the bar's height so the last row of items stays reachable. */}
      {totalCount > 0 && <div aria-hidden className="h-20 shrink-0 sm:hidden" />}

      <OrderPreviewSheet
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        lines={lines}
        totalPaise={totalPaise}
        unavailableIds={unavailableIds}
        orderNote={orderNote}
        onOrderNote={setOrderNote}
        onQty={(id, qty) => setQty(sessionId, id, qty)}
        onNote={(id, note) => setNote(sessionId, id, note)}
        onSend={send}
        sending={placeOrder.isPending}
      />
    </div>
  );
}

function OpenFor({ openedAt }: { openedAt: string }) {
  const seconds = useElapsed(elapsedSince(openedAt), 30_000);
  return <p className="text-xs text-muted-foreground">Session open {formatDuration(seconds)}</p>;
}

function MenuItemCard({
  item,
  quantity,
  showCategory,
  onAdd,
  onDecrease,
  disabled,
}: {
  item: MenuItem & { categoryName?: string };
  quantity: number;
  showCategory?: boolean;
  onAdd: () => void;
  onDecrease: () => void;
  disabled?: boolean;
}) {
  const unavailable = !item.isAvailable;

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-border/60 bg-card/60 p-3 transition-all sm:p-3.5',
        quantity > 0 && 'border-primary/60 bg-primary/10 ring-1 ring-primary/20',
        unavailable && 'opacity-55',
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-start gap-2">
          {item.isVeg !== null && (
            <span
              aria-label={item.isVeg ? 'Vegetarian' : 'Non-vegetarian'}
              title={item.isVeg ? 'Vegetarian' : 'Non-vegetarian'}
              className={cn(
                'mt-1 grid size-3.5 shrink-0 place-items-center rounded-sm border-2',
                item.isVeg ? 'border-status-completed' : 'border-destructive',
              )}
            >
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  item.isVeg ? 'bg-status-completed' : 'bg-destructive',
                )}
              />
            </span>
          )}
          {/* Long dish names wrap; a waiter must be able to read the whole one. */}
          <p className="min-w-0 text-sm leading-snug font-medium break-words">{item.name}</p>
        </div>

        {showCategory && item.categoryName && (
          <p className="truncate text-xs text-muted-foreground">in {item.categoryName}</p>
        )}

        <Money value={item.price} className="block text-base font-semibold text-primary" />

        {unavailable && (
          <span className="inline-block rounded-full border border-destructive/30 bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
            Unavailable
          </span>
        )}
      </div>

      {quantity > 0 ? (
        <div className="flex items-center justify-between gap-1">
          <Button
            size="icon"
            variant="outline"
            onClick={onDecrease}
            aria-label={`Remove one ${item.name}`}
            className="size-11"
          >
            <Minus className="size-4" />
          </Button>
          <span className="tabular text-lg font-semibold">{quantity}</span>
          <Button
            size="icon"
            onClick={onAdd}
            disabled={unavailable || disabled}
            aria-label={`Add one more ${item.name}`}
            className="size-11"
          >
            <Plus className="size-4" />
          </Button>
        </div>
      ) : (
        <Button
          className="min-h-11 w-full"
          variant="outline"
          onClick={onAdd}
          disabled={unavailable || disabled}
        >
          <Plus className="size-4" />
          Add
        </Button>
      )}
    </div>
  );
}

function OrderPreviewSheet({
  open,
  onOpenChange,
  lines,
  totalPaise,
  unavailableIds,
  orderNote,
  onOrderNote,
  onQty,
  onNote,
  onSend,
  sending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: { menuItemId: string; name: string; unitPrice: string; quantity: number; note?: string }[];
  totalPaise: number;
  unavailableIds: string[];
  orderNote: string;
  onOrderNote: (note: string) => void;
  onQty: (menuItemId: string, qty: number) => void;
  onNote: (menuItemId: string, note: string) => void;
  onSend: () => void;
  sending: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Order preview</SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5">
          {lines.length === 0 ? (
            <EmptyState title="Nothing selected yet" className="mt-6" />
          ) : (
            lines.map((line) => {
              const flagged = unavailableIds.includes(line.menuItemId);
              return (
                <div
                  key={line.menuItemId}
                  className={cn(
                    'space-y-2 rounded-xl border border-border/60 bg-card/40 p-3',
                    flagged && 'border-destructive/60 bg-destructive/5',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words">{line.name}</p>
                      <p className="text-xs text-muted-foreground">
                        <Money value={line.unitPrice} /> each
                      </p>
                      {flagged && (
                        <p className="mt-1 text-xs text-destructive">
                          Out of stock — remove to continue
                        </p>
                      )}
                    </div>
                    <PaiseMoney
                      paise={multiplyPaise(line.unitPrice, line.quantity)}
                      className="shrink-0 font-semibold"
                    />
                  </div>

                  {/*
                    Stepper and note used to share one row; at 390px the note
                    input was squeezed to about forty pixels. The note takes its
                    own row below `sm`.
                  */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon-sm"
                        variant="outline"
                        className="size-9"
                        onClick={() => onQty(line.menuItemId, line.quantity - 1)}
                        aria-label={`Decrease ${line.name}`}
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <span className="tabular w-8 text-center text-sm font-medium">
                        {line.quantity}
                      </span>
                      <Button
                        size="icon-sm"
                        variant="outline"
                        className="size-9"
                        onClick={() => onQty(line.menuItemId, line.quantity + 1)}
                        aria-label={`Increase ${line.name}`}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </div>

                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="order-last size-9"
                      onClick={() => onQty(line.menuItemId, 0)}
                      aria-label={`Remove ${line.name}`}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>

                    <Input
                      value={line.note ?? ''}
                      onChange={(e) => onNote(line.menuItemId, e.target.value)}
                      placeholder="Note (e.g. no ice)"
                      className="h-9 w-full min-w-32 flex-1 text-xs sm:w-auto"
                      aria-label={`Note for ${line.name}`}
                    />
                  </div>
                </div>
              );
            })
          )}

          {lines.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <label htmlFor="orderNote" className="text-sm font-medium">
                Order note
              </label>
              <Textarea
                id="orderNote"
                value={orderNote}
                onChange={(e) => onOrderNote(e.target.value)}
                placeholder="Anything the kitchen should know — “less spicy”, “serve together”…"
                className="min-h-16"
              />
            </div>
          )}
        </div>

        <SheetFooter>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Subtotal</span>
            <PaiseMoney paise={totalPaise} className="text-xl font-semibold" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Back to selection
            </Button>
            <Button
              className="flex-[2]"
              size="lg"
              disabled={lines.length === 0 || sending}
              loading={sending}
              onClick={onSend}
            >
              {!sending && <Check className="size-4" />}
              Send to kitchen
            </Button>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Prices are confirmed by the server when the order is placed.
          </p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
