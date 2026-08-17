# Step 19 — Tables & assignments UI

**Depends on:** [18 — Menu management UI](../18-owner-menu-ui/CLAUDE.md)
(same CRUD/dialog pattern, applied to a different resource) and the
backend's tables/assignments module ([step 07](../07-tables-and-assignments/CLAUDE.md)).

## What shipped

`/owner/tables` — `TableGrid` of `TableCard`s (table number, capacity,
`VACANT`/`OCCUPIED` badge via the shared `StatusBadge`, current waiter name,
running total, order count), `AddTableDialog`, `BulkAddTablesDialog`
(`from`/`to` validated so the range can't exceed 100 or invert),
`AssignWaiterDialog`, `AssignmentHistorySheet`, and filters by status and by
waiter.

Also shipped: `MyTablesGrid` at `/waiter` — the same `TableCard`, filtered
to the signed-in waiter's assignments, with the vacant-table action reading
**Take Order** and the occupied-table action reading **View / Add order**.

- Card actions branch on table status: vacant → **Take Order** (into the
  step 21 screen), occupied → **View table** (into the step 20 screen).

## Key decisions

| Decision | Reason |
|---|---|
| One `TableCard` component shared by the owner grid and the waiter grid | The two screens show the same entity with the same status semantics — a second, near-duplicate card component would drift out of sync with the first over time |
| Status shown as a badge, not just implied by card color | `StatusBadge` is the one place an enum maps to a token and it always renders an icon plus the word — color alone never carries meaning in this app |
| Bulk table creation gets its own dialog with a capped range | Matches the backend's own DTO limit; the UI shouldn't let a user submit a request the server will reject anyway |
| Waiter and status filters on the owner grid | A restaurant with 20+ tables needs to answer "what's open" and "what's mine" at a glance, not by scanning every card |

## Verified

Assigning a vacant table to a waiter through `AssignWaiterDialog` made it
appear on that waiter's `/waiter` grid without a manual reload. Bulk-adding
a range of tables produced exactly that many new cards. The status filter
correctly narrowed the grid to only `OCCUPIED` tables, and combining it with
the waiter filter narrowed further. `AssignmentHistorySheet` showed the
prior waiter's closed assignment row alongside the new active one after a
reassignment.

## Source of truth

[`frontend/CLAUDE.md`](../../../frontend/CLAUDE.md) → *Screens & components
→ Owner — Tables* and *Waiter — My tables*, and *Build order* item 6.
