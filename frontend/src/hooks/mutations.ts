import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  kitchenApi,
  menuApi,
  ordersApi,
  restaurantApi,
  sessionsApi,
  staffApi,
  tablesApi,
  type PlaceOrderInput,
} from '@/api/resources';
import { sortBoardColumn, withMoveStamps, type BoardColumn } from '@/lib/board';
import { qk } from '@/lib/constants';
import { ApiError } from '@/types/api';
import type { KitchenBoard, Order } from '@/types/domain';

function useInvalidate() {
  const qc = useQueryClient();
  return (keys: readonly (readonly unknown[])[]) => {
    for (const key of keys) void qc.invalidateQueries({ queryKey: key });
  };
}

/* --- staff --------------------------------------------------------------- */

export function useCreateStaff() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: staffApi.create,
    onSuccess: () => invalidate([qk.staff, qk.waiters]),
  });
}

export function useResetStaffPassword() {
  return useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      staffApi.resetPassword(userId, password),
  });
}

export function useSetStaffStatus() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      staffApi.setStatus(userId, isActive),
    onSuccess: () => invalidate([qk.staff, qk.waiters, qk.tables]),
  });
}

/* --- tables & assignments ------------------------------------------------ */

export function useCreateTable() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: tablesApi.create,
    onSuccess: () => invalidate([qk.tables, qk.myTables]),
  });
}

export function useBulkCreateTables() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: tablesApi.bulk,
    onSuccess: () => invalidate([qk.tables, qk.myTables]),
  });
}

export function useUpdateTable() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      tableNumber?: number;
      label?: string;
      capacity?: number;
    }) => tablesApi.update(id, body),
    onSuccess: () => invalidate([qk.tables, qk.myTables]),
  });
}

export function useDeleteTable() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: tablesApi.remove,
    onSuccess: () => invalidate([qk.tables, qk.myTables]),
  });
}

export function useAssignWaiter() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ tableId, waiterUserId }: { tableId: string; waiterUserId: string }) =>
      tablesApi.assign(tableId, waiterUserId),
    onSuccess: () => invalidate([qk.tables, qk.myTables]),
  });
}

export function useUnassignWaiter() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: tablesApi.unassign,
    onSuccess: () => invalidate([qk.tables, qk.myTables]),
  });
}

/* --- menu ---------------------------------------------------------------- */

export function useCreateCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: menuApi.createCategory,
    onSuccess: () => invalidate([qk.menu, qk.categories]),
  });
}

export function useUpdateCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; displayOrder?: number }) =>
      menuApi.updateCategory(id, body),
    onSuccess: () => invalidate([qk.menu, qk.categories]),
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: menuApi.deleteCategory,
    onSuccess: () => invalidate([qk.menu, qk.categories]),
  });
}

export function useCreateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: menuApi.createItem,
    onSuccess: (item) => {
      void qc.invalidateQueries({ queryKey: qk.menu });
      void qc.invalidateQueries({ queryKey: qk.categories });
      void qc.invalidateQueries({ queryKey: qk.items(item.categoryId) });
    },
  });
}

export function useUpdateMenuItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      description?: string;
      price?: string;
      isVeg?: boolean | null;
      isAvailable?: boolean;
    }) => menuApi.updateItem(id, body),
    onSuccess: () => invalidate([qk.menu, qk.categories, ['menu', 'categories']]),
  });
}

export function useSetItemAvailability() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      menuApi.setAvailability(id, isAvailable),
    onSuccess: () => invalidate([qk.menu, ['menu', 'categories']]),
  });
}

export function useDeleteMenuItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: menuApi.deleteItem,
    onSuccess: () => invalidate([qk.menu, qk.categories, ['menu', 'categories']]),
  });
}

/* --- sessions ------------------------------------------------------------ */

export function useOpenSession() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: sessionsApi.open,
    onSuccess: () => invalidate([qk.tables, qk.myTables]),
  });
}

export function useCloseSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sessionsApi.close,
    onSuccess: (_res, sessionId) => {
      void qc.invalidateQueries({ queryKey: qk.tables });
      void qc.invalidateQueries({ queryKey: qk.myTables });
      void qc.invalidateQueries({ queryKey: qk.session(sessionId) });
      void qc.invalidateQueries({ queryKey: qk.bill(sessionId) });
    },
  });
}

/* --- orders -------------------------------------------------------------- */

export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlaceOrderInput) => ordersApi.place(input),
    onSuccess: (_order, input) => {
      void qc.invalidateQueries({ queryKey: qk.board });
      void qc.invalidateQueries({ queryKey: qk.counts });
      void qc.invalidateQueries({ queryKey: qk.session(input.sessionId) });
      void qc.invalidateQueries({ queryKey: qk.tables });
      void qc.invalidateQueries({ queryKey: qk.myTables });
    },
  });
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ordersApi.cancel,
    onSuccess: (order) => {
      void qc.invalidateQueries({ queryKey: qk.board });
      void qc.invalidateQueries({ queryKey: qk.counts });
      void qc.invalidateQueries({ queryKey: qk.session(order.tableSessionId) });
    },
  });
}

/* --- kitchen: the one place with optimistic updates ---------------------- */

export type BoardMove = {
  id: string;
  from: BoardColumn;
  to: BoardColumn;
};

/**
 * Move the card between columns immediately, then roll back if the server says
 * someone else already moved it (409 ORDER_ALREADY_MOVED — the guarded
 * `WHERE status = …` update rejected the loser).
 *
 * `from` is passed explicitly rather than inferred from `to`, because
 * PREPARING is now reachable from both sides: forwards from PENDING, and
 * backwards from COMPLETED when a handler undoes a mistaken "Mark complete".
 */
export function useTransitionOrder() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, from, to }: BoardMove) => {
      if (to === 'COMPLETED') return kitchenApi.complete(id);
      return from === 'COMPLETED' ? kitchenApi.reopen(id) : kitchenApi.start(id);
    },

    onMutate: async ({ id, from, to }) => {
      await qc.cancelQueries({ queryKey: qk.board });
      const snapshot = qc.getQueryData<KitchenBoard>(qk.board);
      if (!snapshot) return { snapshot };

      const card = snapshot[from].find((o) => o.id === id);
      if (!card) return { snapshot };

      // Stamp and re-sort exactly as the server will, so the card does not jump
      // when the refetch lands.
      qc.setQueryData<KitchenBoard>(qk.board, {
        ...snapshot,
        [from]: snapshot[from].filter((o) => o.id !== id),
        [to]: sortBoardColumn(to, [...snapshot[to], withMoveStamps(card, to)]),
      });

      return { snapshot };
    },

    onError: (error, _vars, context) => {
      if (context?.snapshot) qc.setQueryData(qk.board, context.snapshot);
      if (ApiError.isApiError(error)) {
        if (error.code === 'ORDER_ALREADY_MOVED') {
          toast.warning('Someone already moved this order');
          return;
        }
        if (error.code === 'SESSION_NOT_OPEN') {
          toast.error('That table has already been closed', {
            description: 'The bill is final, so this order cannot go back to the kitchen.',
          });
        }
      }
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.board });
      void qc.invalidateQueries({ queryKey: qk.counts });
    },
  });
}

/* --- settings ------------------------------------------------------------ */

export function useUpdateRestaurant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: restaurantApi.update,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.restaurant });
      void qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export type { Order };
