# Step 09 — Orders module

**Depends on:** [06 — Menu module](../06-menu-module/CLAUDE.md) (prices are
resolved from `menu_items`) and [08 — Table sessions](../08-table-sessions/CLAUDE.md)
(an order is always placed against an open session). This is the module the
rest of the plan calls "the heart of the app."

## What shipped

`OrdersModule` — `POST /orders` (`OWNER`, `WAITER`), `GET /orders/:id`,
`PATCH /orders/:id/status` (`OWNER`, `KITCHEN`), `POST /orders/:id/cancel`
(`OWNER`, `WAITER`, `PENDING` orders only).

The core transaction, `OrderService.place()`, runs as a single
`prisma.$transaction`:

1. `SELECT … FROM table_sessions WHERE id AND restaurantId AND status='OPEN'
   FOR UPDATE` — zero rows throws `409 SESSION_NOT_OPEN`.
2. `SELECT next_order_number($restaurantId)` — the atomic upsert from step 03
   that gives the kitchen a human-readable `#103` instead of a UUID.
3. `order.create({ orderNumber, tableSessionId, tableId, createdByUserId })`.
4. `menuItem.findMany({ where: { id: { in: ids }, restaurantId, isActive,
   isAvailable } })` — a count mismatch against the requested items throws
   `400 ITEM_UNAVAILABLE`. **This is where prices actually come from.**
5. `orderItem.createMany(...)`, snapshotting `name` and `price` from step 4's
   result into `item_name`/`unit_price` on each line.
6. After commit: `realtime.emitOrderNew(...)` (wired up properly in step 11).

`PlaceOrderDto` accepts only `{ tableId | sessionId, items: [{ menuItemId,
quantity, note? }], note? }` — **no price field exists in the request
shape**, and the global `ValidationPipe({ whitelist: true,
forbidNonWhitelisted: true })` strips (doesn't just ignore) anything extra.

Guarded status transitions use the database row, not a TypeScript branch:

```ts
const { count } = await prisma.order.updateMany({
  where: { id, restaurantId, status: 'PENDING' },   // expected current state
  data:  { status: 'PREPARING', preparingAt: new Date() },
});
if (count === 0) throw new OrderAlreadyMovedException(); // 409
```

## Key decisions

| Decision | Reason |
|---|---|
| Prices read from the database inside the transaction, never trusted from the request | This is the single rule that makes the price-snapshot design in step 01 actually hold — a client-supplied price would defeat the whole point of `order_items` being an immutable record |
| The "expected current status" lives in the `WHERE` clause | Two waiters/kitchen staff racing to change the same order's status: the database decides the winner atomically; the loser gets a `count === 0` and a `409`, never a silent double-transition |
| `assert_session_open` (a Postgres trigger) plus an explicit application check | The trigger only fires on `INSERT`, so it can't stop a later status change on an order whose session has since closed — the service enforces that case itself |
| Cancel is restricted to `PENDING` orders | Once the kitchen has started cooking, cancelling silently would waste food and confuse the board; `PREPARING`/`COMPLETED` orders are not cancellable |

## Verified

A `unitPrice` field smuggled into the request body was stripped by
`forbidNonWhitelisted`, never reaching the service. Raising a menu item's
price after an order was placed left that order's `unit_price` at its
original value; `line_total` was computed by Postgres, never written by the
application. Two simultaneous "Start" calls against the same order produced
exactly one `200` and one `409 ORDER_ALREADY_MOVED`. An unavailable item in
the request returned `400 ITEM_UNAVAILABLE` without partially creating the
order.

## Source of truth

[`backend/CLAUDE.md`](../../../backend/CLAUDE.md) → *Services & critical
transactions → `OrderService.place()`* (the full six-step transaction),
*API endpoints* (`/api/orders`), and *Build order* item 8;
[`database/CLAUDE.md`](../../../database/CLAUDE.md) → *Sessions and orders*
(the `order_items` snapshot design) and *Order numbering* (`next_order_number`).
