import type { DateRange } from '@/types/domain';
import type { UserRole } from '@/types/enums';

/** Post-login landing page, "logo → home", and 403 recovery all read this. */
export const ROLE_HOME: Record<UserRole, string> = {
  OWNER: '/owner',
  WAITER: '/waiter',
  KITCHEN: '/kitchen',
};

/**
 * The router branch each role owns. `RoleGate` guards exactly these prefixes,
 * so this is the same fact stated once for code that needs it before a route
 * has rendered.
 */
const ROLE_AREA: Record<UserRole, string> = ROLE_HOME;

/**
 * Where to send someone once they have signed in.
 *
 * `ProtectedRoute` parks the path you were trying to reach in `?next=`, so the
 * session that dropped on `/owner/kitchen` returns there. But the person who
 * signs in next is not necessarily the person who was bounced — on a shared
 * tablet the owner's session drops and a *waiter* signs in. Replaying `next`
 * blindly sent them to `/owner/kitchen`, which `RoleGate` immediately turned
 * into a 403 for a login that had just succeeded.
 *
 * So `next` is honoured only when it is a path this role may actually reach.
 * It is also query-string text, i.e. attacker-supplied: anything that is not a
 * plain same-origin absolute path is discarded rather than handed to the
 * router. `//host/x` is protocol-relative, not a route.
 */
export function postLoginPath(next: string | null | undefined, role: UserRole): string {
  const home = ROLE_HOME[role];
  if (!next) return home;

  let target: string;
  try {
    target = decodeURIComponent(next);
  } catch {
    return home; // malformed percent-encoding
  }

  if (!target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) {
    return home;
  }

  const area = ROLE_AREA[role];
  return target === area || target.startsWith(`${area}/`) ? target : home;
}

/** The socket is an optimization; this poll is the guarantee. */
export const BOARD_POLL_MS = 15_000;
export const SEARCH_DEBOUNCE_MS = 300;

/** Kitchen card age colouring. */
export const AGE_WARN_SECONDS = 5 * 60;
export const AGE_LATE_SECONDS = 10 * 60;

/**
 * Query key factory. No raw array literals in components — an invalidation can
 * never miss a key because of a typo.
 */
export const qk = {
  me: ['me'] as const,
  restaurant: ['restaurant'] as const,
  menu: ['menu'] as const,
  menuSearch: (q: string) => ['menu', 'search', q] as const,
  categories: ['menu', 'categories'] as const,
  items: (categoryId: string) => ['menu', 'categories', categoryId, 'items'] as const,
  staff: ['staff'] as const,
  waiters: ['staff', 'waiters'] as const,
  tables: ['tables'] as const,
  myTables: ['tables', 'my'] as const,
  table: (id: string) => ['tables', id] as const,
  assignmentHistory: (id: string) => ['tables', id, 'assignment', 'history'] as const,
  session: (id: string) => ['sessions', id] as const,
  bill: (id: string) => ['sessions', id, 'bill'] as const,
  sessionHistory: (tableId: string) => ['sessions', 'table', tableId] as const,
  order: (id: string) => ['orders', id] as const,
  board: ['kitchen', 'board'] as const,
  counts: ['kitchen', 'counts'] as const,
  report: (name: string, range: DateRange) => ['reports', name, range] as const,
} as const;

export const IANA_TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
] as const;
