# PostgreSQL Database Plan — Multi-Tenant Restaurant SaaS

> Complete specification of the data model — every column, every type, every constraint,
> every index, and a runnable example query for every screen in the app.

---

## Table of Contents

1. [What we are building](#1-what-we-are-building)
2. [Multi-tenancy strategy](#2-multi-tenancy-strategy)
3. [The 12 tables at a glance](#3-the-12-tables-at-a-glance)
4. [ER diagram](#4-er-diagram)
5. [Setup](#5-setup)
6. [Migration layout](#6-migration-layout)
7. [Conventions & data types](#7-conventions--data-types)

**Schema**

8. [Extensions](#extensions)
9. [Enum types](#enum-types)
10. [Helper functions and triggers](#helper-functions-and-triggers)
11. [Core tables](#core-tables)
12. [Tables and waiter assignments](#tables-and-waiter-assignments)
13. [Menu](#menu)
14. [Sessions and orders](#sessions-and-orders)
15. [Order numbering](#order-numbering)
16. [Indexes](#indexes)
17. [Seed data](#seed-data)

**Queries**

18. [Auth & staff](#example-queries--auth--staff)
19. [Menu](#example-queries--menu)
20. [Tables & assignments](#example-queries--tables--assignments)
21. [Sessions](#example-queries--sessions)
22. [Taking an order](#example-queries--taking-an-order)
23. [Kitchen dashboard](#example-queries--kitchen-dashboard)
24. [Bill & closing a table](#example-queries--bill--closing-a-table)
25. [Reports](#example-queries--reports)

**Reference**

26. [Query rules and error mapping](#query-rules-and-error-mapping)
27. [Transactions explained](#transactions-explained)
28. [Performance: indexes and EXPLAIN](#performance-indexes-and-explain)
29. [Backup, restore, psql cheat sheet](#backup-restore-psql-cheat-sheet)
30. [Common mistakes](#common-mistakes)

---

## 1. What we are building

One SaaS product. Many restaurants ("tenants") use the same application and the same database.

Each restaurant has:

```
Restaurant (tenant)
 ├── 1 Owner            → manages menu, staff, tables; can do everything
 ├── N Waiters          → see their assigned tables, take orders
 ├── 1 Kitchen handler  → sees PENDING / PREPARING / COMPLETED order columns
 ├── N Physical tables  → assigned to waiters by the owner
 ├── Menu               → categories → items
 └── Orders             → taken by waiter, cooked by kitchen, billed at table close
```

The core flow to keep in your head:

```
RESTAURANT
    ↓
TABLE                (physical table #5)
    ↓
TABLE SESSION        (the group of customers sitting there right now)
    ↓
ORDER                (one "Send to Kitchen" press)
    ↓
ORDER ITEMS          (Chicken Biryani × 2, Coke × 2)
```

A table session exists because the same physical table serves different customers on
different days. Orders hang off the **session**, not off the table. When the customers
leave, the session closes and the bill is the sum of all orders in that session.

---

## 2. Multi-tenancy strategy

**Shared database, shared schema, `restaurant_id` on every tenant-owned row.** One
`orders` table for all restaurants, always filtered by tenant.

### The single most important rule in this whole project

> **Every query that touches a tenant table MUST filter by `restaurant_id`.**

```sql
-- ✅ CORRECT
SELECT * FROM orders WHERE restaurant_id = $1;

-- ❌ CATASTROPHIC — Restaurant A sees Restaurant B's orders
SELECT * FROM orders;
```

The `restaurant_id` comes from the **authenticated user's JWT / membership row on the
server**, never from a request body or query string the client controls.

Two layers of defence:

1. **Application layer** — every service method takes `restaurantId` as its first argument
   and every Prisma call includes `where: { restaurantId }`.
2. **Composite foreign keys** — the database itself refuses to link a row from Restaurant A
   to a row from Restaurant B (see [Tables and waiter assignments](#tables-and-waiter-assignments)).

### Why `restaurant_id` is repeated on child tables

You could derive `orders.restaurant_id` by walking `orders → table_sessions → restaurant_id`.
We store it directly anyway ("deliberate denormalization") because:

- Tenant filtering becomes one `WHERE`, no joins.
- Indexes can lead with `restaurant_id`, which is how every query filters.
- Accidental cross-tenant leaks are far less likely.

The redundancy is made **safe** by composite foreign keys, so the copy can never disagree
with the parent.

---

## 3. The 12 tables at a glance

| # | Table | Purpose | Tenant-scoped? |
|---|---|---|---|
| 1 | `restaurants` | The tenant itself | it *is* the tenant |
| 2 | `users` | Login identity (email + password hash) | ❌ global |
| 3 | `restaurant_users` | Which user belongs to which restaurant, with what role | ✅ |
| 4 | `refresh_tokens` | Rotating refresh-token store for login sessions | ❌ global (per user) |
| 5 | `restaurant_tables` | Physical tables (Table 1, Table 2 …) | ✅ |
| 6 | `table_waiter_assignments` | Which waiter is responsible for which table | ✅ |
| 7 | `menu_categories` | Starters, Biryani, Drinks … | ✅ |
| 8 | `menu_items` | Chicken Biryani ₹250 … | ✅ |
| 9 | `table_sessions` | One customer group's visit to a table | ✅ |
| 10 | `orders` | One "Send to Kitchen" submission | ✅ |
| 11 | `order_items` | Line items inside an order (price snapshot) | ✅ |
| 12 | `restaurant_counters` | Per-restaurant order number counter (`#1`, `#2` …) | ✅ |

`users` is intentionally global so that one person could later own or manage two
restaurants with one login. The link + role lives in `restaurant_users`.

`refresh_tokens` is global for the same reason — it belongs to a *login*, not to a
restaurant. Which restaurant the resulting access token is scoped to comes from
`restaurant_users`.

---

## 4. ER diagram

```mermaid
erDiagram
    restaurants ||--o{ restaurant_users : "has staff"
    users ||--o{ restaurant_users : "member of"
    users ||--o{ refresh_tokens : "login sessions"
    restaurants ||--o{ restaurant_tables : "has"
    restaurants ||--o{ menu_categories : "has"
    menu_categories ||--o{ menu_items : "contains"
    restaurant_tables ||--o{ table_waiter_assignments : "assigned via"
    users ||--o{ table_waiter_assignments : "waiter"
    restaurant_tables ||--o{ table_sessions : "hosts"
    table_sessions ||--o{ orders : "collects"
    orders ||--o{ order_items : "contains"
    menu_items ||--o{ order_items : "snapshotted into"
    users ||--o{ orders : "created_by"
    restaurants ||--|| restaurant_counters : "order numbering"
```

Text version:

```
                                RESTAURANTS
                                     │
        ┌────────────┬───────────────┼────────────────┬──────────────┐
        │            │               │                │              │
        ▼            ▼               ▼                ▼              ▼
 restaurant_users  restaurant_tables  menu_categories  restaurant_counters
        │            │                 │
        ▼            ├──► table_waiter_assignments ──► users
      users          │
                     ▼
               table_sessions
                     │
                     ▼
                  orders ──► users (created_by)
                     │
                     ▼
                order_items ──► menu_items (snapshot source)

  (global, no restaurant_id)
      users ──► refresh_tokens ──► refresh_tokens (replaced_by_id, rotation chain)
```

---

## 5. Setup

> **Status: applied.** All seven migrations are in `backend/prisma/migrations/`
> and have been run against a live `postgres:16-alpine`; the seed rows below
> exist. See [Verifying the schema](#verifying-the-schema) at the end of this
> section for the checks that were run.

Postgres runs in Docker; the schema is applied by Prisma. Everything below is run from
`backend/`.

**Docker Desktop needs hardware virtualization enabled in the BIOS/UEFI** — the
Postgres container will not start without it.

```bash
docker compose -f docker/docker-compose.yml up -d db   # postgres:16-alpine
npx prisma generate                                    # typed client
npx prisma migrate deploy                              # build the schema
npx prisma db seed                                     # load seed data
```

`DATABASE_URL` — see `backend/CLAUDE.md` → *Environment variables*:

```
# from the host (running the API outside Docker)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/resto_saas

# from inside the compose network (the api container)
DATABASE_URL=postgresql://postgres:postgres@db:5432/resto_saas
```

`SHADOW_DATABASE_URL` is only needed by `prisma migrate dev` (authoring new
migrations). `migrate deploy` never touches it, so a fresh setup does not need
the shadow database to exist.

To inspect the schema directly:

```bash
docker compose exec db psql -U postgres -d resto_saas   # SQL shell
npx prisma studio                                       # GUI browser
```

Starting over — **destroys all data**:

```bash
npx prisma migrate reset --force        # drop, re-apply 0001→0007, re-seed
```

### How `0002_init` was produced

Prisma can generate it from the models, so it was not hand-written:

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script \
  > prisma/migrations/0002_init/migration.sql
```

`0001` and `0003`–`0007` are the hand-written SQL this document specifies —
extensions, functions, triggers, partial indexes, CHECK constraints and the
generated column. Folder names sort in apply order, so `deploy` runs them
extensions → tables → everything that decorates the tables.

One FK could not live in `schema.prisma` and is raw SQL in `0006`:
`fk_orders_session_table` on `(table_session_id, table_id)`. Prisma will not
accept a second multi-field relation from `orders` to `table_sessions`, so the
Prisma model carries only the `(table_session_id, restaurant_id)` relation and
the database enforces both. The API reads a table number through the session
rather than through a direct relation.

### Verifying the schema

Run these from `backend/` with `docker compose -f docker/docker-compose.yml exec db …`:

```bash
psql -U postgres -d resto_saas -c "\dx"        # citext, pg_trgm, pgcrypto (+ built-in plpgsql)
psql -U postgres -d resto_saas -c "\dt"        # the 12 tables + _prisma_migrations
psql -U postgres -d resto_saas -c "\d orders"  # columns, FKs, indexes, triggers
```

`\df` is not useful here — it lists every function the three extensions install
as well. Ask for ours by name instead:

```sql
-- expect exactly 4 rows
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('set_updated_at','assert_session_open','sync_table_status','next_order_number');

-- expect 9: 7 × updated_at, sync_table_status, assert_session_open
SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal;
```

These behaviours were confirmed against the live database through the API:

| Guarantee | Enforced by | Observed |
|---|---|---|
| One OPEN session per table | `uq_one_open_session_per_table` | Two concurrent opens returned the *same* session id |
| Table status follows the session | `sync_table_status` trigger | `VACANT` → `OCCUPIED` on open, back on close, never set by hand |
| Per-restaurant order numbers | `next_order_number()` | Sequential `#1, #2, …`, no gaps under concurrent placement |
| Price snapshot | `order_items.unit_price` copied at insert | Raising a menu price left the placed order at `250.00` |
| `line_total` is computed | generated column | `250.00 × 2 = 500.00`, never written by the application |
| One active KITCHEN handler | `uq_one_active_kitchen_per_restaurant` | A second one raised `23505` → HTTP 409 |
| Guarded status transitions | expected state in the `WHERE` clause | Two simultaneous "Start" clicks → one 200, one 409 |
| Bill maths | `ROUND(...)` in SQL | subtotal `820.00`, 5 % tax `41.00`, total `861.00` |

**This file is the source of truth for the data model** — column names, types,
constraints, triggers and query shapes. `backend/CLAUDE.md` owns how that schema is
applied and how the API consumes it.

---

## 6. Migration layout

A migration is a folder under `backend/prisma/migrations/` holding one `migration.sql`
that runs exactly once. Prisma records which have already run in a `_prisma_migrations`
table, so `npx prisma migrate deploy` applies only the new ones.

Prisma generates the parts it can express from `schema.prisma`. Everything else in this
document — extensions, functions, triggers, partial indexes, CHECK constraints, the
generated column — is hand-written SQL pasted into a migration created with
`npx prisma migrate dev --create-only`.

| Migration | Contents | Section in this file |
|---|---|---|
| `0001_extensions` | `pgcrypto`, `citext`, `pg_trgm` | [Extensions](#extensions) |
| `0002_init` | enums, all 12 tables, FKs, plain indexes — Prisma-generated | [Enum types](#enum-types) through [Order numbering](#order-numbering) |
| `0003_functions` | `set_updated_at`, `assert_session_open`, `sync_table_status`, `next_order_number` | [Helper functions and triggers](#helper-functions-and-triggers), [Order numbering](#order-numbering) |
| `0004_triggers` | attach the triggers to their tables | [Helper functions and triggers](#helper-functions-and-triggers) |
| `0005_partial_indexes` | every `WHERE`-filtered unique + performance index | [Indexes](#indexes) |
| `0006_check_constraints` | the CHECK constraints Prisma cannot declare | the table sections |
| `0007_generated_columns` | `order_items.line_total` | [Sessions and orders](#sessions-and-orders) |

Order matters: extensions before tables (the tables use `citext` columns), tables before
the triggers, indexes and constraints that decorate them, and `set_updated_at()` before
any trigger that calls it.

> **The one rule: once a migration has been applied, never edit it — add a new one.**
> Same discipline as git commits. Adding a column later looks like this:
>
> ```
> 0008_add_discount_to_orders/migration.sql
>     ALTER TABLE orders ADD COLUMN discount_percent numeric(5,2);
> ```

Seed data lives in `backend/prisma/seed.ts` (`npx prisma db seed`); the rows it creates
are specified in [Seed data](#seed-data).

---

## 7. Conventions & data types

| Thing | Choice | Why |
|---|---|---|
| Primary key | `uuid` default `gen_random_uuid()` | Safe to expose in URLs; no ID guessing; no cross-tenant enumeration |
| Timestamps | `timestamptz` (never plain `timestamp`) | Stores UTC + offset; correct across time zones |
| "Now" | `now()` | Transaction start time; consistent within a transaction |
| Money | `numeric(10,2)` | **Never `float`/`double`** — floats lose paise/cents |
| Short text | `varchar(n)` with a sensible `n` | Cheap sanity limit |
| Long text | `text` | No length limit needed |
| Email | `citext` | Case-insensitive: `Raj@x.com` = `raj@x.com` |
| Fixed value sets | `ENUM` types | Database rejects typos like `'PENDNG'` |
| Booleans | `boolean NOT NULL DEFAULT true/false` | Never nullable booleans |
| Naming | `snake_case`, plural table names | PostgreSQL convention; avoids quoting |
| Deletes | Soft delete (`is_active = false`) for menu/staff | History must stay intact |

The types this schema uses:

```
uuid          550e8400-e29b-41d4-a716-446655440000
varchar(120)  'Chicken Biryani'
text          long description
numeric(10,2) 250.00            (10 digits total, 2 after the decimal point)
integer       2
smallint      4                 (capacity, guest_count)
boolean       true / false
timestamptz   2026-08-13 19:42:11.123+05:30
jsonb         {"note": "less spicy"}      (use sparingly, prefer real columns)
citext        'Raj@x.com' = 'raj@x.com'   (case-insensitive text, needs the extension)
```

**`citext` and Prisma.** `citext` columns (`users.email`, `restaurants.slug`,
`menu_categories.name`, `menu_items.name`) map to `String @db.Citext` in `schema.prisma`,
which requires `CREATE EXTENSION citext` to have run first — it does, in migration `001`
— which is why `0001_extensions` runs before `0002_init`. The backend *additionally*
lowercases email in a DTO `@Transform` as defence in depth; the database-level
case-insensitivity is what actually enforces uniqueness.

---

## Extensions

Migration `0001_extensions`.

```sql
-- gen_random_uuid() is built into PostgreSQL 13+.
-- On PostgreSQL 12 or older, pgcrypto provides it:
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Case-insensitive text — used for emails and unique names.
CREATE EXTENSION IF NOT EXISTS citext;

-- Trigram index support — makes the waiter's menu search bar fast
-- for queries like:  WHERE name ILIKE '%biry%'
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Verify:

```sql
\dx
```

---

## Enum types

Migration `0002_init` — Prisma emits these from the `enum` blocks in `schema.prisma`.

An `ENUM` is a custom type with a fixed list of allowed values. If your code tries to
insert `'PENDNG'`, PostgreSQL rejects the row instead of silently storing garbage.

```sql
CREATE TYPE user_role     AS ENUM ('OWNER', 'WAITER', 'KITCHEN');
CREATE TYPE table_status  AS ENUM ('VACANT', 'OCCUPIED');
CREATE TYPE session_status AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE order_status  AS ENUM ('PENDING', 'PREPARING', 'COMPLETED', 'CANCELLED');
```

Inspect an enum:

```sql
SELECT unnest(enum_range(NULL::order_status)) AS status;
```

---

## Helper functions and triggers

Functions in migration `0003_functions`; the `CREATE TRIGGER` statements that attach them
in `0004_triggers`.

### Auto-maintain `updated_at`

Instead of remembering to write `updated_at = now()` in every `UPDATE`, let a trigger do it.

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;
```

Attach it to a table like this (repeated for every table that has `updated_at`):

```sql
CREATE TRIGGER trg_<table>_updated_at
    BEFORE UPDATE ON <table>
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
```

### Block orders on a closed session

Business rule: you cannot add an order to a session that has already been billed.

```sql
CREATE OR REPLACE FUNCTION assert_session_open()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_status session_status;
BEGIN
    SELECT status INTO v_status
    FROM table_sessions
    WHERE id = NEW.table_session_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Table session % does not exist', NEW.table_session_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_status <> 'OPEN' THEN
        RAISE EXCEPTION 'Cannot add an order to a % session', v_status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;
```

### Keep `restaurant_tables.status` in sync automatically

When a session opens → table becomes `OCCUPIED`. When it closes → `VACANT`.
Doing this in a trigger means the two can never drift apart.

```sql
CREATE OR REPLACE FUNCTION sync_table_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE restaurant_tables
        SET status = 'OCCUPIED'
        WHERE id = NEW.table_id;

    ELSIF TG_OP = 'UPDATE'
          AND NEW.status = 'CLOSED'
          AND OLD.status = 'OPEN' THEN
        UPDATE restaurant_tables
        SET status = 'VACANT'
        WHERE id = NEW.table_id;
    END IF;

    RETURN NEW;
END;
$$;
```

All three functions are created in `0003_functions`; the triggers that call them are
attached in `0004_triggers`, once the tables exist.

---

## Core tables

`restaurants`, `users`, `restaurant_users`, `refresh_tokens` — migration `0002_init`,
with the CHECK constraints in `0006_check_constraints` and the partial unique indexes in
`0005_partial_indexes`.

### `restaurants` — the tenant table

```sql
CREATE TABLE restaurants (
    id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    name         varchar(120) NOT NULL,
    slug         citext       NOT NULL,               -- 'spice-garden' → used in URLs
    phone        varchar(20),
    address      text,
    currency     char(3)      NOT NULL DEFAULT 'INR',
    timezone     varchar(64)  NOT NULL DEFAULT 'Asia/Kolkata',
    tax_percent  numeric(5,2) NOT NULL DEFAULT 5.00,  -- used when printing the bill
    is_active    boolean      NOT NULL DEFAULT true,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT uq_restaurants_slug   UNIQUE (slug),
    CONSTRAINT ck_restaurants_name   CHECK (length(btrim(name)) > 0),
    CONSTRAINT ck_restaurants_tax    CHECK (tax_percent >= 0 AND tax_percent <= 100)
);

CREATE TRIGGER trg_restaurants_updated_at
    BEFORE UPDATE ON restaurants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Column by column**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | This value *is* the tenant id used everywhere else |
| `name` | varchar(120) | Display name — "Spice Garden" |
| `slug` | citext UNIQUE | URL-safe handle, case-insensitive |
| `currency` | char(3) | ISO code, `INR` |
| `timezone` | varchar(64) | IANA name — reports convert UTC to this |
| `tax_percent` | numeric(5,2) | GST used at bill time |
| `is_active` | boolean | Suspend a tenant without deleting data |

### `users` — login identity only

```sql
CREATE TABLE users (
    id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    name          varchar(120) NOT NULL,
    email         citext       NOT NULL,
    phone         varchar(20),
    password_hash text         NOT NULL,              -- Argon2id output, ~95 chars
    is_active     boolean      NOT NULL DEFAULT true,
    last_login_at timestamptz,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT uq_users_email  UNIQUE (email),
    CONSTRAINT ck_users_email  CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT ck_users_name   CHECK (length(btrim(name)) > 0)
);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

Notice: **no `role` and no `restaurant_id` here.** A user is just an identity. What they
can do, and where, lives in the next table.

**Never store a plain password.** Node hashes with **Argon2id** (`argon2` package, cost
parameters from env — see `backend/CLAUDE.md`) and stores only the hash. The same library
hashes refresh tokens, so there is exactly one hashing dependency in the codebase.

### `restaurant_users` — the membership + role table

This is the heart of the multi-tenant design.

```sql
CREATE TABLE restaurant_users (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id uuid        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    user_id       uuid        NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
    role          user_role   NOT NULL,
    is_active     boolean     NOT NULL DEFAULT true,
    created_by    uuid        REFERENCES users(id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    -- A user can hold only one role per restaurant
    CONSTRAINT uq_restaurant_users UNIQUE (restaurant_id, user_id)
);

CREATE TRIGGER trg_restaurant_users_updated_at
    BEFORE UPDATE ON restaurant_users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Enforcing "exactly one kitchen handler and one owner per restaurant" in the database:**

A *partial unique index* — a unique index that only applies to rows matching a condition.

```sql
CREATE UNIQUE INDEX uq_one_active_owner_per_restaurant
    ON restaurant_users (restaurant_id)
    WHERE role = 'OWNER' AND is_active;

CREATE UNIQUE INDEX uq_one_active_kitchen_per_restaurant
    ON restaurant_users (restaurant_id)
    WHERE role = 'KITCHEN' AND is_active;
```

Now a second `INSERT` of an active `KITCHEN` row for the same restaurant fails with
`unique_violation` (SQLSTATE `23505`) — the rule is guaranteed even if the API has a bug.
Waiters are unrestricted because no index constrains them.

Example rows:

| id | restaurant_id | user_id | role |
|---|---|---|---|
| … | Spice Garden | Raj | OWNER |
| … | Spice Garden | Amit | WAITER |
| … | Spice Garden | Suresh | WAITER |
| … | Spice Garden | Rahul | KITCHEN |
| … | Delhi Kitchen | Priya | OWNER |

Because `users` is global and the link lives here, one person can later be OWNER of
Restaurant A and MANAGER of Restaurant B with a single login. No schema change needed.

### `refresh_tokens` — rotating login sessions

The access token lives 15 minutes and is never stored anywhere. The **refresh** token lives
7 days, and *is* stored — because you need to be able to revoke it (logout), rotate it, and
detect theft. A refresh token you cannot revoke is a password that never expires.

```sql
CREATE TABLE refresh_tokens (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id      uuid        NOT NULL DEFAULT gen_random_uuid(),
    token_hash     text        NOT NULL,           -- Argon2id hash, NEVER the raw token
    expires_at     timestamptz NOT NULL,
    revoked_at     timestamptz,
    revoked_reason varchar(40),                    -- 'ROTATED' | 'LOGOUT' | 'REUSE_DETECTED'
    replaced_by_id uuid        REFERENCES refresh_tokens(id) ON DELETE SET NULL,
    user_agent     text,
    ip             inet,
    created_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_refresh_expiry CHECK (expires_at > created_at),
    CONSTRAINT ck_refresh_revoked
        CHECK ((revoked_at IS NULL AND revoked_reason IS NULL)
            OR (revoked_at IS NOT NULL AND revoked_reason IS NOT NULL))
);
```

**Column by column**

| Column | Purpose |
|---|---|
| `id` | Also the JWT's `jti` claim — this is how you find the row (see below) |
| `user_id` | Owner of the session |
| `family_id` | The **lineage**. Every rotation keeps the same `family_id` |
| `token_hash` | Argon2id hash of the raw token. A database leak yields nothing usable |
| `expires_at` | Absolute expiry, independent of the JWT's own `exp` |
| `revoked_at` / `revoked_reason` | Why this row is dead |
| `replaced_by_id` | Points at the row that superseded it — the rotation chain |
| `user_agent` / `ip` | "Active sessions" screen and incident forensics |

### How lookup works (the non-obvious part)

Argon2 salts every hash randomly, so `WHERE token_hash = $1` **will never match**. You
cannot search by hash. Instead:

1. The refresh JWT carries `{ sub: userId, jti: <refresh_tokens.id>, fid: <family_id> }`
2. On `/auth/refresh`, verify the JWT signature, then `SELECT … WHERE id = jti`
3. Then `argon2.verify(row.token_hash, presentedToken)` on that single row

This keeps Argon2id as the only hashing library in the codebase.

### Rotation and reuse detection

```
login          → row A (family F)
/auth/refresh  → verify A → revoke A ('ROTATED', replaced_by = B) → issue row B (family F)
/auth/refresh  → verify B → revoke B ('ROTATED', replaced_by = C) → issue row C (family F)

attacker replays the stolen A
               → A.revoked_at IS NOT NULL  ⇒  THEFT
               → revoke the ENTIRE family F ('REUSE_DETECTED')
               → both the attacker and the real user are logged out
```

A valid token is used exactly once. A second use of an already-rotated token can only mean
someone copied it, so the whole lineage dies and the real user simply logs in again.

---

## Tables and waiter assignments

`restaurant_tables`, `table_waiter_assignments` — migration `0002_init`, partial unique
index in `0005_partial_indexes`.

### `restaurant_tables`

```sql
CREATE TABLE restaurant_tables (
    id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id uuid         NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_number  integer      NOT NULL,
    label         varchar(40),                             -- 'Terrace 2', optional
    capacity      smallint     NOT NULL DEFAULT 4,
    status        table_status NOT NULL DEFAULT 'VACANT',
    is_active     boolean      NOT NULL DEFAULT true,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now(),

    -- Table 1 can exist once per restaurant, but every restaurant may have a Table 1
    CONSTRAINT uq_table_number_per_restaurant UNIQUE (restaurant_id, table_number),
    CONSTRAINT ck_table_number   CHECK (table_number > 0),
    CONSTRAINT ck_table_capacity CHECK (capacity BETWEEN 1 AND 50),

    -- Needed so child tables can point at (id, restaurant_id) together — see below
    CONSTRAINT uq_tables_id_restaurant UNIQUE (id, restaurant_id)
);

CREATE TRIGGER trg_restaurant_tables_updated_at
    BEFORE UPDATE ON restaurant_tables
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**What `UNIQUE (restaurant_id, table_number)` gives you**

```
Restaurant A + Table 1  → allowed
Restaurant A + Table 1  → REJECTED (duplicate)
Restaurant B + Table 1  → allowed  ✅
```

### The composite foreign key trick (tenant safety, enforced by Postgres)

A normal FK only checks that the parent row exists:

```sql
table_waiter_assignments.table_id → restaurant_tables.id
```

Nothing stops Restaurant A's assignment row from pointing at Restaurant B's table.
A **composite** FK on `(table_id, restaurant_id)` closes that hole:

```sql
FOREIGN KEY (table_id, restaurant_id)
    REFERENCES restaurant_tables (id, restaurant_id)
```

For that to work the parent needs `UNIQUE (id, restaurant_id)` — which is exactly the
`uq_tables_id_restaurant` constraint above. We repeat this pattern on every child table.
**This is why the denormalized `restaurant_id` copies can never go wrong.**

### `table_waiter_assignments`

```sql
CREATE TABLE table_waiter_assignments (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id  uuid        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_id       uuid        NOT NULL,
    waiter_user_id uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_by    uuid        REFERENCES users(id) ON DELETE SET NULL,
    assigned_at    timestamptz NOT NULL DEFAULT now(),
    unassigned_at  timestamptz,                       -- NULL = currently active

    CONSTRAINT fk_twa_table
        FOREIGN KEY (table_id, restaurant_id)
        REFERENCES restaurant_tables (id, restaurant_id) ON DELETE CASCADE,

    CONSTRAINT ck_twa_dates
        CHECK (unassigned_at IS NULL OR unassigned_at >= assigned_at)
);

-- Only ONE active waiter per table at a time; history is preserved as closed rows
CREATE UNIQUE INDEX uq_active_assignment_per_table
    ON table_waiter_assignments (table_id)
    WHERE unassigned_at IS NULL;
```

Why a separate table instead of `restaurant_tables.waiter_id`?

- Reassignment history is preserved ("who was serving Table 5 last Friday?").
- The owner screen is literally *about* assigning tables to waiters.
- Adding a second waiter to a busy table later needs no schema change.

Reassigning = close the old row, insert a new one (see [query 21](#21-reassign-a-table-to-a-different-waiter)).

---

## Menu

`menu_categories`, `menu_items` — migration `0002_init`.

### `menu_categories`

```sql
CREATE TABLE menu_categories (
    id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id uuid         NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name          citext       NOT NULL,
    display_order smallint     NOT NULL DEFAULT 0,
    is_active     boolean      NOT NULL DEFAULT true,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now(),

    -- 'Biryani' cannot exist twice in one restaurant (citext ⇒ 'biryani' also blocked)
    CONSTRAINT uq_category_name_per_restaurant UNIQUE (restaurant_id, name),
    CONSTRAINT ck_category_name CHECK (length(btrim(name)) > 0),

    CONSTRAINT uq_categories_id_restaurant UNIQUE (id, restaurant_id)
);

CREATE TRIGGER trg_menu_categories_updated_at
    BEFORE UPDATE ON menu_categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### `menu_items`

```sql
CREATE TABLE menu_items (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id uuid          NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    category_id   uuid          NOT NULL,
    name          citext        NOT NULL,
    description   text,
    price         numeric(10,2) NOT NULL,
    is_veg        boolean,                                  -- NULL = not specified
    is_available  boolean       NOT NULL DEFAULT true,       -- "out of stock today"
    display_order smallint      NOT NULL DEFAULT 0,
    is_active     boolean       NOT NULL DEFAULT true,       -- soft delete
    created_at    timestamptz   NOT NULL DEFAULT now(),
    updated_at    timestamptz   NOT NULL DEFAULT now(),

    -- Item belongs to a category *of the same restaurant* — enforced by the database
    CONSTRAINT fk_items_category
        FOREIGN KEY (category_id, restaurant_id)
        REFERENCES menu_categories (id, restaurant_id) ON DELETE RESTRICT,

    CONSTRAINT uq_item_name_per_category UNIQUE (restaurant_id, category_id, name),
    CONSTRAINT ck_item_price CHECK (price >= 0),
    CONSTRAINT ck_item_name  CHECK (length(btrim(name)) > 0)
);

CREATE TRIGGER trg_menu_items_updated_at
    BEFORE UPDATE ON menu_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

`ON DELETE RESTRICT` on the category FK means: PostgreSQL refuses to delete a category
that still has items. That is the behaviour you want — the owner must move or delete the
items first, so nothing disappears silently.

Difference between the two boolean flags:

| Flag | Meaning | Effect in UI |
|---|---|---|
| `is_available` | Temporarily out of stock | Shown greyed out / hidden today |
| `is_active` | Removed from the menu (soft delete) | Never shown; old orders keep working |

No image columns anywhere — by design.

---

## Sessions and orders

`table_sessions`, `orders`, `order_items` — migration `0002_init`, with
`order_items.line_total` added as a generated column in `0007_generated_columns` and the
partial unique index on open sessions in `0005_partial_indexes`.

### `table_sessions` — one customer group's visit

```sql
CREATE TABLE table_sessions (
    id                 uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id      uuid           NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_id           uuid           NOT NULL,
    opened_by_user_id  uuid           NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    closed_by_user_id  uuid           REFERENCES users(id) ON DELETE RESTRICT,
    status             session_status NOT NULL DEFAULT 'OPEN',
    guest_count        smallint,
    customer_name      varchar(120),
    customer_phone     varchar(20),
    opened_at          timestamptz    NOT NULL DEFAULT now(),
    closed_at          timestamptz,

    CONSTRAINT fk_sessions_table
        FOREIGN KEY (table_id, restaurant_id)
        REFERENCES restaurant_tables (id, restaurant_id) ON DELETE CASCADE,

    CONSTRAINT ck_session_closed
        CHECK (
            (status = 'OPEN'   AND closed_at IS NULL) OR
            (status = 'CLOSED' AND closed_at IS NOT NULL)
        ),

    -- so `orders` can point at (session, table) and (session, restaurant) safely
    CONSTRAINT uq_sessions_id_table      UNIQUE (id, table_id),
    CONSTRAINT uq_sessions_id_restaurant UNIQUE (id, restaurant_id)
);

-- ONE open session per table — the database guarantees a table cannot be
-- "started" twice by two waiters tapping at the same moment.
CREATE UNIQUE INDEX uq_one_open_session_per_table
    ON table_sessions (table_id)
    WHERE status = 'OPEN';

CREATE TRIGGER trg_session_sync_table
    AFTER INSERT OR UPDATE ON table_sessions
    FOR EACH ROW EXECUTE FUNCTION sync_table_status();
```

The `ck_session_closed` CHECK makes the two status columns impossible to contradict:
a session cannot be `CLOSED` without a `closed_at`, and cannot be `OPEN` with one.

### `orders` — one "Send Order to Kitchen" press

```sql
CREATE TABLE orders (
    id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id      uuid         NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_session_id   uuid         NOT NULL,
    table_id           uuid         NOT NULL,           -- denormalized for kitchen display
    order_number       integer      NOT NULL,           -- "#100" — unique per restaurant
    created_by_user_id uuid         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status             order_status NOT NULL DEFAULT 'PENDING',
    note               text,                            -- "less spicy"
    placed_at          timestamptz  NOT NULL DEFAULT now(),
    preparing_at       timestamptz,
    completed_at       timestamptz,
    cancelled_at       timestamptz,
    created_at         timestamptz  NOT NULL DEFAULT now(),
    updated_at         timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT fk_orders_session_restaurant
        FOREIGN KEY (table_session_id, restaurant_id)
        REFERENCES table_sessions (id, restaurant_id) ON DELETE CASCADE,

    -- guarantees orders.table_id always equals the session's table_id
    CONSTRAINT fk_orders_session_table
        FOREIGN KEY (table_session_id, table_id)
        REFERENCES table_sessions (id, table_id) ON DELETE CASCADE,

    CONSTRAINT uq_order_number_per_restaurant UNIQUE (restaurant_id, order_number),

    CONSTRAINT uq_orders_id_restaurant UNIQUE (id, restaurant_id)
);

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_orders_session_open
    BEFORE INSERT ON orders
    FOR EACH ROW EXECUTE FUNCTION assert_session_open();
```

The status timestamps (`preparing_at`, `completed_at`) are what let you report
"average kitchen preparation time" later, for free.

### `order_items` — the line items, with a price snapshot

```sql
CREATE TABLE order_items (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id uuid          NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id      uuid          NOT NULL,
    menu_item_id  uuid          REFERENCES menu_items(id) ON DELETE SET NULL,

    -- SNAPSHOT COLUMNS — copied from menu_items at the moment of ordering
    item_name     varchar(120)  NOT NULL,
    unit_price    numeric(10,2) NOT NULL,

    quantity      integer       NOT NULL,
    line_total    numeric(12,2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
    note          text,
    created_at    timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT fk_order_items_order
        FOREIGN KEY (order_id, restaurant_id)
        REFERENCES orders (id, restaurant_id) ON DELETE CASCADE,

    CONSTRAINT ck_order_item_qty   CHECK (quantity > 0),
    CONSTRAINT ck_order_item_price CHECK (unit_price >= 0)
);
```

### Why `item_name` and `unit_price` are duplicated here — the most important design idea

```
Today:    Chicken Biryani = ₹250   →  customer orders 2  →  bill ₹500
Tomorrow: owner raises it to ₹300
```

If `order_items` only stored `menu_item_id`, yesterday's bill would silently re-price
itself to ₹600. Accounting would be wrong forever.

So at insert time we **copy** name and price into the order line. The order becomes an
immutable historical record:

```
menu_items      →  current, editable price
    │  copy at order time
    ▼
order_items     →  frozen snapshot: what the customer actually agreed to pay
```

`menu_item_id` stays as a nullable link for reporting ("top selling items"), with
`ON DELETE SET NULL` so a hard-deleted item never destroys order history.

`line_total` is a **generated column**: PostgreSQL computes `unit_price * quantity` and
stores it. You cannot insert into it and it can never disagree with its inputs.

---

## Order numbering

`restaurant_counters` in migration `0002_init`; `next_order_number()` in `0003_functions`.

The kitchen screen shows "Order #100". A UUID is unusable for humans, and a global
sequence would leak how many orders other restaurants have. So each restaurant gets its
own counter.

```sql
CREATE TABLE restaurant_counters (
    restaurant_id     uuid    PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
    last_order_number integer NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION next_order_number(p_restaurant_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    v_next integer;
BEGIN
    INSERT INTO restaurant_counters AS c (restaurant_id, last_order_number)
    VALUES (p_restaurant_id, 1)
    ON CONFLICT (restaurant_id)
    DO UPDATE SET last_order_number = c.last_order_number + 1
    RETURNING c.last_order_number INTO v_next;

    RETURN v_next;
END;
$$;
```

This is an **atomic upsert**: the first order creates the counter row at 1, every later
call increments it. `ON CONFLICT DO UPDATE` takes a row lock, so two waiters submitting
at the same millisecond get 101 and 102 — never both 101.

Test it:

```sql
SELECT next_order_number('11111111-1111-1111-1111-111111111111');  -- 1
SELECT next_order_number('11111111-1111-1111-1111-111111111111');  -- 2
```

---

## Indexes

Plain indexes come from `schema.prisma` in `0002_init`; every partial (`WHERE`-filtered)
index below is raw SQL in `0005_partial_indexes`.

An index is a lookup structure. Without one, PostgreSQL reads the whole table
(a "sequential scan"). Rule of thumb: **index every foreign key column, and every column
you regularly filter or sort by.** Every tenant index leads with `restaurant_id`, because
every query filters on it first.

```sql
-- restaurant_users
CREATE INDEX idx_ru_restaurant       ON restaurant_users (restaurant_id, role) WHERE is_active;
CREATE INDEX idx_ru_user             ON restaurant_users (user_id);

-- refresh_tokens
CREATE INDEX idx_refresh_user_active ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_refresh_family      ON refresh_tokens (family_id);
CREATE INDEX idx_refresh_expires     ON refresh_tokens (expires_at);   -- nightly cleanup

-- restaurant_tables
CREATE INDEX idx_tables_restaurant   ON restaurant_tables (restaurant_id, table_number)
                                     WHERE is_active;

-- table_waiter_assignments
CREATE INDEX idx_twa_waiter_active   ON table_waiter_assignments (restaurant_id, waiter_user_id)
                                     WHERE unassigned_at IS NULL;
CREATE INDEX idx_twa_table           ON table_waiter_assignments (table_id);

-- menu
CREATE INDEX idx_categories_rest     ON menu_categories (restaurant_id, display_order)
                                     WHERE is_active;
CREATE INDEX idx_items_category      ON menu_items (restaurant_id, category_id, display_order)
                                     WHERE is_active;

-- fast "search bar" support:  WHERE name ILIKE '%biry%'
CREATE INDEX idx_items_name_trgm     ON menu_items USING gin (name gin_trgm_ops);

-- table_sessions
CREATE INDEX idx_sessions_open       ON table_sessions (restaurant_id, table_id)
                                     WHERE status = 'OPEN';
CREATE INDEX idx_sessions_history    ON table_sessions (restaurant_id, opened_at DESC);

-- orders  (the kitchen dashboard's main query)
CREATE INDEX idx_orders_kitchen      ON orders (restaurant_id, status, placed_at)
                                     WHERE status IN ('PENDING', 'PREPARING');
CREATE INDEX idx_orders_session      ON orders (table_session_id);
CREATE INDEX idx_orders_reporting    ON orders (restaurant_id, placed_at DESC);
CREATE INDEX idx_orders_creator      ON orders (created_by_user_id);

-- order_items
CREATE INDEX idx_order_items_order   ON order_items (order_id);
CREATE INDEX idx_order_items_menu    ON order_items (restaurant_id, menu_item_id);
```

Why the `WHERE` clauses? A **partial index** only indexes rows that match, so
`idx_orders_kitchen` stays tiny forever — it ignores the millions of `COMPLETED` rows
the kitchen board never asks about.

---

## Seed data

Implemented in `backend/prisma/seed.ts` (`npx prisma db seed`). One restaurant, four
users, eight tables, five categories, ten items, all tables assigned to a waiter. The SQL
below specifies exactly which rows must exist — including the fixed UUIDs, which API tests
depend on.

```sql
BEGIN;

-- Fixed UUIDs so you can copy-paste them into API tests
INSERT INTO restaurants (id, name, slug, phone, tax_percent)
VALUES ('11111111-1111-1111-1111-111111111111',
        'Spice Garden', 'spice-garden', '+91-9000000000', 5.00);

-- Password for all seed users is "password123".
-- seed.ts hashes it at run time: await argon2.hash('password123', { type: argon2.argon2id })
INSERT INTO users (id, name, email, password_hash) VALUES
 ('a0000000-0000-0000-0000-000000000001','Raj',   'owner@spice.com',   '$argon2id$REPLACE_WITH_REAL_HASH'),
 ('a0000000-0000-0000-0000-000000000002','Amit',  'amit@spice.com',    '$argon2id$REPLACE_WITH_REAL_HASH'),
 ('a0000000-0000-0000-0000-000000000003','Suresh','suresh@spice.com',  '$argon2id$REPLACE_WITH_REAL_HASH'),
 ('a0000000-0000-0000-0000-000000000004','Rahul', 'kitchen@spice.com', '$argon2id$REPLACE_WITH_REAL_HASH');

INSERT INTO restaurant_users (restaurant_id, user_id, role) VALUES
 ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000001','OWNER'),
 ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000002','WAITER'),
 ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000003','WAITER'),
 ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000004','KITCHEN');

-- Tables 1..8, capacity 4
INSERT INTO restaurant_tables (restaurant_id, table_number, capacity)
SELECT '11111111-1111-1111-1111-111111111111', n, 4
FROM generate_series(1, 8) AS n;

-- Categories
INSERT INTO menu_categories (id, restaurant_id, name, display_order) VALUES
 ('c0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Starters',    1),
 ('c0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Biryani',     2),
 ('c0000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','Main Course', 3),
 ('c0000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','Drinks',      4),
 ('c0000000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','Desserts',    5);

-- Items
INSERT INTO menu_items (restaurant_id, category_id, name, price, is_veg) VALUES
 ('11111111-1111-1111-1111-111111111111','c0000000-0000-0000-0000-000000000001','Paneer Tikka',    220.00, true),
 ('11111111-1111-1111-1111-111111111111','c0000000-0000-0000-0000-000000000001','Chicken 65',      240.00, false),
 ('11111111-1111-1111-1111-111111111111','c0000000-0000-0000-0000-000000000002','Chicken Biryani', 250.00, false),
 ('11111111-1111-1111-1111-111111111111','c0000000-0000-0000-0000-000000000002','Mutton Biryani',  320.00, false),
 ('11111111-1111-1111-1111-111111111111','c0000000-0000-0000-0000-000000000002','Veg Biryani',     180.00, true),
 ('11111111-1111-1111-1111-111111111111','c0000000-0000-0000-0000-000000000003','Butter Naan',      50.00, true),
 ('11111111-1111-1111-1111-111111111111','c0000000-0000-0000-0000-000000000003','Dal Tadka',       160.00, true),
 ('11111111-1111-1111-1111-111111111111','c0000000-0000-0000-0000-000000000004','Coke',             60.00, true),
 ('11111111-1111-1111-1111-111111111111','c0000000-0000-0000-0000-000000000004','Masala Chai',      40.00, true),
 ('11111111-1111-1111-1111-111111111111','c0000000-0000-0000-0000-000000000005','Gulab Jamun',      90.00, true);

-- Assign tables 1-4 to Amit, 5-8 to Suresh
INSERT INTO table_waiter_assignments (restaurant_id, table_id, waiter_user_id, assigned_by)
SELECT t.restaurant_id,
       t.id,
       CASE WHEN t.table_number <= 4
            THEN 'a0000000-0000-0000-0000-000000000002'::uuid
            ELSE 'a0000000-0000-0000-0000-000000000003'::uuid END,
       'a0000000-0000-0000-0000-000000000001'::uuid
FROM restaurant_tables t
WHERE t.restaurant_id = '11111111-1111-1111-1111-111111111111';

COMMIT;
```

---

## Example queries — Auth & staff

Throughout, `$1`, `$2` … are **parameter placeholders**. Always pass values this way from
Node — never build SQL by string concatenation, or you invite SQL injection.

### 1. Sign up a new restaurant + its owner (one transaction)

```sql
BEGIN;

WITH new_restaurant AS (
    INSERT INTO restaurants (name, slug, phone)
    VALUES ($1, $2, $3)
    RETURNING id
),
new_user AS (
    INSERT INTO users (name, email, password_hash)
    VALUES ($4, $5, $6)
    RETURNING id
)
INSERT INTO restaurant_users (restaurant_id, user_id, role)
SELECT r.id, u.id, 'OWNER'
FROM new_restaurant r, new_user u
RETURNING restaurant_id, user_id, role;

COMMIT;
```

A `WITH` block (a CTE, "Common Table Expression") is a named temporary result. Because
all three statements run in one query, either every row is created or none is.

### 2. Login — fetch the user and all their memberships

```sql
SELECT
    u.id,
    u.name,
    u.email,
    u.password_hash,
    u.is_active,
    COALESCE(
        json_agg(
            json_build_object(
                'restaurant_id',   r.id,
                'restaurant_name', r.name,
                'role',            ru.role
            )
        ) FILTER (WHERE ru.id IS NOT NULL),
        '[]'
    ) AS memberships
FROM users u
LEFT JOIN restaurant_users ru
       ON ru.user_id = u.id AND ru.is_active
LEFT JOIN restaurants r
       ON r.id = ru.restaurant_id AND r.is_active
WHERE u.email = $1
  AND u.is_active
GROUP BY u.id;
```

Node then compares the submitted password against `password_hash` with
`argon2.verify(row.password_hash, submittedPassword)` and signs an access JWT containing
`{ sub: userId, rid: restaurantId, role }` (same claim names as `backend/CLAUDE.md`).

`FILTER (WHERE …)` stops `json_agg` from producing `[null]` when a user has no membership.

### 3. Record the login timestamp

```sql
UPDATE users
SET last_login_at = now()
WHERE id = $1;
```

### 3a. Issue a refresh token (on login — starts a new family)

```sql
INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
VALUES ($1, $2, now() + interval '7 days', $3, $4)
RETURNING id, family_id, expires_at;
```

`family_id` defaults to a fresh UUID, so every login begins its own lineage. Put the
returned `id` into the JWT's `jti` claim and `family_id` into `fid`.

> The literal `interval '7 days'` here and in 3c must match `JWT_REFRESH_TTL` in
> `backend/CLAUDE.md` → *Environment variables*. In the Nest `TokenService`, pass the
> configured TTL as a parameter (`now() + $5::interval`) rather than hard-coding it twice.

### 3b. Fetch a candidate token for rotation

```sql
SELECT id, user_id, family_id, token_hash, expires_at, revoked_at
FROM refresh_tokens
WHERE id = $1          -- the jti from the presented JWT
  AND user_id = $2;    -- the sub, so a token cannot be used against another account
```

Then in Node: `argon2.verify(row.token_hash, presentedToken)`.
Decision table for what comes back:

| Condition | Meaning | Action |
|---|---|---|
| no row | forged or purged | 401 |
| `argon2.verify` fails | forged | 401 |
| `expires_at < now()` | expired | 401, log in again |
| `revoked_at IS NOT NULL` | **replayed — theft** | run query 3d, then 401 |
| otherwise | valid | rotate with query 3c |

### 3c. Rotate — revoke the old row and issue its replacement

```sql
BEGIN;

WITH new_token AS (
    INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, user_agent, ip)
    SELECT user_id, family_id, $2, now() + interval '7 days', $3, $4
    FROM refresh_tokens
    WHERE id = $1
    RETURNING id, family_id, expires_at
)
UPDATE refresh_tokens
SET revoked_at     = now(),
    revoked_reason = 'ROTATED',
    replaced_by_id = (SELECT id FROM new_token)
WHERE id = $1
  AND revoked_at IS NULL          -- ← guard: two parallel refreshes, only one wins
RETURNING replaced_by_id;

COMMIT;
```

The `AND revoked_at IS NULL` is the same guarded-update pattern used for order statuses:
if two requests refresh simultaneously, exactly one updates a row and the other gets 0 rows
back and is rejected.

### 3d. Reuse detected — kill the whole family

```sql
UPDATE refresh_tokens
SET revoked_at     = now(),
    revoked_reason = 'REUSE_DETECTED'
WHERE family_id = $1
  AND revoked_at IS NULL
RETURNING id;
```

### 3e. Logout (this device) and logout everywhere

```sql
-- this device: revoke the current lineage
UPDATE refresh_tokens
SET revoked_at = now(), revoked_reason = 'LOGOUT'
WHERE family_id = $1 AND revoked_at IS NULL;

-- all devices: after a password change, revoke everything the user has
UPDATE refresh_tokens
SET revoked_at = now(), revoked_reason = 'LOGOUT'
WHERE user_id = $1 AND revoked_at IS NULL;
```

### 3f. Active sessions list ("you are logged in on 3 devices")

```sql
SELECT id, user_agent, ip, created_at, expires_at
FROM refresh_tokens
WHERE user_id = $1
  AND revoked_at IS NULL
  AND expires_at > now()
ORDER BY created_at DESC;
```

### 3g. Nightly cleanup

```sql
DELETE FROM refresh_tokens
WHERE expires_at < now() - interval '30 days';
```

Keep revoked rows for a while — they are what makes reuse detection possible. Deleting a
revoked token immediately would turn a replay attack back into a silent 401.

### 4. Owner creates a waiter (user + membership, one transaction)

```sql
BEGIN;

WITH new_user AS (
    INSERT INTO users (name, email, password_hash)
    VALUES ($2, $3, $4)
    ON CONFLICT (email) DO NOTHING          -- email already taken → 0 rows
    RETURNING id
)
INSERT INTO restaurant_users (restaurant_id, user_id, role, created_by)
SELECT $1, id, $5::user_role, $6
FROM new_user
RETURNING id, restaurant_id, user_id, role;

COMMIT;
```

If this returns 0 rows, the email already exists → return HTTP 409 from the API.
If `$5` is `'KITCHEN'` and one already exists, the partial unique index raises
`23505` → also a 409.

### 5. List all staff of a restaurant

```sql
SELECT
    ru.id            AS membership_id,
    u.id             AS user_id,
    u.name,
    u.email,
    u.phone,
    ru.role,
    ru.is_active,
    u.last_login_at,
    ru.created_at
FROM restaurant_users ru
JOIN users u ON u.id = ru.user_id
WHERE ru.restaurant_id = $1
ORDER BY
    CASE ru.role WHEN 'OWNER' THEN 1 WHEN 'KITCHEN' THEN 2 ELSE 3 END,
    u.name;
```

### 6. Deactivate a staff member (never `DELETE`)

```sql
UPDATE restaurant_users
SET is_active = false
WHERE restaurant_id = $1
  AND user_id = $2
  AND role <> 'OWNER'          -- guard: cannot deactivate the owner
RETURNING id;
```

Deleting a user would break `orders.created_by_user_id` (which is `ON DELETE RESTRICT`
precisely to stop that). Soft delete keeps history readable.

### 7. Change a staff password

```sql
UPDATE users
SET password_hash = $2
WHERE id = $1
  AND EXISTS (                                    -- only staff of MY restaurant
      SELECT 1 FROM restaurant_users
      WHERE user_id = $1 AND restaurant_id = $3
  )
RETURNING id;
```

That `EXISTS` clause is a tenant check: an owner cannot reset a password belonging to
another restaurant's user.

---

## Example queries — Menu

### 8. Create a category

```sql
INSERT INTO menu_categories (restaurant_id, name, display_order)
VALUES ($1, $2, COALESCE($3, 0))
RETURNING id, name, display_order, is_active, created_at;
```

Duplicate name in the same restaurant → error `23505` → HTTP 409.

### 9. List categories (owner's menu screen and the waiter's left 30% column)

```sql
SELECT
    c.id,
    c.name,
    c.display_order,
    COUNT(i.id) FILTER (WHERE i.is_active) AS item_count
FROM menu_categories c
LEFT JOIN menu_items i ON i.category_id = c.id
WHERE c.restaurant_id = $1
  AND c.is_active
GROUP BY c.id
ORDER BY c.display_order, c.name;
```

### 10. Create an item inside a category

```sql
INSERT INTO menu_items (restaurant_id, category_id, name, description, price, is_veg)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, name, price, is_available, created_at;
```

If `$2` is a category from another restaurant, the composite FK `fk_items_category`
rejects it — SQLSTATE `23503`. The database blocks the cross-tenant write even if the API
forgot to check.

### 11. Items of one category (the waiter's right 70% column)

```sql
SELECT id, name, description, price, is_veg, is_available
FROM menu_items
WHERE restaurant_id = $1
  AND category_id   = $2
  AND is_active
ORDER BY display_order, name;
```

### 12. Search bar — items matching a keyword across all categories

```sql
SELECT
    i.id,
    i.name,
    i.price,
    i.is_available,
    c.name AS category_name
FROM menu_items i
JOIN menu_categories c ON c.id = i.category_id
WHERE i.restaurant_id = $1
  AND i.is_active
  AND i.name ILIKE '%' || $2 || '%'
ORDER BY i.name
LIMIT 50;
```

`ILIKE` = case-insensitive `LIKE`. The `gin_trgm_ops` index from
[Indexes](#indexes) is what keeps a leading-wildcard search fast.

### 13. Whole menu in one round trip (nested JSON, ideal for `GET /api/menu`)

```sql
SELECT json_agg(cat ORDER BY cat.display_order, cat.name) AS menu
FROM (
    SELECT
        c.id,
        c.name,
        c.display_order,
        COALESCE(
            json_agg(
                json_build_object(
                    'id',           i.id,
                    'name',         i.name,
                    'price',        i.price,
                    'is_veg',       i.is_veg,
                    'is_available', i.is_available
                ) ORDER BY i.display_order, i.name
            ) FILTER (WHERE i.id IS NOT NULL AND i.is_active),
            '[]'
        ) AS items
    FROM menu_categories c
    LEFT JOIN menu_items i ON i.category_id = c.id
    WHERE c.restaurant_id = $1
      AND c.is_active
    GROUP BY c.id
) AS cat;
```

Returns exactly the shape React wants:

```json
[{ "id": "...", "name": "Biryani", "items": [{ "id": "...", "name": "Chicken Biryani", "price": "250.00" }] }]
```

### 14. Update an item's price

```sql
UPDATE menu_items
SET name = COALESCE($3, name),
    price = COALESCE($4, price),
    is_available = COALESCE($5, is_available)
WHERE id = $2
  AND restaurant_id = $1        -- ← the tenant guard, never omit it
RETURNING id, name, price, is_available;
```

`COALESCE($3, name)` = "use the new value if provided, otherwise keep the old one" —
a clean pattern for PATCH endpoints. Past orders are unaffected because they hold a
price snapshot.

### 15. Toggle availability / soft-delete an item

```sql
-- out of stock today
UPDATE menu_items SET is_available = false
WHERE id = $2 AND restaurant_id = $1;

-- remove from the menu permanently (soft delete)
UPDATE menu_items SET is_active = false, is_available = false
WHERE id = $2 AND restaurant_id = $1;
```

### 16. Delete a category safely

```sql
DELETE FROM menu_categories
WHERE id = $2
  AND restaurant_id = $1
  AND NOT EXISTS (
      SELECT 1 FROM menu_items
      WHERE category_id = $2 AND is_active
  )
RETURNING id;
```

0 rows returned = the category still has items → tell the owner to move them first.

---

## Example queries — Tables & assignments

### 17. Create tables in bulk

```sql
INSERT INTO restaurant_tables (restaurant_id, table_number, capacity)
SELECT $1, n, $4
FROM generate_series($2::int, $3::int) AS n
ON CONFLICT (restaurant_id, table_number) DO NOTHING
RETURNING id, table_number, capacity;
```

`generate_series(1, 10)` produces the numbers 1…10 — one insert statement, ten tables.

### 18. Owner's table grid — every table, its waiter, its live status and running total

```sql
SELECT
    t.id,
    t.table_number,
    t.capacity,
    t.status,
    w.id                       AS waiter_id,
    w.name                     AS waiter_name,
    s.id                       AS session_id,
    s.opened_at,
    COALESCE(SUM(oi.line_total), 0) AS running_total,
    COUNT(DISTINCT o.id)            AS order_count
FROM restaurant_tables t
LEFT JOIN table_waiter_assignments a
       ON a.table_id = t.id AND a.unassigned_at IS NULL
LEFT JOIN users w
       ON w.id = a.waiter_user_id
LEFT JOIN table_sessions s
       ON s.table_id = t.id AND s.status = 'OPEN'
LEFT JOIN orders o
       ON o.table_session_id = s.id AND o.status <> 'CANCELLED'
LEFT JOIN order_items oi
       ON oi.order_id = o.id
WHERE t.restaurant_id = $1
  AND t.is_active
GROUP BY t.id, w.id, w.name, s.id, s.opened_at
ORDER BY t.table_number;
```

This one query drives the whole owner "Tables" screen. `LEFT JOIN` is essential — a
vacant table has no session and no orders, and must still appear in the list.

### 19. Waiter's dashboard — only the tables assigned to *me*

```sql
SELECT
    t.id,
    t.table_number,
    t.capacity,
    t.status,
    s.id        AS session_id,
    s.opened_at,
    COALESCE(SUM(oi.line_total), 0) AS running_total
FROM table_waiter_assignments a
JOIN restaurant_tables t
     ON t.id = a.table_id
LEFT JOIN table_sessions s
     ON s.table_id = t.id AND s.status = 'OPEN'
LEFT JOIN orders o
     ON o.table_session_id = s.id AND o.status <> 'CANCELLED'
LEFT JOIN order_items oi
     ON oi.order_id = o.id
WHERE a.restaurant_id  = $1
  AND a.waiter_user_id = $2
  AND a.unassigned_at IS NULL
  AND t.is_active
GROUP BY t.id, s.id, s.opened_at
ORDER BY t.table_number;
```

`t.status` is `VACANT` or `OCCUPIED` — exactly the two states the waiter's cards show.

### 20. Assign a table to a waiter (with a role check baked in)

```sql
INSERT INTO table_waiter_assignments (restaurant_id, table_id, waiter_user_id, assigned_by)
SELECT $1, $2, $3, $4
WHERE EXISTS (
    SELECT 1 FROM restaurant_users
    WHERE restaurant_id = $1 AND user_id = $3 AND role = 'WAITER' AND is_active
)
RETURNING id, table_id, waiter_user_id, assigned_at;
```

0 rows = `$3` is not an active waiter of this restaurant. If the table already has an
active waiter, `uq_active_assignment_per_table` raises `23505` — use query 21 instead.

### 21. Reassign a table to a different waiter

```sql
BEGIN;

UPDATE table_waiter_assignments
SET unassigned_at = now()
WHERE table_id = $2
  AND restaurant_id = $1
  AND unassigned_at IS NULL;

INSERT INTO table_waiter_assignments (restaurant_id, table_id, waiter_user_id, assigned_by)
VALUES ($1, $2, $3, $4)
RETURNING id;

COMMIT;
```

Both statements succeed together or neither does — that is what the transaction buys you.

### 22. Assignment history for one table

```sql
SELECT u.name AS waiter, a.assigned_at, a.unassigned_at
FROM table_waiter_assignments a
JOIN users u ON u.id = a.waiter_user_id
WHERE a.restaurant_id = $1 AND a.table_id = $2
ORDER BY a.assigned_at DESC;
```

---

## Example queries — Sessions

### 23. Start (or reuse) a session — "Take Order" on a vacant table

The waiter may double-tap, or the owner and the waiter may tap simultaneously. This query
is **idempotent**: it either creates the session or returns the one that already exists.

```sql
WITH inserted AS (
    INSERT INTO table_sessions (restaurant_id, table_id, opened_by_user_id, guest_count)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (table_id) WHERE status = 'OPEN'
    DO NOTHING
    RETURNING *
)
SELECT * FROM inserted
UNION ALL
SELECT * FROM table_sessions
WHERE table_id = $2
  AND restaurant_id = $1
  AND status = 'OPEN'
  AND NOT EXISTS (SELECT 1 FROM inserted);
```

`ON CONFLICT (table_id) WHERE status = 'OPEN'` targets the partial unique index
`uq_one_open_session_per_table`. The `sync_table_status` trigger flips the table to
`OCCUPIED` automatically.

### 24. Get the open session for a table

```sql
SELECT s.*, u.name AS opened_by_name
FROM table_sessions s
JOIN users u ON u.id = s.opened_by_user_id
WHERE s.restaurant_id = $1
  AND s.table_id = $2
  AND s.status = 'OPEN';
```

### 25. Full session detail — every order and every item (the "table detail" screen)

```sql
SELECT
    o.id,
    o.order_number,
    o.status,
    o.note,
    o.placed_at,
    u.name AS placed_by,
    COALESCE(
        json_agg(
            json_build_object(
                'id',         oi.id,
                'name',       oi.item_name,
                'unit_price', oi.unit_price,
                'quantity',   oi.quantity,
                'line_total', oi.line_total
            ) ORDER BY oi.created_at
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'
    ) AS items,
    COALESCE(SUM(oi.line_total), 0) AS order_total
FROM orders o
JOIN users u ON u.id = o.created_by_user_id
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE o.table_session_id = $2
  AND o.restaurant_id    = $1
GROUP BY o.id, u.name
ORDER BY o.placed_at;
```

---

## Example queries — Taking an order

This is the most important transaction in the application. The waiter picks items, hits
**Preview**, then **Send Order to Kitchen**. Node sends one JSON array of
`{ menu_item_id, quantity }` and the database does the rest.

### 26. Place an order — the complete transaction

```sql
BEGIN;

-- Step 1: lock the session and confirm it is open and belongs to this tenant.
--         FOR UPDATE holds the row until COMMIT so no one closes it mid-flight.
SELECT id, table_id, restaurant_id
FROM table_sessions
WHERE id = $2
  AND restaurant_id = $1
  AND status = 'OPEN'
FOR UPDATE;
-- 0 rows → ROLLBACK and return HTTP 409 "table session is not open"

-- Step 2: create the order header with the next per-restaurant order number
INSERT INTO orders (restaurant_id, table_session_id, table_id,
                    order_number, created_by_user_id, note)
SELECT s.restaurant_id,
       s.id,
       s.table_id,
       next_order_number(s.restaurant_id),
       $3,
       $4
FROM table_sessions s
WHERE s.id = $2
RETURNING id, order_number, status, placed_at;
-- keep the returned id as :order_id

-- Step 3: insert the items, snapshotting name and price straight from menu_items.
--         The client sends only ids and quantities — prices come from the database,
--         never from the browser.
INSERT INTO order_items (restaurant_id, order_id, menu_item_id,
                         item_name, unit_price, quantity, note)
SELECT mi.restaurant_id,
       $5::uuid,                          -- :order_id from step 2
       mi.id,
       mi.name,
       mi.price,
       x.quantity,
       x.note
FROM jsonb_to_recordset($6::jsonb)
     AS x(menu_item_id uuid, quantity int, note text)
JOIN menu_items mi
     ON mi.id = x.menu_item_id
    AND mi.restaurant_id = $1             -- tenant guard
WHERE mi.is_active
  AND mi.is_available
  AND x.quantity > 0
RETURNING id;

-- Step 4: sanity check — did every requested item actually insert?
--         If a row was dropped (unavailable / wrong tenant), abort the whole order.
SELECT count(*) FROM order_items WHERE order_id = $5::uuid;

COMMIT;
```

`$6` is a JSON string sent from Node:

```json
[
  { "menu_item_id": "...", "quantity": 2, "note": null },
  { "menu_item_id": "...", "quantity": 2, "note": "no ice" }
]
```

`jsonb_to_recordset` turns that JSON array into rows you can `JOIN` — one round trip for
the whole cart instead of one `INSERT` per item.

**Why prices are looked up server-side:** if the browser sent `unit_price`, a user could
edit the request and order a ₹320 biryani for ₹1. The `JOIN menu_items` makes the price
authoritative.

### 27. What the client sends vs. what gets stored

Request body:

```json
{ "items": [{ "menu_item_id": "…biryani…", "quantity": 2 },
            { "menu_item_id": "…coke…",    "quantity": 2 }] }
```

Resulting rows:

| order_id | menu_item_id | item_name | unit_price | quantity | line_total |
|---|---|---|---:|---:|---:|
| 100 | …biryani… | Chicken Biryani | 250.00 | 2 | 500.00 |
| 100 | …coke… | Coke | 60.00 | 2 | 120.00 |

`line_total` was computed by PostgreSQL — no application arithmetic involved.

### 28. Cancel an order (only while still PENDING)

```sql
UPDATE orders
SET status = 'CANCELLED', cancelled_at = now()
WHERE id = $2
  AND restaurant_id = $1
  AND status = 'PENDING'
RETURNING id, status;
```

---

## Example queries — Kitchen dashboard

### 29. The three-column board (PENDING / PREPARING / COMPLETED)

Each order comes back as one row with its items pre-aggregated into JSON — which is what
lets React draw each order as one bordered card holding all its items together.

```sql
SELECT
    o.id,
    o.order_number,
    o.status,
    o.note,
    o.placed_at,
    o.preparing_at,
    o.completed_at,
    t.table_number,
    u.name AS placed_by,
    EXTRACT(EPOCH FROM (now() - o.placed_at))::int AS age_seconds,
    COALESCE(
        json_agg(
            json_build_object(
                'name',     oi.item_name,
                'quantity', oi.quantity,
                'note',     oi.note
            ) ORDER BY oi.created_at
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'
    ) AS items
FROM orders o
JOIN restaurant_tables t ON t.id = o.table_id
JOIN users u             ON u.id = o.created_by_user_id
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE o.restaurant_id = $1
  AND o.status IN ('PENDING', 'PREPARING', 'COMPLETED')
  AND o.placed_at >= date_trunc('day', now() AT TIME ZONE $2)   -- $2 = 'Asia/Kolkata'
GROUP BY o.id, t.table_number, u.name
-- Each column answers a different question, so each sorts on its own timestamp.
-- One ORDER BY, because the rows arrive as a single result set and are bucketed
-- in Node. Every CASE is NULL outside its own status, so it is inert for the
-- other two groups and they fall through to placed_at.
--
--   PENDING    placed_at ASC     what has been waiting longest to start
--   PREPARING  preparing_at ASC  the queue actually being cooked, in order
--   COMPLETED  completed_at DESC what just came off the pass
--
-- Sorting all three by placed_at is wrong for two of them: an order placed
-- early but started late jumps the PREPARING queue, and COMPLETED buries the
-- most recent plate at the bottom.
ORDER BY CASE WHEN o.status = 'COMPLETED' THEN o.completed_at END DESC NULLS LAST,
         CASE WHEN o.status = 'PREPARING' THEN o.preparing_at END ASC  NULLS LAST,
         o.placed_at ASC;
```

Node groups the rows into three arrays by `status` and returns:

```json
{ "PENDING": [...], "PREPARING": [...], "COMPLETED": [...] }
```

`age_seconds` lets the UI turn a card red when an order has waited too long.

### 30. Move an order PENDING → PREPARING (guarded transition)

```sql
UPDATE orders
SET status = 'PREPARING', preparing_at = now()
WHERE id = $2
  AND restaurant_id = $1
  AND status = 'PENDING'          -- ← only a valid transition succeeds
RETURNING id, order_number, status, preparing_at, table_id;
```

This pattern is reused throughout the codebase. By putting the *expected
current state* into the `WHERE` clause, two simultaneous clicks cannot both succeed. The
first updates one row; the second matches nothing and returns 0 rows, so the API answers
409 "order already moved". No locks, no race conditions.

### 31. Move PREPARING → COMPLETED

```sql
UPDATE orders
SET status = 'COMPLETED', completed_at = now()
WHERE id = $2
  AND restaurant_id = $1
  AND status = 'PREPARING'
RETURNING id, order_number, status, completed_at, table_id;
```

### 31a. Move COMPLETED → PREPARING (undo a mistaken complete)

The kitchen handler taps "Mark complete" on the wrong card. Same guarded shape,
with two details that matter:

```sql
UPDATE orders
SET status       = 'PREPARING',
    completed_at = NULL,
    -- preparing_at is deliberately NOT touched.
    preparing_at = COALESCE(preparing_at, now())
WHERE id = $2
  AND restaurant_id = $1
  AND status = 'COMPLETED'
RETURNING id, order_number, status, preparing_at, table_id;
```

**`preparing_at` is preserved.** Query 29 orders the PREPARING column by it, so
keeping the original value returns the card to the position in the queue it left
rather than to the back of it — which is the entire point of an undo. The
`COALESCE` only covers an order that somehow reached COMPLETED without ever
being stamped, so it cannot sort as NULL.

**The caller must also check the session is still OPEN.** `assert_session_open`
is a `BEFORE INSERT` trigger, so nothing in the database stops this `UPDATE`
parking a PREPARING order under a session that has already been closed and
billed — and query 36 refuses to close a session while orders are in progress.
Allowing it would manufacture a state the rest of the schema says cannot exist,
so the API answers 409 `SESSION_NOT_OPEN` instead.

### 32. Generic guarded transition (one query for both moves)

```sql
UPDATE orders
SET status       = $4::order_status,
    preparing_at = CASE WHEN $4 = 'PREPARING' THEN now() ELSE preparing_at END,
    completed_at = CASE WHEN $4 = 'COMPLETED' THEN now() ELSE completed_at END
WHERE id = $2
  AND restaurant_id = $1
  AND status = $3::order_status
RETURNING id, order_number, status;
```

`$3` = expected current status, `$4` = new status. The API supplies the legal pairs.

### 33. Live kitchen counters (badges on the columns)

```sql
SELECT status, COUNT(*) AS count
FROM orders
WHERE restaurant_id = $1
  AND placed_at >= date_trunc('day', now() AT TIME ZONE $2)
GROUP BY status;
```

---

## Example queries — Bill & closing a table

### 34. Bill lines for a session (identical items merged)

```sql
SELECT
    oi.item_name,
    oi.unit_price,
    SUM(oi.quantity)   AS quantity,
    SUM(oi.line_total) AS amount
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.table_session_id = $2
  AND o.restaurant_id    = $1
  AND o.status <> 'CANCELLED'
GROUP BY oi.item_name, oi.unit_price
ORDER BY oi.item_name;
```

### 35. Bill totals with tax

```sql
WITH lines AS (
    SELECT SUM(oi.line_total) AS subtotal
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.table_session_id = $2
      AND o.restaurant_id    = $1
      AND o.status <> 'CANCELLED'
)
SELECT
    COALESCE(l.subtotal, 0)                                          AS subtotal,
    r.tax_percent,
    ROUND(COALESCE(l.subtotal, 0) * r.tax_percent / 100, 2)          AS tax_amount,
    ROUND(COALESCE(l.subtotal, 0) * (1 + r.tax_percent / 100), 2)    AS grand_total,
    r.currency
FROM restaurants r
CROSS JOIN lines l
WHERE r.id = $1;
```

### 36. Full bill payload for the print screen

```sql
SELECT
    r.name         AS restaurant_name,
    r.address,
    r.phone,
    t.table_number,
    s.opened_at,
    s.guest_count,
    u.name         AS served_by,
    (SELECT json_agg(x) FROM (
        SELECT oi.item_name, oi.unit_price,
               SUM(oi.quantity) AS quantity, SUM(oi.line_total) AS amount
        FROM order_items oi
        JOIN orders o2 ON o2.id = oi.order_id
        WHERE o2.table_session_id = s.id AND o2.status <> 'CANCELLED'
        GROUP BY oi.item_name, oi.unit_price
        ORDER BY oi.item_name
    ) x) AS lines
FROM table_sessions s
JOIN restaurants r        ON r.id = s.restaurant_id
JOIN restaurant_tables t  ON t.id = s.table_id
JOIN users u              ON u.id = s.opened_by_user_id
WHERE s.id = $2
  AND s.restaurant_id = $1;
```

### 37. Close the table — the checkout transaction

```sql
BEGIN;

-- 1. Lock the session; must still be OPEN and mine
SELECT id, table_id
FROM table_sessions
WHERE id = $2 AND restaurant_id = $1 AND status = 'OPEN'
FOR UPDATE;
-- 0 rows → ROLLBACK, HTTP 409

-- 2. Refuse to close while the kitchen is still cooking
SELECT COUNT(*) AS unfinished
FROM orders
WHERE table_session_id = $2
  AND status IN ('PENDING', 'PREPARING');
-- unfinished > 0 → ROLLBACK, HTTP 409 "orders still in the kitchen"

-- 3. Close it. The sync_table_status trigger flips the table back to VACANT.
UPDATE table_sessions
SET status = 'CLOSED',
    closed_at = now(),
    closed_by_user_id = $3
WHERE id = $2
RETURNING id, closed_at;

COMMIT;
```

You do **not** update `restaurant_tables.status` here — the trigger from
[Helper functions and triggers](#helper-functions-and-triggers) already did it. One source
of truth, no drift.

### 38. Session history for a table

```sql
SELECT
    s.id,
    s.opened_at,
    s.closed_at,
    s.closed_at - s.opened_at AS duration,
    u.name AS served_by,
    COALESCE(SUM(oi.line_total), 0) AS total
FROM table_sessions s
JOIN users u ON u.id = s.opened_by_user_id
LEFT JOIN orders o      ON o.table_session_id = s.id AND o.status <> 'CANCELLED'
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE s.restaurant_id = $1
  AND s.table_id      = $2
  AND s.status = 'CLOSED'
GROUP BY s.id, u.name
ORDER BY s.opened_at DESC
LIMIT 20;
```

---

## Example queries — Reports

### 39. Today's sales summary

```sql
SELECT
    COUNT(DISTINCT s.id)            AS sessions_served,
    COUNT(DISTINCT o.id)            AS orders_placed,
    COALESCE(SUM(oi.line_total), 0) AS revenue,
    ROUND(COALESCE(SUM(oi.line_total), 0)
          / NULLIF(COUNT(DISTINCT s.id), 0), 2) AS avg_bill
FROM table_sessions s
LEFT JOIN orders o       ON o.table_session_id = s.id AND o.status <> 'CANCELLED'
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE s.restaurant_id = $1
  AND s.opened_at >= date_trunc('day', now() AT TIME ZONE $2);
```

`NULLIF(x, 0)` turns a zero denominator into `NULL`, so you get `NULL` instead of a
division-by-zero error on a quiet day.

### 40. Revenue per day, last 30 days

```sql
SELECT
    date_trunc('day', o.placed_at AT TIME ZONE $2)::date AS day,
    COUNT(DISTINCT o.id)            AS orders,
    COALESCE(SUM(oi.line_total), 0) AS revenue
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.restaurant_id = $1
  AND o.status <> 'CANCELLED'
  AND o.placed_at >= now() - interval '30 days'
GROUP BY day
ORDER BY day;
```

### 41. Top 10 selling items

```sql
SELECT
    oi.item_name,
    SUM(oi.quantity)   AS units_sold,
    SUM(oi.line_total) AS revenue
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE oi.restaurant_id = $1
  AND o.status <> 'CANCELLED'
  AND o.placed_at >= $2
GROUP BY oi.item_name
ORDER BY units_sold DESC
LIMIT 10;
```

### 42. Waiter performance

```sql
SELECT
    u.name                          AS waiter,
    COUNT(DISTINCT o.id)            AS orders_taken,
    COUNT(DISTINCT o.table_session_id) AS tables_served,
    COALESCE(SUM(oi.line_total), 0) AS revenue
FROM orders o
JOIN users u             ON u.id = o.created_by_user_id
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE o.restaurant_id = $1
  AND o.status <> 'CANCELLED'
  AND o.placed_at >= $2
GROUP BY u.id, u.name
ORDER BY revenue DESC;
```

### 43. Average kitchen preparation time

```sql
SELECT
    ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - placed_at)) / 60)::numeric, 1)
        AS avg_minutes,
    ROUND(MAX(EXTRACT(EPOCH FROM (completed_at - placed_at)) / 60)::numeric, 1)
        AS worst_minutes,
    COUNT(*) AS orders_measured
FROM orders
WHERE restaurant_id = $1
  AND status = 'COMPLETED'
  AND completed_at IS NOT NULL
  AND placed_at >= $2;
```

This works *only* because we stored `preparing_at` / `completed_at` on the order.
Cheap columns, valuable reports.

### 44. Busiest hours

```sql
SELECT
    EXTRACT(HOUR FROM o.placed_at AT TIME ZONE $2)::int AS hour_of_day,
    COUNT(*) AS orders
FROM orders o
WHERE o.restaurant_id = $1
  AND o.placed_at >= now() - interval '30 days'
GROUP BY hour_of_day
ORDER BY hour_of_day;
```

### 45. Keyset pagination for long order lists

```sql
SELECT id, order_number, status, placed_at
FROM orders
WHERE restaurant_id = $1
  AND ($2::timestamptz IS NULL OR placed_at < $2)   -- cursor from the last page
ORDER BY placed_at DESC
LIMIT 20;
```

Prefer this to `OFFSET 10000`, which forces PostgreSQL to read and throw away 10 000 rows.

---

## Query rules and error mapping

The API reaches this schema through Prisma (`PrismaService`). Most queries above become
ordinary Prisma calls; the ones that use PostgreSQL features Prisma has no API for run as
`$queryRaw`:

| Runs as `$queryRaw` | Why |
|---|---|
| `SELECT … FOR UPDATE` on `table_sessions` (queries 26, 37) | Prisma has no row-lock API |
| `next_order_number($1)` (query 26) | stored function call |
| the `jsonb_to_recordset` order-items insert (query 26) | server-side price snapshot in one statement |
| all report aggregates (queries 39–44) | `date_trunc`, `EXTRACT`, `AT TIME ZONE` |
| the nested-JSON menu and kitchen board (queries 13, 29) | `json_agg` in one round trip |

### Rules

1. **Always** parameterize. In Prisma that means the query builder or the **tagged
   template** form (`` prisma.$queryRaw`… ${value}` ``) — never `$queryRawUnsafe`, never a
   string-concatenated value.
2. **Always** pass `restaurantId` as the first argument of every service method, and
   include it in every `where`.
3. Use `prisma.$transaction(async (tx) => { … })` whenever two or more writes must succeed
   together, and use `tx` — not `prisma` — for every query inside it.
4. Put the *expected current state* in the `where` clause for status changes (queries 30–32),
   never in a TypeScript `if`.
5. `numeric` columns arrive as `Prisma.Decimal`. `TransformInterceptor` serializes them to
   `string` in responses — never `Number`, or paise are lost.

### Error mapping

`PrismaExceptionFilter` translates these; raw-SQL failures surface the SQLSTATE directly.

| SQLSTATE | Prisma | Meaning | HTTP |
|---|---|---|---|
| `23505` | `P2002` | unique_violation | 409 Conflict |
| `23503` | `P2003` | foreign_key_violation | 400 / 404 |
| `23514` | — | check_violation | 400 Bad Request |
| `22P02` | — | invalid UUID | 400 Bad Request |
| — | `P2025` | record not found | 404 Not Found |

---

## Transactions explained

A transaction groups statements so they succeed together or fail together.

```sql
BEGIN;      -- start
  ...       -- your statements
COMMIT;     -- make it permanent
-- or
ROLLBACK;   -- undo everything since BEGIN
```

Where this project needs them:

| Flow | Why a transaction |
|---|---|
| Restaurant signup | Restaurant + user + membership must all exist, or none |
| Create staff | User row without a membership row is orphaned garbage |
| Place an order | An order header with no items is meaningless |
| Reassign a table | Old assignment closed *and* new one opened |
| Close a table | Validation + close must not interleave with a new order |

`SELECT ... FOR UPDATE` locks the selected rows until `COMMIT`, so a concurrent
transaction touching the same row waits its turn. Use it when you read a value and then
decide what to write based on it — like checking a session is still `OPEN` before
inserting an order.

Keep transactions **short**. Never perform HTTP calls, file I/O, or `await` anything slow
between `BEGIN` and `COMMIT`.

---

## Performance: indexes and EXPLAIN

Ask PostgreSQL what it plans to do:

```sql
EXPLAIN ANALYZE
SELECT * FROM orders
WHERE restaurant_id = '11111111-1111-1111-1111-111111111111'
  AND status = 'PENDING';
```

Reading the output:

- `Seq Scan` on a large table → a missing index. Investigate.
- `Index Scan` / `Bitmap Index Scan` → good.
- `actual time=… rows=…` → real measurements; compare to the estimated `rows=`.
  Wildly wrong estimates usually mean stale statistics → run `ANALYZE orders;`.

Housekeeping:

```sql
ANALYZE;                                     -- refresh planner statistics
VACUUM (VERBOSE, ANALYZE) orders;            -- reclaim dead rows
SELECT pg_size_pretty(pg_total_relation_size('orders'));   -- table size

-- indexes that are never used (drop candidates)
SELECT relname, indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY relname;
```

---

## Backup, restore, psql cheat sheet

```bash
# Backup (custom format, compressed)
docker compose exec db pg_dump -U postgres -d resto_saas -F c -f /tmp/backup.dump
docker compose cp db:/tmp/backup.dump ./backup_2026_08_13.dump

# Restore into an empty database
docker compose cp ./backup_2026_08_13.dump db:/tmp/restore.dump
docker compose exec db pg_restore -U postgres -d resto_saas /tmp/restore.dump

# Schema only / data only
docker compose exec db pg_dump -U postgres -d resto_saas --schema-only
docker compose exec db pg_dump -U postgres -d resto_saas --data-only
```

Inside `psql` (`docker compose exec db psql -U postgres -d resto_saas`):

| Command | Does |
|---|---|
| `\l` | list databases |
| `\c resto_saas` | connect to a database |
| `\dt` | list tables |
| `\d orders` | describe the `orders` table (columns, indexes, FKs, triggers) |
| `\d+ orders` | same, plus sizes and descriptions |
| `\di` | list indexes |
| `\dT+` | list custom types (your enums) |
| `\df` | list functions |
| `\dx` | list extensions |
| `\x` | toggle expanded (vertical) output — great for wide rows |
| `\timing` | show how long each query takes |
| `\i file.sql` | run a SQL file |
| `\q` | quit |

Schema self-audit queries:

```sql
-- Every tenant table should appear here with a restaurant_id column
SELECT table_name
FROM information_schema.columns
WHERE column_name = 'restaurant_id' AND table_schema = 'public'
ORDER BY table_name;

-- All foreign keys and what they point at
SELECT conrelid::regclass AS child,
       conname,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'f'
ORDER BY child;
```

---

## Common mistakes

1. **Forgetting the `restaurantId` filter.** The number one bug in multi-tenant apps.
   Every service method takes `restaurantId` as its first parameter so you cannot
   physically write the query without it.
2. **Storing money as `float`.** `0.1 + 0.2 ≠ 0.3`. Use `numeric(10,2)`.
3. **Using `timestamp` instead of `timestamptz`.** You will lose an hour somewhere.
4. **Not snapshotting `item_name` / `unit_price` into `order_items`.** Every past bill
   changes when the owner edits a price.
5. **String-concatenating SQL.** `` `WHERE id = '${id}'` `` is a SQL injection. Use the
   tagged-template `$queryRaw`, never `$queryRawUnsafe`.
6. **Trusting prices from the browser.** Look them up from `menu_items` server-side.
7. **Hard `DELETE` on menu items or staff.** Soft-delete with `is_active = false`.
8. **Missing indexes on foreign keys.** Joins and cascading deletes crawl.
9. **Writing to `order_items.line_total`.** It is a generated column — Postgres computes it.
10. **Two "sources of truth" for table status.** Let the trigger own
    `restaurant_tables.status`; never set it by hand as well.
11. **Checking status in TypeScript instead of the `WHERE` clause.** `if (order.status ===
    'PENDING')` then `UPDATE` is a race condition; put the check in the `where`.
12. **Returning whole rows from endpoints.** Select explicit columns so an added column
    cannot leak `password_hash`.
