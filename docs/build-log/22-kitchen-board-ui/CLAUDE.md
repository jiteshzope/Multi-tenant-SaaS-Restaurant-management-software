# Step 22 — Kitchen board UI

**Depends on:** [21 — Take Order screen](../21-take-order-screen/CLAUDE.md)
(needs orders actually flowing in to display) and the backend's kitchen
module ([step 10](../10-kitchen-module/CLAUDE.md)).

## What shipped

One `KitchenBoardPage` component, rendered at both `/kitchen` and
`/owner/kitchen` with no permission differences in the UI — the backend
already allows `OWNER` + `KITCHEN` equally on these endpoints.

- Three `KitchenColumn`s (`PENDING`/`PREPARING`/`COMPLETED`) with count
  badges, each scrolling independently.
- **Per-column sort matches the backend's own per-timestamp ordering**
  exactly: `placedAt` ascending in PENDING, `preparingAt` ascending in
  PREPARING, `completedAt` descending in COMPLETED. `lib/board.ts` restates
  this ordering client-side, but only for the optimistic update — the
  server response remains the source of truth on every refetch.
- `KitchenOrderCard` — **one visible border wraps the whole order**, so
  every item in it reads as a single unit that moves together: order
  number, table number, waiter name, all items with quantities, per-item
  notes, an order-level note, and an elapsed timer.
- **Exactly one action button per card**, matching the schema's lack of
  per-item status: `PENDING → Start`, `PREPARING → Mark complete`,
  `COMPLETED → Move back`. "Move back" is styled `outline`, not the primary
  fill — it's an undo, and must not visually compete with Start/Complete
  during active service.
- Age coloring driven entirely by the server's `ageSeconds`, not a
  client-computed elapsed time: green under 5 minutes, amber 5–10, red past
  10, ticking locally via `useElapsed` between refetches.
- Optimistic status moves via TanStack Query's `onMutate`/`onError`/
  `onSettled`, carrying `{ id, from, to }` rather than just `to` — PREPARING
  is reachable from both PENDING (forward) and COMPLETED (backward via
  undo), so the source column can't be inferred from the destination alone.
  A `409 ORDER_ALREADY_MOVED` rolls the card back and toasts.

## Key decisions

| Decision | Reason |
|---|---|
| One component for both `/kitchen` and `/owner/kitchen` | The board is identical data with identical actions for both roles — a second implementation would be pure duplication with no behavioral difference to justify it |
| The optimistic move carries the source column explicitly | PREPARING has two possible origins; without `from`, an optimistic patch can't know which column to remove the card from before the server confirms |
| "Move back" visually de-emphasized as `outline` | It's a correction action used rarely, next to two primary actions (Start, Complete) used constantly — equal visual weight would make mis-clicks during a rush more likely |
| Age color driven by server `ageSeconds`, not the client clock | A wrong or drifted client clock must never make a stale order look fresh, or vice versa |

## Verified

With a `PENDING` order older than 10 minutes present, its card rendered
red. Clicking Start moved the card to PREPARING immediately (optimistic),
then confirmed on the next successful refetch. Forcing a `409
ORDER_ALREADY_MOVED` (two clients racing on the same order) rolled the
optimistic move back and showed the toast, with the card ending up in
whichever column the server actually settled on. "Move back" on a completed
order returned the card to its exact former position in PREPARING rather
than the bottom of the queue, matching the backend's `preparingAt`
preservation from step 10.

## Source of truth

[`frontend/CLAUDE.md`](../../../frontend/CLAUDE.md) → *Screens & components
→ Kitchen board*, *TanStack Query conventions → Optimistic updates*, and
*Build order* item 9.
