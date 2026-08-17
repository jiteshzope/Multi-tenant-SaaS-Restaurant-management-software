/**
 * One typed async function per API call. No React in this layer — which is what
 * makes it trivial to unit-test.
 *
 * `restaurantId` is never sent by the client. The server reads it from the JWT;
 * a request that carries one is a bug (database/CLAUDE.md §2).
 */
import { api } from './client';
import { ep } from './endpoints';
import type {
  AssignmentHistoryRow,
  AuthSuccess,
  Bill,
  CategorySummary,
  DailyRow,
  DateRange,
  HourlyRow,
  KitchenBoard,
  KitchenCounts,
  Me,
  MenuCategory,
  MenuItem,
  MenuSearchResult,
  Order,
  PrepTime,
  ReportSummary,
  Restaurant,
  SessionDetail,
  SessionHistoryRow,
  StaffMember,
  TableCard,
  TableSession,
  TopItemRow,
  WaiterOption,
  WaiterRow,
} from '@/types/domain';

/* --- auth ---------------------------------------------------------------- */

export const authApi = {
  login: (body: { email: string; password: string }) => api.post<AuthSuccess>(ep.auth.login, body),

  register: (body: {
    restaurantName: string;
    slug: string;
    phone?: string;
    ownerName: string;
    ownerEmail: string;
    ownerPassword: string;
  }) => api.post<AuthSuccess>(ep.auth.register, body),

  logout: (refreshToken?: string) =>
    api.post<{ revoked: number }>(ep.auth.logout, refreshToken ? { refreshToken } : {}),

  me: () => api.get<Me>(ep.auth.me),

  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api.patch<{ changed: boolean }>(ep.auth.password, body),
};

/* --- restaurant ---------------------------------------------------------- */

export const restaurantApi = {
  get: () => api.get<Restaurant>(ep.restaurant),
  update: (
    body: Partial<Pick<Restaurant, 'name' | 'phone' | 'address' | 'timezone'>> & {
      taxPercent?: string;
    },
  ) => api.patch<Restaurant>(ep.restaurant, body),
};

/* --- staff --------------------------------------------------------------- */

export const staffApi = {
  list: () => api.get<StaffMember[]>(ep.staff.root),
  waiters: () => api.get<WaiterOption[]>(ep.staff.waiters),
  create: (body: {
    name: string;
    email: string;
    phone?: string;
    password: string;
    role: 'WAITER' | 'KITCHEN';
  }) => api.post<StaffMember>(ep.staff.root, body),
  update: (userId: string, body: { name?: string; phone?: string }) =>
    api.patch<{ id: string }>(ep.staff.one(userId), body),
  resetPassword: (userId: string, password: string) =>
    api.patch<{ changed: boolean }>(ep.staff.password(userId), { password }),
  setStatus: (userId: string, isActive: boolean) =>
    api.patch<{ id: string; isActive: boolean }>(ep.staff.status(userId), { isActive }),
};

/* --- tables -------------------------------------------------------------- */

export const tablesApi = {
  grid: () => api.get<TableCard[]>(ep.tables.root),
  mine: () => api.get<TableCard[]>(ep.tables.my),
  one: (id: string) => api.get<TableCard>(ep.tables.one(id)),
  create: (body: { tableNumber: number; label?: string; capacity?: number }) =>
    api.post<TableCard>(ep.tables.root, body),
  bulk: (body: { from: number; to: number; capacity?: number }) =>
    api.post<{ created: number; skipped: number }>(ep.tables.bulk, body),
  update: (id: string, body: { tableNumber?: number; label?: string; capacity?: number }) =>
    api.patch<TableCard>(ep.tables.one(id), body),
  remove: (id: string) => api.delete<{ id: string }>(ep.tables.one(id)),
  assign: (id: string, waiterUserId: string) =>
    api.put<{ id: string; waiterName: string }>(ep.tables.assignment(id), { waiterUserId }),
  unassign: (id: string) => api.delete<{ tableId: string }>(ep.tables.assignment(id)),
  assignmentHistory: (id: string) =>
    api.get<AssignmentHistoryRow[]>(ep.tables.assignmentHistory(id)),
};

/* --- menu ---------------------------------------------------------------- */

export const menuApi = {
  full: () => api.get<MenuCategory[]>(ep.menu.root),
  categories: () => api.get<CategorySummary[]>(ep.menu.categories),
  items: (categoryId: string) => api.get<MenuItem[]>(ep.menu.categoryItems(categoryId)),
  search: (q: string) => api.get<MenuSearchResult[]>(ep.menu.search, { params: { q } }),
  createCategory: (body: { name: string; displayOrder?: number }) =>
    api.post<CategorySummary>(ep.menu.categories, body),
  updateCategory: (id: string, body: { name?: string; displayOrder?: number }) =>
    api.patch<CategorySummary>(ep.menu.category(id), body),
  deleteCategory: (id: string) => api.delete<{ id: string }>(ep.menu.category(id)),
  createItem: (body: {
    categoryId: string;
    name: string;
    description?: string;
    price: string;
    isVeg?: boolean | null;
  }) => api.post<MenuItem>(ep.menu.items, body),
  updateItem: (
    id: string,
    body: {
      name?: string;
      description?: string;
      price?: string;
      isVeg?: boolean | null;
      isAvailable?: boolean;
    },
  ) => api.patch<MenuItem>(ep.menu.item(id), body),
  setAvailability: (id: string, isAvailable: boolean) =>
    api.patch<MenuItem>(ep.menu.availability(id), { isAvailable }),
  deleteItem: (id: string) => api.delete<{ id: string }>(ep.menu.item(id)),
};

/* --- sessions ------------------------------------------------------------ */

export const sessionsApi = {
  open: (body: {
    tableId: string;
    guestCount?: number;
    customerName?: string;
    customerPhone?: string;
  }) => api.post<TableSession>(ep.sessions.root, body),
  detail: (id: string) => api.get<SessionDetail>(ep.sessions.one(id)),
  bill: (id: string) => api.get<Bill>(ep.sessions.bill(id)),
  close: (id: string) => api.post<{ id: string; status: string }>(ep.sessions.close(id)),
  history: (tableId: string) => api.get<SessionHistoryRow[]>(ep.sessions.tableHistory(tableId)),
};

/* --- orders -------------------------------------------------------------- */

export type PlaceOrderInput = {
  sessionId: string;
  items: { menuItemId: string; quantity: number; note?: string }[];
  note?: string;
};

export const ordersApi = {
  /** The payload carries no price field — sending one is a bug. */
  place: (body: PlaceOrderInput) => api.post<Order>(ep.orders.root, body),
  detail: (id: string) => api.get<Order>(ep.orders.one(id)),
  setStatus: (id: string, status: 'PREPARING' | 'COMPLETED') =>
    api.patch<Order>(ep.orders.status(id), { status }),
  cancel: (id: string) => api.post<Order>(ep.orders.cancel(id)),
};

/* --- kitchen ------------------------------------------------------------- */

export const kitchenApi = {
  board: () => api.get<KitchenBoard>(ep.kitchen.board),
  counts: () => api.get<KitchenCounts>(ep.kitchen.counts),
  start: (id: string) => api.patch<Order>(ep.kitchen.start(id)),
  complete: (id: string) => api.patch<Order>(ep.kitchen.complete(id)),
  reopen: (id: string) => api.patch<Order>(ep.kitchen.reopen(id)),
};

/* --- reports ------------------------------------------------------------- */

export const reportsApi = {
  summary: () => api.get<ReportSummary>(ep.reports.summary),
  daily: (range: DateRange) => api.get<DailyRow[]>(ep.reports.daily, { params: range }),
  topItems: (range: DateRange) => api.get<TopItemRow[]>(ep.reports.topItems, { params: range }),
  waiters: (range: DateRange) => api.get<WaiterRow[]>(ep.reports.waiters, { params: range }),
  prepTime: (range: DateRange) => api.get<PrepTime>(ep.reports.prepTime, { params: range }),
  hourly: (range: DateRange) => api.get<HourlyRow[]>(ep.reports.hourly, { params: range }),
};
