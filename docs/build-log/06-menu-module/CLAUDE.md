# Step 06 — Menu module

**Depends on:** [05 — RBAC, restaurant & staff modules](../05-rbac-restaurant-and-staff/CLAUDE.md)
(reuses the same guards and decorators; no new authorization concept needed).

## What shipped

`MenuModule` — categories and items, the data the Take Order screen (step
21) would eventually read:

- `GET /menu` — the full nested menu (categories → items) in one call, the
  query the take-order screen is built around.
- `GET/POST/PATCH/DELETE /menu/categories`, `GET /menu/categories/:id/items`.
- `POST/PATCH/DELETE /menu/items`, `PATCH /menu/items/:id/availability`
  (the "out of stock today" toggle, separate from soft-delete).
- `GET /menu/search?q=` — trigram search (`pg_trgm`, index from migration
  `0005`) across item names, case-insensitive via `citext`.
- Deleting a category with items still in it returns `409
  CATEGORY_NOT_EMPTY` (`ON DELETE RESTRICT` in the schema) rather than
  silently cascading — the owner must move or delete the items first.

## Key decisions

| Decision | Reason |
|---|---|
| `is_available` and `is_active` kept as two separate booleans | Temporarily out of stock and permanently removed are different states with different UI treatment, and only the second is a soft delete that must not disturb historical orders |
| No image columns/upload anywhere | Out of scope by design — this is a menu-and-ordering system, not a CMS |
| Search backed by a `gin_trgm_ops` index, not `ILIKE` over an unindexed column | The waiter is typing on a tablet under time pressure; a full scan per keystroke isn't acceptable |
| Write endpoints are `OWNER`-only, reads are any authenticated role | A waiter and the kitchen handler both need to see the menu; only the owner edits it |

## Verified

`GET /menu` against the seeded restaurant returns 5 categories and 10 items
in the nested shape the frontend would later consume directly. Deleting the
seeded "Biryani" category (which has items) returns `409 CATEGORY_NOT_EMPTY`.
`GET /menu/search?q=biry` returns the biryani items regardless of case.
Toggling `isAvailable` on an item is reflected immediately in `GET /menu`
without touching `isActive`.

## Source of truth

[`backend/CLAUDE.md`](../../../backend/CLAUDE.md) → *API endpoints* (`/api/menu`)
and *Build order* item 5; [`database/CLAUDE.md`](../../../database/CLAUDE.md)
→ *Menu* section (`menu_categories`, `menu_items` DDL) and the *Example
queries — Menu* section.
