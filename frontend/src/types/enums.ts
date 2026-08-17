/** Mirrors the PostgreSQL ENUM types exactly — database/CLAUDE.md § "Enum types". */

export const UserRole = { OWNER: 'OWNER', WAITER: 'WAITER', KITCHEN: 'KITCHEN' } as const;
export const OrderStatus = {
  PENDING: 'PENDING',
  PREPARING: 'PREPARING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export const TableStatus = { VACANT: 'VACANT', OCCUPIED: 'OCCUPIED' } as const;
export const SessionStatus = { OPEN: 'OPEN', CLOSED: 'CLOSED' } as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];
export type TableStatus = (typeof TableStatus)[keyof typeof TableStatus];
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];
