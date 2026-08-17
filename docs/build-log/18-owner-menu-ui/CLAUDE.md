# Step 18 — Menu management UI

**Depends on:** [17 — Owner shell & staff UI](../17-owner-staff-ui/CLAUDE.md)
(reuses the CRUD pattern established there) and the backend's menu module
([step 06](../06-menu-module/CLAUDE.md)). Built next, ahead of tables and
sessions, because the Take Order screen (step 21) can't be built without
menu data to render.

## What shipped

`/owner/menu` — a two-pane layout: `CategoryList` (with `displayOrder`
up/down controls) on the left, `ItemTable` for the selected category on the
right.

- `AddCategoryDialog`, `AddItemDialog` / `EditItemDialog` — validated by
  `categorySchema` / `menuItemSchema`, mirroring the backend DTOs.
- `AvailabilityToggle` — optimistic, flips `isAvailable` instantly in the UI
  and rolls back only if the server rejects it.
- `DeleteConfirm` on both categories and items — deleting a category that
  still has items surfaces the backend's `409 CATEGORY_NOT_EMPTY` as "Move
  or delete its items first," not a generic error.
- **No image fields anywhere in the form** — matching the backend schema's
  deliberate omission of image columns.
- Price entered as **text**, validated by a regex
  (`/^\d+(\.\d{1,2})?$/`), sent to the server as a string — never
  `type="number"`, because the float round-trip through an `<input
  type="number">` is exactly what `numeric(10,2)` on the database side
  exists to prevent.

## Key decisions

| Decision | Reason |
|---|---|
| Menu built before tables/assignments/sessions | The take-order screen is the most complex piece of UI in the app and needs real menu data to build and test against; building menu management first means that data exists |
| Price input is a validated text field, never a number input | Consistent with the project-wide rule that money is never represented as a JS float at any layer |
| Optimistic availability toggle | It's a single boolean flip a busy owner or manager toggles often (86'd item), and network latency on every toggle would make the screen feel unresponsive for a low-risk action |
| Category delete confirmation surfaces the *specific* server reason, not a generic failure | "Move or delete its items first" tells the owner what to actually do next; a bare "Error 409" doesn't |

## Verified

Toggling an item's availability updated the UI immediately and matched
`GET /menu` on the next fetch. Attempting to delete the seeded "Biryani"
category (which has items) showed the `CATEGORY_NOT_EMPTY` message rather
than a generic failure toast. Entering a price like `12.345` was rejected
client-side by the regex before ever reaching the network — matching the
database's `numeric(10,2)` constraint the field mirrors.

## Source of truth

[`frontend/CLAUDE.md`](../../../frontend/CLAUDE.md) → *Screens & components
→ Owner — Menu*, *Forms — RHF + Zod* (`menuItemSchema`, `categorySchema`),
and *Build order* item 5.
