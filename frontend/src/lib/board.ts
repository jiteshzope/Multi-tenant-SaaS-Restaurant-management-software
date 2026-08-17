import type { KitchenBoard, KitchenOrder } from '@/types/domain';

export type BoardColumn = keyof KitchenBoard;

/**
 * How each kitchen column is ordered.
 *
 * This mirrors the `ORDER BY` in `KitchenService.board()` — the server is the
 * source of truth and this exists only so an *optimistic* card lands where the
 * refetch will put it. Without it the card visibly jumps a moment after you
 * move it. If the SQL changes, change this with it.
 *
 *   PENDING    placedAt ASC      longest wait at the top
 *   PREPARING  preparingAt ASC   the queue actually being cooked, in order
 *   COMPLETED  completedAt DESC  what just came off the pass, at the top
 *
 * A missing timestamp sorts last rather than first, matching SQL's NULLS LAST,
 * and ties break on order number so the result is never arbitrary.
 */
export function sortBoardColumn(column: BoardColumn, orders: KitchenOrder[]): KitchenOrder[] {
  const stamp = (o: KitchenOrder) => {
    const iso =
      column === 'PENDING' ? o.placedAt : column === 'PREPARING' ? o.preparingAt : o.completedAt;
    if (!iso) return null;
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? null : t;
  };

  return [...orders].sort((a, b) => {
    const [ka, kb] = [stamp(a), stamp(b)];
    if (ka === null && kb === null) return a.orderNumber - b.orderNumber;
    if (ka === null) return 1;
    if (kb === null) return -1;
    if (ka === kb) return a.orderNumber - b.orderNumber;
    return column === 'COMPLETED' ? kb - ka : ka - kb;
  });
}

/**
 * The card as it will exist in its destination column.
 *
 * Undoing a mistaken complete deliberately clears `completedAt` and leaves
 * `preparingAt` alone: the PREPARING column sorts on that timestamp, so keeping
 * it is what returns the order to the position in the queue it left rather than
 * to the back of it. The server makes the same choice.
 */
export function withMoveStamps(
  order: KitchenOrder,
  to: BoardColumn,
  now: () => string = () => new Date().toISOString(),
): KitchenOrder {
  return {
    ...order,
    status: to,
    preparingAt: to === 'PREPARING' ? (order.preparingAt ?? now()) : order.preparingAt,
    completedAt: to === 'COMPLETED' ? now() : null,
  };
}
