# Step 08 — Table sessions

**Depends on:** [07 — Tables & assignments](../07-tables-and-assignments/CLAUDE.md)
(a session opens against a specific table and is subject to the same
`TableAccessGuard`).

## What shipped

`SessionsModule` — the layer between "a table exists" and "an order can be
placed":

- `POST /sessions` — **idempotent** open. Calling it twice on the same
  vacant table doesn't create two sessions; it relies on the partial unique
  index (`uq_one_open_session_per_table` from migration `0005`) and catches
  the resulting `P2002` to return the session that already exists rather
  than erroring.
- `GET /sessions/:id`, `GET /sessions/:id/bill` (subtotal, tax at the
  restaurant's `taxPercent`, grand total — computed in SQL with `ROUND`, not
  in application code).
- `POST /sessions/:id/close` — locks the session row, checks for any order
  still `PENDING`/`PREPARING`, and refuses with `409 ORDERS_IN_PROGRESS` if
  one exists. The kitchen must finish or the waiter must cancel before a
  table can be billed shut.
- `GET /sessions/table/:tableId/history` — past visits to a table.
- The `sync_table_status` trigger (already written in step 03) is what
  actually flips `restaurant_tables.status` between `VACANT`/`OCCUPIED` —
  this module only ever writes to `table_sessions`, never to the table's
  status column directly, so the two can't drift apart.

## Key decisions

| Decision | Reason |
|---|---|
| Open is idempotent rather than erroring on a duplicate | A waiter double-tapping "Take order" on a flaky connection is a real, frequent case — it should be a no-op, not a support ticket |
| Close is refused, not forced, while orders are unfinished | Billing a table with a `PENDING` order still in the kitchen loses that order's revenue silently |
| Table status is a trigger-derived fact, never written directly by the service | Prevents the exact class of bug where a table's badge disagrees with whether it actually has an open session |
| Bill totals computed in SQL | The number that appears on a printed receipt should have exactly one place it's computed, not one in Postgres and a second, potentially drifting, one in TypeScript |

## Verified

Two concurrent `POST /sessions` calls on the same table returned the
**same** session id — proved with a scripted concurrent request pair, not
just reasoned about. `sync_table_status` was observed flipping the table to
`OCCUPIED` on open and back to `VACANT` on close with no direct write to
`restaurant_tables.status` anywhere in the service. Attempting to close a
session with a `PENDING` order present returned `409 ORDERS_IN_PROGRESS`.
The bill for a mixed cart totalled subtotal `820.00`, 5% tax `41.00`, grand
total `861.00`.

## Source of truth

[`backend/CLAUDE.md`](../../../backend/CLAUDE.md) → *API endpoints*
(`/api/sessions`), *Services & critical transactions* (`SessionService.open`
/ `.close`), and *Build order* item 7; [`database/CLAUDE.md`](../../../database/CLAUDE.md)
→ *Sessions and orders* section and the *Bill & closing a table* example
queries.
