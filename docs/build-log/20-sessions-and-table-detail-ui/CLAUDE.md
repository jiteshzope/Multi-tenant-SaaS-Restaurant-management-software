# Step 20 — Sessions & table detail UI

**Depends on:** [19 — Tables & assignments UI](../19-owner-tables-ui/CLAUDE.md)
(table cards link into this screen) and the backend's sessions module
([step 08](../08-table-sessions/CLAUDE.md)).

## What shipped

`features/shared/TableDetail` — deliberately **one implementation shared by
both the owner and waiter routes**, parameterized by `useRole()` only for
the back-link's base path:

- An order timeline: one block per order showing its number, `StatusBadge`,
  items, who placed it, and when.
- A running total for the session.
- **Add another order** (into the Take Order screen, step 21), **View
  bill**, **Close table**.
- Closing is disabled — pre-emptively, with an explanatory tooltip, not just
  left to fail — while any order is `PENDING`/`PREPARING`, matching the
  backend's `409 ORDERS_IN_PROGRESS`.
- `BillView` (also shared): restaurant header, table number, guest count,
  served-by, merged identical item lines, subtotal, tax at the restaurant's
  `taxPercent`, grand total — **all rendered from the server's bill payload,
  never recomputed in the browser**. `PrintBillButton` triggers
  `window.print()` against a print-only stylesheet.

## Key decisions

| Decision | Reason |
|---|---|
| One `TableDetail`/`BillView` implementation for both roles | An owner and a waiter looking at the same table should see the same facts; a second parallel implementation would eventually disagree with the first |
| Close button disabled ahead of time, not just handled on failure | A waiter shouldn't have to attempt-and-fail to learn a table can't be closed yet — the reason should be visible before they try |
| Bill totals never recomputed client-side | The database computes tax with `ROUND`; a second JS implementation of the same math is a second place it can drift from the first — this app has exactly one source for a bill total |
| Cancel offered only on `PENDING` orders | Matches the backend's own restriction — the UI doesn't offer an action the server would reject |

## Verified

Opening a vacant table created a session and landed on this screen; a
second, near-simultaneous open of the same table (e.g. a double-tap)
returned to the same session rather than a new one. With a `PENDING` order
present, the Close button was disabled with a tooltip; after that order was
completed, Close became available and produced a bill whose printed total
matched the server's response exactly.

## Source of truth

[`frontend/CLAUDE.md`](../../../frontend/CLAUDE.md) → *Screens & components
→ Table detail* and *Bill*, *Money, dates and formatting rules*, and *Build
order* item 7.
