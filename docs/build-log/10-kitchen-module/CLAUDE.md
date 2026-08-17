# Step 10 — Kitchen module

**Depends on:** [09 — Orders module](../09-orders-module/CLAUDE.md) (the
board is a read over `orders`; transitions reuse the same guarded-update
pattern).

## What shipped

`KitchenModule` — `GET /kitchen/board`, `GET /kitchen/counts`, `PATCH
/kitchen/orders/:id/start`, `PATCH /kitchen/orders/:id/complete`, `PATCH
/kitchen/orders/:id/reopen` — all `OWNER` + `KITCHEN`.

- **The board query returns three pre-sorted columns, each on its own
  timestamp** — not one global sort: `PENDING` by `placed_at` ascending
  (longest wait on top), `PREPARING` by `preparing_at` ascending (the actual
  cooking queue order), `COMPLETED` by `completed_at` descending (what just
  came off the pass). Sorting everything by `placed_at` would put a
  just-completed order that was placed early at the top of the completed
  list instead of the bottom.
- Items are pre-aggregated per order in the query, so the API returns one
  object per order with its full item list — the shape a single bordered
  card on the frontend (step 22) needs directly, with no client-side
  grouping.
- `reopen` — `COMPLETED → PREPARING`, for a handler who tapped "Mark
  complete" by mistake. It **preserves the original `preparing_at`**, so the
  card returns to the position in the queue it left rather than jumping to
  the back — the fix specifically avoids the naive "just stamp `preparing_at
  = now()`" implementation. It refuses with `409 SESSION_NOT_OPEN` once the
  table has already been billed (checked explicitly, since `assert_session_open`
  only fires on `INSERT`), and a `WAITER` calling it gets `403
  FORBIDDEN_ROLE`.

## Key decisions

| Decision | Reason |
|---|---|
| Per-column sort keyed to that column's own timestamp | Any single global sort column is wrong for at least one of the three states — this was decided deliberately, not left as an accident of "just sort by `placed_at`" |
| `reopen` preserves `preparing_at` instead of resetting it | An undo should put things back exactly where they were, not send the order to the back of a queue it never actually left |
| The board endpoint pre-aggregates items server-side | The frontend's "one card per order" requirement should not require N+1 client-side lookups or a second request per order |
| `reopen` explicitly checks session state | The database trigger that would normally catch this only guards inserts, so the gap has to be closed in the service |

## Verified

A scripted PREPARING queue of `#27 #17 #21` proved the board is genuinely
sorting by `preparing_at`, not by order number (a numeric sort would have
produced `#17 #21 #27`). `reopen` on a `COMPLETED` order returned `200`,
cleared `completedAt`, left `preparingAt` byte-identical to its value before
completion, and the card landed back at the same index in the PREPARING
column it had left. `reopen` on an order already `PREPARING` returned `409`;
called by a `WAITER`, `403 FORBIDDEN_ROLE`.

## Source of truth

[`backend/CLAUDE.md`](../../../backend/CLAUDE.md) → *API endpoints*
(`/api/kitchen`, including the board-ordering explanation) and *Build order*
item 9; [`database/CLAUDE.md`](../../../database/CLAUDE.md) → *Kitchen
dashboard* example query.
