import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { sumPaise } from '@/lib/money';
import type { MenuItem, Money } from '@/types/domain';

/**
 * The in-progress order, keyed by sessionId so it survives a refresh and two
 * tables never share a cart.
 *
 * A line holds a *display-only* snapshot of name and price. The authoritative
 * price is resolved server-side at order time — this is not a second source of
 * truth, it is what the waiter is looking at.
 */
export type CartLine = {
  menuItemId: string;
  name: string;
  unitPrice: Money;
  quantity: number;
  note?: string;
};

interface CartState {
  carts: Record<string, CartLine[]>;
  add: (sessionId: string, item: Pick<MenuItem, 'id' | 'name' | 'price'>) => void;
  setQty: (sessionId: string, menuItemId: string, qty: number) => void;
  setNote: (sessionId: string, menuItemId: string, note: string) => void;
  clear: (sessionId: string) => void;
  clearAll: () => void;
  lines: (sessionId: string) => CartLine[];
  totalCount: (sessionId: string) => number;
  totalPaise: (sessionId: string) => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      carts: {},

      add: (sessionId, item) =>
        set((state) => {
          const lines = state.carts[sessionId] ?? [];
          const existing = lines.find((l) => l.menuItemId === item.id);
          const next = existing
            ? lines.map((l) => (l.menuItemId === item.id ? { ...l, quantity: l.quantity + 1 } : l))
            : [
                ...lines,
                { menuItemId: item.id, name: item.name, unitPrice: item.price, quantity: 1 },
              ];
          return { carts: { ...state.carts, [sessionId]: next } };
        }),

      setQty: (sessionId, menuItemId, qty) =>
        set((state) => {
          const lines = state.carts[sessionId] ?? [];
          const next =
            qty <= 0
              ? lines.filter((l) => l.menuItemId !== menuItemId)
              : lines.map((l) => (l.menuItemId === menuItemId ? { ...l, quantity: qty } : l));
          return { carts: { ...state.carts, [sessionId]: next } };
        }),

      setNote: (sessionId, menuItemId, note) =>
        set((state) => {
          const lines = state.carts[sessionId] ?? [];
          return {
            carts: {
              ...state.carts,
              [sessionId]: lines.map((l) =>
                l.menuItemId === menuItemId ? { ...l, note: note || undefined } : l,
              ),
            },
          };
        }),

      clear: (sessionId) =>
        set((state) => {
          const { [sessionId]: _removed, ...rest } = state.carts;
          return { carts: rest };
        }),

      clearAll: () => set({ carts: {} }),

      lines: (sessionId) => get().carts[sessionId] ?? [],
      totalCount: (sessionId) => (get().carts[sessionId] ?? []).reduce((n, l) => n + l.quantity, 0),
      // Integer paise arithmetic — see lib/money.ts.
      totalPaise: (sessionId) => sumPaise(get().carts[sessionId] ?? []),
    }),
    {
      name: 'resto.cart',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ carts: s.carts }),
    },
  ),
);
