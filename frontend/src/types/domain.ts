import type { OrderStatus, SessionStatus, TableStatus, UserRole } from './enums';

/** Money and timestamps cross the wire as strings, never numbers. */
export type Money = string; // "250.00" — Prisma.Decimal, serialized by the backend
export type Iso = string; // "2026-08-16T14:03:11.123Z" — timestamptz

export type Restaurant = {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
  currency: string;
  timezone: string;
  taxPercent: Money;
  isActive?: boolean;
  createdAt?: Iso;
};

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  lastLoginAt: Iso | null;
};

export type Me = { user: User; restaurant: Restaurant; role: UserRole };

export type AuthSuccess = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Iso;
  user: Me;
};

export type StaffMember = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Iso | null;
  createdAt: Iso;
};

export type WaiterOption = { id: string; name: string; email: string };

export type TableCard = {
  id: string;
  tableNumber: number;
  label: string | null;
  capacity: number;
  status: TableStatus;
  waiterId: string | null;
  waiterName: string | null;
  sessionId: string | null;
  openedAt: Iso | null;
  runningTotal: Money;
  orderCount: number;
};

export type MenuItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: Money;
  isVeg: boolean | null;
  isAvailable: boolean;
  displayOrder: number;
};

export type MenuCategory = {
  id: string;
  name: string;
  displayOrder: number;
  items: MenuItem[];
};

export type CategorySummary = {
  id: string;
  name: string;
  displayOrder: number;
  itemCount: number;
};

export type MenuSearchResult = MenuItem & { categoryName: string };

export type TableSession = {
  id: string;
  restaurantId: string;
  tableId: string;
  status: SessionStatus;
  guestCount: number | null;
  customerName: string | null;
  customerPhone: string | null;
  openedAt: Iso;
  created?: boolean;
};

export type OrderLine = {
  id: string;
  menuItemId: string | null;
  itemName: string;
  unitPrice: Money;
  quantity: number;
  lineTotal: Money;
  note: string | null;
};

export type Order = {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  note: string | null;
  tableId: string;
  tableSessionId: string;
  tableNumber: number;
  tableLabel: string | null;
  placedAt: Iso;
  preparingAt: Iso | null;
  completedAt: Iso | null;
  cancelledAt: Iso | null;
  placedById: string;
  placedBy: string;
  items: OrderLine[];
  orderTotal: Money;
};

export type SessionDetail = {
  id: string;
  tableId: string;
  tableNumber: number;
  tableLabel: string | null;
  status: SessionStatus;
  guestCount: number | null;
  customerName: string | null;
  customerPhone: string | null;
  openedAt: Iso;
  closedAt: Iso | null;
  openedBy: { id: string; name: string };
  closedBy: { id: string; name: string } | null;
  table: { tableNumber: number; label: string | null; capacity: number };
  orders: (Omit<Order, 'tableNumber' | 'tableLabel' | 'tableId' | 'tableSessionId'> & {
    orderTotal: Money;
  })[];
  runningTotal: Money;
  unfinishedOrders: number;
};

export type BillLine = {
  itemName: string;
  unitPrice: Money;
  quantity: number;
  amount: Money;
};

export type Bill = {
  sessionId: string;
  status: SessionStatus;
  restaurant: Pick<Restaurant, 'name' | 'address' | 'phone' | 'currency' | 'taxPercent'>;
  tableNumber: number;
  tableLabel: string | null;
  guestCount: number | null;
  customerName: string | null;
  servedBy: string;
  openedAt: Iso;
  closedAt: Iso | null;
  lines: BillLine[];
  subtotal: Money;
  taxPercent: Money;
  taxAmount: Money;
  grandTotal: Money;
  currency: string;
};

export type SessionHistoryRow = {
  id: string;
  openedAt: Iso;
  closedAt: Iso | null;
  servedBy: string;
  total: Money;
};

export type AssignmentHistoryRow = {
  id: string;
  waiterId: string;
  waiterName: string;
  assignedAt: Iso;
  unassignedAt: Iso | null;
};

/** Exactly query 29 — items pre-aggregated per order, one card per row. */
export type KitchenOrder = {
  id: string;
  orderNumber: number;
  status: Extract<OrderStatus, 'PENDING' | 'PREPARING' | 'COMPLETED'>;
  note: string | null;
  placedAt: Iso;
  preparingAt: Iso | null;
  completedAt: Iso | null;
  tableNumber: number;
  placedBy: string;
  ageSeconds: number;
  items: { name: string; quantity: number; note: string | null }[];
};

export type KitchenBoard = Record<'PENDING' | 'PREPARING' | 'COMPLETED', KitchenOrder[]>;
export type KitchenCounts = Record<OrderStatus, number>;

export type ReportSummary = {
  sessionsServed: number;
  ordersPlaced: number;
  revenue: Money;
  avgBill: Money | null;
  openTables: number;
  activeTables: number;
};

export type DailyRow = { day: Iso; orders: number; revenue: Money };
export type TopItemRow = { itemName: string; unitsSold: number; revenue: Money };
export type WaiterRow = {
  waiterId: string;
  waiter: string;
  ordersTaken: number;
  tablesServed: number;
  revenue: Money;
};
export type PrepTime = {
  avgMinutes: string | null;
  worstMinutes: string | null;
  ordersMeasured: number;
};
export type HourlyRow = { hourOfDay: number; orders: number };

export type DateRange = { from?: string; to?: string };
