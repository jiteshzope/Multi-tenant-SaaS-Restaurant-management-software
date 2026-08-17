# Step 03 — Prisma migrations & seed data

**Depends on:** [02 — Project scaffolding & tooling](../02-project-scaffolding-and-tooling/CLAUDE.md)
(needs `PrismaService` and a running Postgres container) and
[01 — Database schema design](../01-database-schema-design/CLAUDE.md) (the
model being transcribed).

## What shipped

The step 01 design became a running schema, applied as **seven sequenced
migrations** rather than one, because Prisma can express tables/enums/FKs/plain
indexes from `schema.prisma` but has no syntax for partial indexes, generated
columns, trigger functions, or hand-written `CHECK` constraints — those had to
be raw SQL, hand-added to migrations created with `prisma migrate dev
--create-only`:

| Migration | Contents |
|---|---|
| `0001_extensions` | `pgcrypto`, `citext`, `pg_trgm` — must run before `0002`, which declares `citext` columns |
| `0002_init` | All 12 tables, enums, FKs, plain indexes — **generated**, not hand-written: `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` |
| `0003_functions` | `set_updated_at()`, `assert_session_open()`, `sync_table_status()`, `next_order_number()` |
| `0004_triggers` | Attaches the four functions to their tables, now that the tables exist |
| `0005_partial_indexes` | Every `WHERE`-filtered unique + performance index (one open session per table, one active kitchen handler, the kitchen board's hot index) |
| `0006_check_constraints` | The `CHECK`s Prisma can't declare, plus the one composite FK Prisma itself refuses to model — `fk_orders_session_table` on `(table_session_id, table_id)`, because Prisma won't accept a second multi-field relation from `orders` to `table_sessions` |
| `0007_generated_columns` | Drops the plain `line_total` column Prisma emitted in `0002` and re-adds it `GENERATED ALWAYS AS (unit_price * quantity) STORED` |
| `backend/prisma/seed.ts` | One restaurant (Spice Garden), 4 users (owner, 2 waiters, 1 kitchen handler — all password `password123`, hashed with Argon2id at seed time), 8 tables, 5 categories, 10 menu items, all tables pre-assigned to a waiter |

## Key decisions

| Decision | Reason |
|---|---|
| Seven migrations instead of one big one | Ordering matters mechanically (extensions → tables → things that decorate tables) and each migration stays independently reviewable |
| `0002_init` generated, not hand-written | Anything Prisma *can* express should come from the schema, so `schema.prisma` stays the single source for the parts it owns |
| One FK (`fk_orders_session_table`) kept in raw SQL permanently, absent from the Prisma model | Prisma can't express it; the database enforces it regardless, and services read the table number through the session relation instead |
| "Never edit an applied migration — add a new one" | Same discipline as git history; a later schema change (e.g. a discount column) is migration `0008`, not a rewrite of `0002` |
| Fixed UUIDs in seed data | So API tests and manual Swagger exploration can copy-paste stable IDs |

## Verified

Confirmed directly against the live database after `migrate deploy` +
`db seed`:

- `\dx` shows `citext`, `pg_trgm`, `pgcrypto`; `\dt` shows all 12 tables plus
  `_prisma_migrations`.
- Exactly 4 named functions and 9 triggers exist (7 × `updated_at` +
  `sync_table_status` + `assert_session_open`).
- Two concurrent "open session" attempts on the same table returned the
  **same** session id (the partial unique index doing its job).
- Raising a menu item's price after seeding left previously-inserted
  `order_items.unit_price` untouched — proved once orders existed in step 09,
  but the generated column and snapshot columns were already in place here.
- A second active `KITCHEN` row insert raised `23505` (`unique_violation`).

## Source of truth

[`database/CLAUDE.md`](../../../database/CLAUDE.md) → *Migration layout*
(§6) and *Setup* (§5) for the exact SQL; [`backend/CLAUDE.md`](../../../backend/CLAUDE.md)
→ *Prisma* section for the Nest-side migration workflow and the four
Prisma-specific gotchas (citext, generated columns, composite FKs, Decimal
serialization) and *Build order* item 2.
