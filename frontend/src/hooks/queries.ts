import { useQuery } from '@tanstack/react-query';
import {
  kitchenApi,
  menuApi,
  reportsApi,
  restaurantApi,
  sessionsApi,
  staffApi,
  tablesApi,
} from '@/api/resources';
import { BOARD_POLL_MS, qk } from '@/lib/constants';
import type { DateRange } from '@/types/domain';

export const useRestaurant = () =>
  useQuery({ queryKey: qk.restaurant, queryFn: restaurantApi.get });

export const useStaff = () => useQuery({ queryKey: qk.staff, queryFn: staffApi.list });
export const useWaiters = () => useQuery({ queryKey: qk.waiters, queryFn: staffApi.waiters });

export const useTables = () => useQuery({ queryKey: qk.tables, queryFn: tablesApi.grid });
export const useMyTables = () => useQuery({ queryKey: qk.myTables, queryFn: tablesApi.mine });
export const useTable = (id: string | undefined) =>
  useQuery({ queryKey: qk.table(id ?? ''), queryFn: () => tablesApi.one(id!), enabled: !!id });

export const useAssignmentHistory = (tableId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: qk.assignmentHistory(tableId ?? ''),
    queryFn: () => tablesApi.assignmentHistory(tableId!),
    enabled: !!tableId && enabled,
  });

export const useMenu = () => useQuery({ queryKey: qk.menu, queryFn: menuApi.full });
export const useCategories = () =>
  useQuery({ queryKey: qk.categories, queryFn: menuApi.categories });
export const useCategoryItems = (categoryId: string | undefined) =>
  useQuery({
    queryKey: qk.items(categoryId ?? ''),
    queryFn: () => menuApi.items(categoryId!),
    enabled: !!categoryId,
  });

export const useMenuSearch = (q: string) =>
  useQuery({
    queryKey: qk.menuSearch(q),
    queryFn: () => menuApi.search(q),
    enabled: q.trim().length > 0,
  });

export const useSession = (id: string | undefined) =>
  useQuery({
    queryKey: qk.session(id ?? ''),
    queryFn: () => sessionsApi.detail(id!),
    enabled: !!id,
  });

export const useBill = (id: string | undefined, enabled = true) =>
  useQuery({
    queryKey: qk.bill(id ?? ''),
    queryFn: () => sessionsApi.bill(id!),
    enabled: !!id && enabled,
  });

export const useSessionHistory = (tableId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: qk.sessionHistory(tableId ?? ''),
    queryFn: () => sessionsApi.history(tableId!),
    enabled: !!tableId && enabled,
  });

/**
 * The 15 s poll is disabled while the socket is connected. The socket is the
 * optimization; polling is the guarantee.
 */
export const useKitchenBoard = (socketConnected: boolean) =>
  useQuery({
    queryKey: qk.board,
    queryFn: kitchenApi.board,
    refetchInterval: socketConnected ? false : BOARD_POLL_MS,
    staleTime: 5_000,
  });

export const useKitchenCounts = (socketConnected: boolean) =>
  useQuery({
    queryKey: qk.counts,
    queryFn: kitchenApi.counts,
    refetchInterval: socketConnected ? false : BOARD_POLL_MS,
    staleTime: 5_000,
  });

/* --- reports: the range is part of the key ------------------------------- */

export const useSummary = () =>
  useQuery({ queryKey: qk.report('summary', {}), queryFn: reportsApi.summary });

export const useDaily = (range: DateRange) =>
  useQuery({ queryKey: qk.report('daily', range), queryFn: () => reportsApi.daily(range) });

export const useTopItems = (range: DateRange) =>
  useQuery({ queryKey: qk.report('top-items', range), queryFn: () => reportsApi.topItems(range) });

export const useWaiterPerformance = (range: DateRange) =>
  useQuery({ queryKey: qk.report('waiters', range), queryFn: () => reportsApi.waiters(range) });

export const usePrepTime = (range: DateRange) =>
  useQuery({ queryKey: qk.report('prep-time', range), queryFn: () => reportsApi.prepTime(range) });

export const useHourly = (range: DateRange) =>
  useQuery({ queryKey: qk.report('hourly', range), queryFn: () => reportsApi.hourly(range) });
