# Step 01 — Database schema design

**Depends on:** nothing — this is where the project starts.

## Why the database was designed before a line of backend code

This is a multi-tenant system where the single most expensive mistake is a
query that leaks Restaurant A's data into Restaurant B's screen. That kind of
bug is cheap to make impossible at the schema level (a composite foreign key
the database itself refuses to violate) and expensive to catch later with
tests and code review alone. So the data model — every table, every
constraint, every index, and a worked example query for every screen the app
would need — was designed and written down as a full specification before any
Nest module existed.

## What shipped

The complete data model, later transcribed into `backend/prisma/schema.prisma`
and the seven migrations in step 03:

- **12 tables**: `restaurants` (the tenant), `users` (global login identity),
  `restaurant_users` (the membership + role join, the heart of the tenancy
  design), `refresh_tokens`, `restaurant_tables`, `table_waiter_assignments`,
  `menu_categories`, `menu_items`, `table_sessions`, `orders`, `order_items`,
  `restaurant_counters`.
- **The tenancy rule**: shared database, shared schema, `restaurant_id` on
  every tenant-owned row, always read from the verified JWT and never from a
  request body or query string.
- **The core flow modeled as a chain**: `restaurant → table → table_session →
  order → order_items`. A session exists as its own row (not just a status
  flag on the table) because the same physical table serves different
  customer groups on different days, and the bill needs to be "everything in
  this visit," not "everything ever ordered at Table 5."
- **Composite foreign keys** (e.g. `table_waiter_assignments (table_id,
  restaurant_id) → restaurant_tables (id, restaurant_id)`) so the database —
  not just the application layer — refuses to let a child row from one
  tenant point at a parent row from another.
- **The price-snapshot design**: `order_items` copies `item_name` and
  `unit_price` from `menu_items` at insert time, so a later price change can
  never re-price a placed order. `line_total` is a Postgres generated column
  (`unit_price * quantity`), never written by the application.
- **Partial unique indexes** as the enforcement mechanism for business rules
  that are really tenancy/consistency rules in disguise: one `OPEN` session
  per table, one active waiter per table, one active `OWNER`/`KITCHEN` per
  restaurant.
- **A rotating refresh-token design** (`refresh_tokens` with `family_id`,
  `replaced_by_id`, `revoked_reason`) worked out at the schema level so token
  theft detection ("reuse of an already-rotated token revokes the whole
  family") would be a lookup-and-compare, not application-side bookkeeping.
- An ER diagram and, for every screen the app would eventually have, a
  worked example SQL query — auth/login, the kitchen board, the bill, owner
  reports — written before the endpoints that would run them existed.

## Key decisions

| Decision | Reason |
|---|---|
| `restaurant_id` denormalized onto every child table instead of derived via joins | One-column tenant filtering everywhere, indexes that lead with it, and — backed by the composite FKs — the copy can never disagree with the parent |
| `uuid` primary keys, not serial integers | Safe to expose in URLs; no cross-tenant enumeration by guessing IDs |
| `numeric(10,2)` for all money, never `float` | Floats lose paise; this is non-negotiable for a billing system |
| `users` kept global, role lives in `restaurant_users` | One login could later manage two restaurants with different roles, at no schema cost |
| Soft delete (`is_active`) for menu items and staff | Order history must keep working after an item or a staff member is removed |

## Verified

This step produced a design document, not a running system — verification
happened in step 03 when the schema was actually applied. What was checked
here was internal consistency: every child table's tenant FK is composite
and backed by a `UNIQUE (id, restaurant_id)` on the parent, every status
enum has a matching `CHECK` making its timestamp columns agree with it
(`ck_session_closed`), and every screen in the eventual app has at least one
worked query against this shape.

## Source of truth

[`database/CLAUDE.md`](../../../database/CLAUDE.md) — sections 1–4 (what's
being built, the tenancy strategy, the 12 tables, the ER diagram) are exactly
this step. The rest of that document (schema DDL, indexes, seed data, example
queries) is the same design carried into migration-ready SQL, which is where
step 03 picks it up.
