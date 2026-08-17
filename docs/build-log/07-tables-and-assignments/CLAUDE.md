# Step 07 — Tables & assignments

**Depends on:** [05 — RBAC, restaurant & staff modules](../05-rbac-restaurant-and-staff/CLAUDE.md)
(assignment endpoints hand a table to one of the waiters step 05 created;
`TableAccessGuard`, written in step 05, is exercised for the first time
here).

## What shipped

- `TablesModule` — `GET /tables` (`OWNER`, full floor), `GET /tables/my`
  (`WAITER`, only their assigned tables), `GET /tables/:id`, `POST /tables`,
  `POST /tables/bulk` (create a numbered range at once — the "add tables
  1 through 20" case), `PATCH /tables/:id`, `DELETE /tables/:id` (soft
  delete via `is_active`).
- Assignment endpoints under `/tables/:id/assignment` — `PUT` (reassign,
  inside a transaction: close the current active-assignment row, insert a
  new one), `DELETE` (unassign), `GET /history` (every past assignment for
  that table).
- `TableAccessGuard` wired onto the `WAITER`-facing routes: a waiter fetching
  a table not currently assigned to them gets `403 TABLE_NOT_ASSIGNED`; an
  `OWNER` bypasses the check entirely.

## Key decisions

| Decision | Reason |
|---|---|
| Assignment history is its own table with `assigned_at`/`unassigned_at`, not a single `waiter_id` column on `restaurant_tables` | "Who was serving Table 5 last Friday" needs to stay answerable, and reassignment becomes close-old-row + insert-new-row instead of an in-place overwrite |
| Reassignment runs inside one transaction | Two active-assignment rows for the same table at once would make `TableAccessGuard`'s "who owns this table" question ambiguous |
| Bulk table creation as its own endpoint | Setting up a new restaurant's floor is a one-time operation for 8, 20 or 50 tables — doing it one `POST` at a time is real friction the owner would hit on day one |
| `restaurant_tables (id, restaurant_id)` carries a `UNIQUE` constraint solely to let child tables use a composite FK against it | This is the concrete instance of the tenant-safety pattern designed in step 01 |

## Verified

A waiter (Amit, seeded with tables 1–4) reading Suresh's Table 6 returns
`403 TABLE_NOT_ASSIGNED`; reading his own Table 2 succeeds. Reassigning
Table 1 from Amit to Suresh leaves exactly one active assignment row
(enforced by the partial unique index from migration `0005`) and a closed
historical row behind it. `POST /tables/bulk` with a 100-table range is
accepted; a larger range is rejected at the DTO boundary.

## Source of truth

[`backend/CLAUDE.md`](../../../backend/CLAUDE.md) → *API endpoints*
(`/api/tables`, `/api/tables/:id/assignment`), *Services & critical
transactions* (`AssignmentService.reassign`), and *Build order* item 6;
[`database/CLAUDE.md`](../../../database/CLAUDE.md) → *Tables and waiter
assignments* section, including the composite-FK explanation.
