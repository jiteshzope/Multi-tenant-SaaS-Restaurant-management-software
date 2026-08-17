import { describe, expect, it } from 'vitest';
import { sortBoardColumn, withMoveStamps } from './board';
import type { KitchenOrder } from '@/types/domain';

const at = (min: number) => new Date(Date.UTC(2026, 7, 17, 12, min, 0)).toISOString();

function order(partial: Partial<KitchenOrder> & { orderNumber: number }): KitchenOrder {
  return {
    id: `id-${partial.orderNumber}`,
    status: 'PREPARING',
    note: null,
    placedAt: at(0),
    preparingAt: null,
    completedAt: null,
    tableNumber: 1,
    placedBy: 'Amit',
    ageSeconds: 0,
    items: [],
    ...partial,
  };
}

const numbers = (rows: KitchenOrder[]) => rows.map((o) => o.orderNumber);

describe('sortBoardColumn', () => {
  it('puts the longest-waiting order at the top of PENDING', () => {
    const rows = [
      order({ orderNumber: 3, placedAt: at(30) }),
      order({ orderNumber: 1, placedAt: at(10) }),
      order({ orderNumber: 2, placedAt: at(20) }),
    ];
    expect(numbers(sortBoardColumn('PENDING', rows))).toEqual([1, 2, 3]);
  });

  it('orders PREPARING by when cooking started, not when placed', () => {
    // #9 was placed last but started first — it is further along, so it leads.
    const rows = [
      order({ orderNumber: 4, placedAt: at(0), preparingAt: at(40) }),
      order({ orderNumber: 9, placedAt: at(30), preparingAt: at(31) }),
      order({ orderNumber: 6, placedAt: at(10), preparingAt: at(35) }),
    ];
    expect(numbers(sortBoardColumn('PREPARING', rows))).toEqual([9, 6, 4]);
  });

  it('puts the most recently completed at the top of COMPLETED', () => {
    const rows = [
      order({ orderNumber: 1, completedAt: at(10) }),
      order({ orderNumber: 2, completedAt: at(50) }),
      order({ orderNumber: 3, completedAt: at(30) }),
    ];
    expect(numbers(sortBoardColumn('COMPLETED', rows))).toEqual([2, 3, 1]);
  });

  it('sorts a missing timestamp last, like SQL NULLS LAST', () => {
    const rows = [
      order({ orderNumber: 1, preparingAt: null }),
      order({ orderNumber: 2, preparingAt: at(20) }),
    ];
    expect(numbers(sortBoardColumn('PREPARING', rows))).toEqual([2, 1]);
  });

  it('breaks ties on order number so the result is never arbitrary', () => {
    const rows = [
      order({ orderNumber: 7, preparingAt: at(20) }),
      order({ orderNumber: 2, preparingAt: at(20) }),
    ];
    expect(numbers(sortBoardColumn('PREPARING', rows))).toEqual([2, 7]);
  });

  it('does not mutate the array it is given', () => {
    const rows = [
      order({ orderNumber: 2, placedAt: at(20) }),
      order({ orderNumber: 1, placedAt: at(10) }),
    ];
    sortBoardColumn('PENDING', rows);
    expect(numbers(rows)).toEqual([2, 1]);
  });
});

describe('withMoveStamps', () => {
  it('stamps completedAt when completing', () => {
    const moved = withMoveStamps(order({ orderNumber: 1, preparingAt: at(5) }), 'COMPLETED', () =>
      at(9),
    );
    expect(moved.status).toBe('COMPLETED');
    expect(moved.completedAt).toBe(at(9));
    expect(moved.preparingAt).toBe(at(5));
  });

  /**
   * The point of the whole feature: undoing a complete must not re-stamp
   * preparingAt, or the card returns to the back of the queue instead of the
   * place it left.
   */
  it('keeps the original preparingAt when moving back, and clears completedAt', () => {
    const completed = order({
      orderNumber: 1,
      status: 'COMPLETED',
      preparingAt: at(5),
      completedAt: at(40),
    });
    const moved = withMoveStamps(completed, 'PREPARING', () => at(99));
    expect(moved.status).toBe('PREPARING');
    expect(moved.preparingAt).toBe(at(5));
    expect(moved.completedAt).toBeNull();
  });

  it('restores a card to its exact former index in the queue', () => {
    const queue = [
      order({ orderNumber: 27, preparingAt: at(10) }),
      order({ orderNumber: 17, preparingAt: at(20) }),
      order({ orderNumber: 21, preparingAt: at(30) }),
    ];
    const [victim] = queue.filter((o) => o.orderNumber === 17);
    const remaining = queue.filter((o) => o.orderNumber !== 17);

    const completed = withMoveStamps(victim, 'COMPLETED', () => at(45));
    const back = withMoveStamps(completed, 'PREPARING', () => at(99));

    expect(numbers(sortBoardColumn('PREPARING', [...remaining, back]))).toEqual([27, 17, 21]);
  });

  it('stamps preparingAt only when the order never had one', () => {
    const odd = order({
      orderNumber: 1,
      status: 'COMPLETED',
      preparingAt: null,
      completedAt: at(40),
    });
    expect(withMoveStamps(odd, 'PREPARING', () => at(99)).preparingAt).toBe(at(99));
  });
});
