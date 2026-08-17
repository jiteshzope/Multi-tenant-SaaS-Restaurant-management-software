# Step 21 — Take Order screen

**Depends on:** [18 — Menu management UI](../18-owner-menu-ui/CLAUDE.md)
(needs real menu data), [20 — Sessions & table detail UI](../20-sessions-and-table-detail-ui/CLAUDE.md)
(needs an open session to order against), and the backend's orders module
([step 09](../09-orders-module/CLAUDE.md)). Called out in the frontend plan
itself as **the core UI** of the app.

## What shipped

`features/shared/TakeOrderScreen` — a 30/70 split: `CategoryColumn` (30%,
vertical list with item counts) and `ItemsPanel` (70%, responsive card
grid).

- Entering the screen calls `POST /sessions` **first**, before anything else
  renders — idempotent, so a double-tap or a flaky connection returns the
  same session rather than creating a second one; the returned `sessionId`
  is what keys `cart.store`.
- `SearchInput` — sticky at the top of the items column, debounced 300ms,
  hits `GET /menu/search?q=` across **all** categories at once; clearing it
  restores the previously-selected category. Each result shows which
  category it belongs to.
- `MenuItemCard` — name, price, veg indicator dot, `QuantityStepper`
  (−/qty/+). An item with `isAvailable === false` renders greyed out with
  its `+` disabled and an "Unavailable" badge — matching the backend's own
  `400 ITEM_UNAVAILABLE` rejection, pre-empted rather than only handled
  after a failed request.
- `PreviewButton` — sticky, shows live line count and cart total, disabled
  while the cart is empty.
- `OrderPreviewSheet` — editable quantities, per-item removal, optional
  per-item note, an order-level note, the subtotal, and the two actions
  **Back to selection** / **Send Order to Kitchen**.
- On success: clears that session's cart slice, toasts `"Order #103 sent to
  kitchen"`, navigates back to table detail.
- **The outgoing payload contains only `{ menuItemId, quantity, note? }` —
  no price field exists anywhere in this screen's data flow.** The
  authoritative price is resolved server-side, per the design from step 01.

## Key decisions

| Decision | Reason |
|---|---|
| Session opened as the very first action on entering the screen | Everything the screen does — the cart, the send — needs a `sessionId` to key off; opening it eagerly (and idempotently) removes a whole class of "which session is this cart for" bugs |
| Cart holds a *display-only* snapshot of name/price, never treated as authoritative | The cart exists so the UI can render a running total instantly; the actual charge is whatever the server resolves at send time — the two are allowed to be momentarily different render data, never the same source of truth |
| Search hits all categories, not just the active one | A waiter searching "biryani" shouldn't first have to guess which category it's filed under |
| One action button per unavailable item state (disabled `+`), not a hidden card | An item going unavailable mid-shift should be visibly different, not silently missing, so the waiter isn't left wondering where it went |

## Verified

`lib/board.ts`/`money.ts`-adjacent cart math held integer paise totals
across repeated add/remove/quantity-change sequences with no float drift.
Sending an order with an item that had gone unavailable between page load
and send surfaced the server's `400 ITEM_UNAVAILABLE` on the specific
offending line in the preview, without clearing the rest of the cart.
Inspecting the network request confirmed the request body never contained a
price field at any point in the flow.

## Source of truth

[`frontend/CLAUDE.md`](../../../frontend/CLAUDE.md) → *Screens & components
→ Take Order screen — the core UI*, *State management → `cart.store.ts`*,
and *Build order* item 8.
