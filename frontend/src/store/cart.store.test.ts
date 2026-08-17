import { beforeEach, describe, expect, it } from 'vitest';
import { useCartStore } from './cart.store';

const SESSION_A = 'session-a';
const SESSION_B = 'session-b';

const biryani = { id: 'item-1', name: 'Chicken Biryani', price: '250.00' };
const coke = { id: 'item-2', name: 'Coke', price: '60.00' };

describe('cart.store', () => {
  beforeEach(() => {
    useCartStore.setState({ carts: {} });
  });

  it('adds an item at quantity 1 and increments on the second tap', () => {
    const { add } = useCartStore.getState();
    add(SESSION_A, biryani);
    add(SESSION_A, biryani);

    const lines = useCartStore.getState().lines(SESSION_A);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(2);
  });

  it('removes a line when the quantity reaches zero', () => {
    const { add, setQty } = useCartStore.getState();
    add(SESSION_A, biryani);
    add(SESSION_A, coke);
    setQty(SESSION_A, biryani.id, 0);

    const lines = useCartStore.getState().lines(SESSION_A);
    expect(lines.map((l) => l.menuItemId)).toEqual([coke.id]);
  });

  it('keeps carts isolated per session', () => {
    const { add } = useCartStore.getState();
    add(SESSION_A, biryani);
    add(SESSION_B, coke);

    expect(useCartStore.getState().totalCount(SESSION_A)).toBe(1);
    expect(useCartStore.getState().totalCount(SESSION_B)).toBe(1);
    expect(useCartStore.getState().lines(SESSION_A)[0].name).toBe('Chicken Biryani');
  });

  it('totals in integer paise', () => {
    const { add, setQty } = useCartStore.getState();
    add(SESSION_A, biryani);
    setQty(SESSION_A, biryani.id, 2);
    add(SESSION_A, coke);
    setQty(SESSION_A, coke.id, 2);

    expect(useCartStore.getState().totalPaise(SESSION_A)).toBe(62_000);
    expect(useCartStore.getState().totalCount(SESSION_A)).toBe(4);
  });

  it('clears one session without touching the other', () => {
    const { add, clear } = useCartStore.getState();
    add(SESSION_A, biryani);
    add(SESSION_B, coke);
    clear(SESSION_A);

    expect(useCartStore.getState().lines(SESSION_A)).toEqual([]);
    expect(useCartStore.getState().lines(SESSION_B)).toHaveLength(1);
  });

  it('stores a display snapshot only — never a computed total', () => {
    useCartStore.getState().add(SESSION_A, biryani);
    const line = useCartStore.getState().lines(SESSION_A)[0];

    expect(line).toEqual({
      menuItemId: 'item-1',
      name: 'Chicken Biryani',
      unitPrice: '250.00',
      quantity: 1,
    });
    expect(line).not.toHaveProperty('lineTotal');
  });
});
