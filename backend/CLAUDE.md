# NestJS Backend — Multi-Tenant Restaurant SaaS

Database schema, DDL and example SQL live in `../database/CLAUDE.md` — that file
stays the source of truth for the data model.

**Status: built and running.** The plan below is implemented; the runbook and the
list of deliberate deviations are in [Runbook](#runbook) and
[What was built](#what-was-built).

---

## Runbook

### Prerequisites

| Need | Version used | Notes |
|---|---|---|
| Node | 22.x | `node -v` |
| npm | 10.x | |
| Docker Desktop | 29.x | Postgres runs in it; **hardware virtualization must be enabled in the BIOS/UEFI** |

### First run, from `backend/`

```bash
npm install                                              # ~1 min
cp .env.example .env                                     # already present in this repo
docker compose -f docker/docker-compose.yml up -d db     # postgres:16-alpine on :5432
npx prisma generate                                      # typed client
npx prisma migrate deploy                                # applies 0001 → 0007
npx prisma db seed                                       # Spice Garden + 4 users + menu
npm run start:dev                                        # http://localhost:3000/api
```

> Run the API with **`start:dev`**, not `start:prod`. `start:prod` serves the
> compiled `dist/`, so source edits do nothing until you rebuild — a new route
> just keeps 404ing and it looks like the route is wrong rather than stale.

Seed logins — all four share the password `password123`:

| Email | Role |
|---|---|
| `owner@spice.com` | OWNER |
| `amit@spice.com` | WAITER (tables 1–4) |
| `suresh@spice.com` | WAITER (tables 5–8) |
| `kitchen@spice.com` | KITCHEN |

### Where things are

| URL | What |
|---|---|
| `http://localhost:3000/api` | REST API (global `api` prefix) |
| `http://localhost:3000/api/docs` | Swagger UI, `persistAuthorization` on |
| `http://localhost:3000/api/health` | Liveness — `{ status, uptime }` |
| `http://localhost:3000/api/health/ready` | Readiness — pings PostgreSQL |
| `ws://localhost:3000/realtime` | Socket.IO namespace |

### Everyday commands

```bash
npm run start:dev        # watch mode — use this while developing
npm run build            # → dist/
npm run start:prod       # node dist/main.js — compiled; does NOT pick up source edits
npm test                 # Jest unit suite
npm run typecheck        # tsc --noEmit
npm run lint             # eslint
npm run prisma:studio    # GUI data browser
npm run db:reset         # drop, re-migrate, re-seed  (destroys data)
npm run docker:up        # db + api containers
npm run docker:down      # stop them
```

### Response shapes

Success — `TransformInterceptor`:

```json
{ "data": { … }, "requestId": "6494ec35-…" }
```

Failure — `AllExceptionsFilter`:

```json
{ "error": { "code": "ORDER_ALREADY_MOVED", "message": "Someone already moved this order" },
  "requestId": "6494ec35-…" }
```

`Prisma.Decimal` is serialized to a **string** (`"250.00"`) and `bigint` (from
`COUNT(*)` in `$queryRaw`) to a **number**. Both conversions happen in exactly
one place — `serialize()` in `common/interceptors/transform.interceptor.ts`.

### Deploying

```bash
docker compose -f docker/docker-compose.yml up -d --build     # db + api
```

The production `docker/Dockerfile` is multi-stage: `deps` (`npm ci`) → `build`
(`prisma generate` + `nest build`) → `runner` (`node:20-alpine`, non-root user).
Its entrypoint runs `npx prisma migrate deploy` before `node dist/main.js`, so a
fresh container converges the schema on its own.

Before going to production, change in `.env` / the compose environment:

- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — `openssl rand -hex 32`, and they
  must differ (`env.validation.ts` refuses to boot otherwise)
- `NODE_ENV=production`, `SWAGGER_ENABLED=false`
- `CORS_ORIGIN` — the real frontend origin, comma-separated for several
- `POSTGRES_PASSWORD` and the matching `DATABASE_URL`

---

## What was built

Everything in the plan below is implemented, with these deliberate deviations:

| Plan said | Built as | Why |
|---|---|---|
| `argon2` | `@node-rs/argon2` | Prebuilt native binaries — no node-gyp/MSVC toolchain needed on Windows. Same Argon2id, same cost parameters. |
| `@nestjs/terminus` health module | Plain `HealthController` | Two endpoints (`/health`, `/health/ready`) that need no indicator framework; the dependency was removed rather than left unused. |
| `JwtRefreshStrategy`, `LocalStrategy` | Neither | Refresh needs a database lookup by `jti` plus an Argon2 verify before it can accept the token, which is `TokenService.rotate()`, not a Passport strategy. Login is a plain controller call for the same reason. `JwtStrategy` (access token) is a real Passport strategy and backs the global `JwtAuthGuard`. |
| `WsJwtGuard` | Verification inline in `handleConnection` | A gateway lifecycle hook is not a guard context; the token is verified before any room is joined and an invalid socket is disconnected immediately. |
| e2e via Supertest + Testcontainers | Jest unit suite + a scripted end-to-end API check | The unit suite covers the pure logic; the scripted run exercised the whole API against the real seeded database (see below). Testcontainers e2e is the remaining gap. |
| `eslint` in the package list | Was never actually installed — added later | The `lint` script existed but `eslint` was in no dependency list, so `npx` fetched an arbitrary version from the registry, found no config, and failed. See [Linting](#linting). |

### Migration `0002_init`

Generated rather than hand-written:

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script \
  > prisma/migrations/0002_init/migration.sql
```

`0001` and `0003`–`0007` are the hand-written SQL the plan calls for. All seven
apply cleanly with `migrate deploy`.

### One schema note worth knowing

`Order` has **no direct Prisma relation to `RestaurantTable`**. The composite FK
`fk_orders_session_table` lives in raw SQL (migration `0006`), because Prisma
cannot express a second multi-field relation from `(table_session_id, …)` to the
same parent. Services read the table number through the session:

```ts
session: { select: { table: { select: { tableNumber: true, label: true } } } }
```

### Verified behaviour

A scripted run against the seeded database confirmed, end to end:

- Argon2id login for all three roles; wrong password → 401 `INVALID_CREDENTIALS`
- Waiter hitting `/staff` → 403 `FORBIDDEN_ROLE`; no token → 401
- Waiter reading another waiter's table → 403 `TABLE_NOT_ASSIGNED`
- Two concurrent `POST /sessions` on one table → **the same session id** (the
  partial unique index doing its job)
- `sync_table_status` flipping the table to `OCCUPIED` on open and back to
  `VACANT` on close
- Order placement snapshotting `unit_price` from the database; a later price
  change leaves the placed order at `250.00`; `line_total` computed by Postgres
- A `unitPrice` field in the request body → 400 (stripped by `forbidNonWhitelisted`)
- Unavailable item → 400 `ITEM_UNAVAILABLE`
- Close blocked with orders in the kitchen → 409 `ORDERS_IN_PROGRESS`
- Two simultaneous "Start" clicks → exactly one 200, one 409 `ORDER_ALREADY_MOVED`
- Board columns each sorted on their own timestamp — a PREPARING queue of
  `#27 #17 #21` proves it is ordering by `preparing_at`, not order number
- `reopen` on a completed order: 200, `completedAt` cleared, `preparingAt`
  byte-identical to before, and the card back at **the same index** it left in
  the PREPARING column; reopening an order already PREPARING → 409; a WAITER
  calling it → 403 `FORBIDDEN_ROLE`
- Bill: subtotal `820.00`, 5 % tax `41.00`, grand total `861.00`, lines merged
- Second active KITCHEN handler → 409; duplicate email → 409 `EMAIL_TAKEN`
- Refresh rotation, then replay of the old token → 401 `TOKEN_REUSED` **and the
  whole family revoked**
- Reports returning money as strings and counts as numbers

### Linting

**`npm run lint` was broken from the start and nobody noticed**, because the
failure looked like a config problem rather than a missing dependency: `eslint`
appears in this plan's package list but was never in `package.json`, so `npx`
downloaded whatever version the registry served, found no `eslint.config.js`,
and printed a migration guide. Fixed by installing the toolchain at the same
majors the frontend already pins (`eslint` 9, `typescript-eslint` 8) and adding
a flat config.

Three things about `eslint.config.mjs` worth knowing before editing it:

- **The extension is deliberate.** This package is CommonJS — Nest compiles to
  CJS and adding `"type": "module"` would break the build — but flat config is
  ESM, so `.mjs` is what tells Node how to read it.
- **`recommendedTypeChecked`, not plain `recommended`.** The whole point of the
  strict-TS contract here is catching an `any` that has leaked out of a
  `$queryRaw` before it reaches a response body, and only the type-aware rules
  can see that. Plain JS files get `disableTypeChecked` since they are outside
  the TS project and the type-aware rules would crash on them.
- The script is `eslint .`, not a list of globs. The old one named a `test/`
  directory that does not exist yet, which is a hard error rather than a
  no-op — `ignores` in the config is the place to exclude things.

The first clean run reported 17 errors and every one was real, not noise. The
two worth calling out:

- **`String(e.meta?.target ?? '')` in the P2002 handlers.** Prisma types
  `meta.target` as `unknown` and returns it as `string[]`, a bare string, or
  nothing. `String()` on anything else yields the literal `[object Object]`, so
  `target.includes('email')` silently returns false and a duplicate email
  surfaces as an unhandled 500 instead of 409 `EMAIL_TAKEN`. Now normalised in
  `common/prisma-error.ts` and covered by tests.
- **`String(p.message ?? …)` in the exception filter**, the same failure one
  layer out: a non-string message became the text `[object Object]` in the
  response body the client displays. It now falls back to the exception's own
  message.

### Tests

`npm test` — 5 suites, 30 tests:

| Suite | Covers |
|---|---|
| `transform.interceptor.spec.ts` | Decimal → fixed-2 string, bigint → number, nested walks, no float drift |
| `roles.guard.spec.ts` | Role allow/deny, unauthenticated, no metadata, `@Public()` bypass |
| `password.service.spec.ts` | Argon2id hash/verify round-trip, per-hash salt, malformed hash → `false` |
| `all-exceptions.filter.spec.ts` | Domain codes, `details` passthrough, P2002/P2025, raw `23505`, no message leak on 500, and that a non-string message never renders as `[object Object]` |
| `prisma-error.spec.ts` | `meta.target` as `string[]` / bare string / unreadable shape; case-insensitive matching; every named column required |

---

## Stack

| Piece | Choice |
|---|---|
| Language | TypeScript 5 (strict mode) |
| Framework | NestJS 10 |
| Database | PostgreSQL 16 |
| ORM | Prisma 5 |
| Auth | Passport + JWT access tokens + rotating refresh tokens |
| Password hashing | Argon2id |
| Authorization | RBAC (`OWNER` / `WAITER` / `KITCHEN`) via guards + decorators |
| Realtime | WebSockets (`@nestjs/websockets` + Socket.IO) |
| Containerization | Docker + docker-compose |
| Validation | `class-validator` + `class-transformer` |
| Docs | Swagger (`@nestjs/swagger`) |
| Testing | Jest (unit) + Supertest (e2e) + Testcontainers |

### Packages

```
@nestjs/common @nestjs/core @nestjs/config @nestjs/jwt @nestjs/passport
@nestjs/swagger @nestjs/throttler @nestjs/terminus @nestjs/websockets
@nestjs/platform-express @nestjs/platform-socket.io
@prisma/client prisma
passport passport-jwt passport-local
argon2 class-validator class-transformer
socket.io helmet cookie-parser compression zod
--- dev ---
typescript ts-node @types/node jest ts-jest supertest @types/supertest
eslint @eslint/js typescript-eslint globals prettier husky lint-staged
@testcontainers/postgresql
```

`eslint` alone is not enough — flat config needs `@eslint/js`, `globals` and the
single `typescript-eslint` entry point too. Listing just `eslint` is how this
repo ended up with a `lint` script and no linter; see [Linting](#linting).

---

## Folder structure

```
backend/
├── docker/
│   ├── Dockerfile                    multi-stage build
│   ├── Dockerfile.dev
│   └── docker-compose.yml            postgres + api
├── prisma/
│   ├── schema.prisma
│   ├── migrations/                   Prisma-generated + hand-edited raw SQL
│   └── seed.ts
├── src/
│   ├── main.ts                       bootstrap, helmet, CORS, ValidationPipe, Swagger
│   ├── app.module.ts
│   ├── common/
│   │   ├── decorators/               @Public @Roles @CurrentUser @RestaurantId
│   │   ├── guards/                   JwtAuthGuard RolesGuard TableAccessGuard WsJwtGuard
│   │   ├── filters/                  PrismaExceptionFilter AllExceptionsFilter
│   │   ├── interceptors/             TransformInterceptor LoggingInterceptor
│   │   ├── pipes/                    ParseUuidPipe
│   │   ├── dto/                      PaginationDto DateRangeDto
│   │   └── exceptions/               DomainException + error codes
│   ├── config/
│   │   ├── configuration.ts
│   │   └── env.validation.ts         zod schema, fail fast on boot
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts         extends PrismaClient, onModuleInit/onModuleDestroy
│   ├── auth/
│   │   ├── auth.module.ts controller service
│   │   ├── strategies/               jwt.strategy.ts jwt-refresh.strategy.ts local.strategy.ts
│   │   ├── token.service.ts          sign, rotate, revoke, reuse-detection
│   │   ├── password.service.ts       argon2 hash/verify
│   │   └── dto/
│   ├── modules/
│   │   ├── restaurants/  staff/  tables/  assignments/
│   │   ├── menu/  sessions/  orders/  kitchen/  reports/
│   │   └── health/
│   ├── realtime/
│   │   ├── realtime.module.ts
│   │   ├── realtime.gateway.ts       @WebSocketGateway
│   │   ├── realtime.service.ts       emit helpers (injected into domain services)
│   │   └── rooms.ts                  room-name builders
│   └── types/
├── test/                             e2e specs (not written yet — the remaining gap)
├── eslint.config.mjs                 ESLint 9 FLAT config — .mjs, see Linting
├── .env.example
├── .dockerignore
└── package.json
```

Unit specs live beside their subject (`password.service.spec.ts` next to
`password.service.ts`), not in `test/`.

---

## Bootstrap commands

```bash
npm i -g @nestjs/cli
nest new backend --strict --package-manager npm
npm i prisma --save-dev && npx prisma init --datasource-provider postgresql
nest g module modules/menu && nest g controller modules/menu && nest g service modules/menu
```

---

## Environment variables

`NODE_ENV` · `PORT` · `DATABASE_URL` · `SHADOW_DATABASE_URL` ·
`JWT_ACCESS_SECRET` · `JWT_ACCESS_TTL` (15m) · `JWT_REFRESH_SECRET` · `JWT_REFRESH_TTL` (7d) ·
`ARGON2_MEMORY_COST` · `ARGON2_TIME_COST` · `ARGON2_PARALLELISM` ·
`CORS_ORIGIN` · `THROTTLE_TTL` · `THROTTLE_LIMIT` · `LOG_LEVEL` · `SWAGGER_ENABLED`

Validate with a zod schema in `env.validation.ts` wired into `ConfigModule.forRoot({ validate })`
so the app refuses to boot with a missing secret.

---

## Docker

### `docker-compose.yml` services
- `db` — `postgres:16-alpine`, named volume `pgdata`, healthcheck `pg_isready`
- `api` — built from `Dockerfile.dev`, `depends_on: db (service_healthy)`, source bind-mount, hot reload

`npx prisma studio` is the data browser — no separate DB-browser container.

### `Dockerfile` (multi-stage, production)
1. `deps` — `npm ci`
2. `build` — `npx prisma generate` → `npm run build`
3. `runner` — `node:20-alpine`, non-root user, copy `dist/` + `node_modules` + `prisma/`,
   entrypoint runs `npx prisma migrate deploy` then `node dist/main.js`

`.dockerignore`: `node_modules`, `dist`, `.git`, `.env`, `test`

---

## Prisma

### Migration workflow

```bash
npx prisma migrate dev --name init         # create + apply a migration in dev
npx prisma migrate dev --create-only       # generate the SQL file WITHOUT applying it
npx prisma migrate deploy                  # apply pending migrations (CI / container start)
npx prisma generate                        # regenerate the typed client
npx prisma studio                          # GUI data browser
npx prisma db seed                         # run prisma/seed.ts
```

`--create-only` is the important one: it writes `prisma/migrations/<ts>_name/migration.sql`
and lets you **hand-edit it** before applying. That is how every raw-SQL construct below
gets into the database while staying inside Prisma's migration history.

### What Prisma CANNOT express — keep these as hand-written SQL

The database plan leans on PostgreSQL features that have no `schema.prisma` syntax. Each
one goes into a migration created with `--create-only` and then edited:

| Construct | From `database/CLAUDE.md` | How |
|---|---|---|
| Partial unique indexes | one OPEN session per table; one active waiter per table; one active OWNER/KITCHEN per restaurant | append `CREATE UNIQUE INDEX … WHERE …` to the migration SQL |
| Generated column | `order_items.line_total` | `ALTER TABLE … ADD COLUMN … GENERATED ALWAYS AS (…) STORED` |
| Trigger functions | `set_updated_at()`, `assert_session_open()`, `sync_table_status()` | `CREATE OR REPLACE FUNCTION` + `CREATE TRIGGER` |
| Stored function | `next_order_number()` | same; call from Nest via `$queryRaw` |
| Partial/filtered indexes | `idx_orders_kitchen`, etc. | raw `CREATE INDEX … WHERE …` |
| CHECK constraints | `ck_session_closed`, `ck_order_item_qty`, … | raw `ALTER TABLE … ADD CONSTRAINT … CHECK (…)` |
| Extensions | `pgcrypto`, `citext`, `pg_trgm` | `CREATE EXTENSION IF NOT EXISTS …` |

Migration sequence:

```
prisma/migrations/
├── 0001_extensions/              pgcrypto, citext, pg_trgm
│                                 ← MUST come first: 0002 creates citext columns
├── 0002_init/                    Prisma-generated tables, enums, FKs, simple indexes
├── 0003_functions/               set_updated_at, assert_session_open, sync_table_status,
│                                 next_order_number
├── 0004_triggers/                attach triggers to tables
├── 0005_partial_indexes/         all WHERE-filtered unique + performance indexes
├── 0006_check_constraints/       CHECK constraints Prisma can't declare
└── 0007_generated_columns/       order_items.line_total — DROP the plain column Prisma
                                  emitted in 0002, then re-ADD it GENERATED … STORED
```

Ordering rule: **extensions before tables, tables before everything that decorates them.**
The full file-by-file map against `database/CLAUDE.md` is in that document, section 5.

### Four Prisma gotchas for this schema

1. **`citext`** — the database plan uses it for `users.email`, `restaurants.slug`,
   `menu_categories.name` and `menu_items.name`. Declare these as `String @db.Citext` so
   the column type matches the DDL in `database/CLAUDE.md` exactly. This requires the
   `citext` extension to already exist — hence migration `0001_extensions` runs before
   `0002_init`. Also **normalize email to lowercase in a DTO `@Transform`** as defence in
   depth. Do *not* substitute `String` + a `lower(email)` functional index: that silently
   diverges from the database plan's unique constraints.

2. **Generated column `line_total`** — declare it in `schema.prisma` as optional
   (`lineTotal Decimal? @db.Decimal(12,2)`) and **never write to it**. Prisma omits fields
   you don't supply, so Postgres computes it. Add a code-review rule: `lineTotal` never
   appears in a `create`/`update` payload.

3. **Composite foreign keys** — declare them as multi-field relations
   (`@relation(fields: [tableId, restaurantId], references: [id, restaurantId])`) with a
   matching `@@unique([id, restaurantId])` on the parent. If Prisma rejects reusing the
   `restaurantId` scalar across two relation fields, drop the relation from
   `schema.prisma` and keep the constraint in raw SQL — the database enforces tenant
   integrity either way, which is the entire point.

4. **Money** — `Decimal @db.Decimal(10,2)` comes back as a `Prisma.Decimal` object. Convert
   to `string` in response DTOs (never `Number`) so paise are never lost in JSON.

### `schema.prisma` — models to define

Enums: `UserRole` · `TableStatus` · `SessionStatus` · `OrderStatus`

| Prisma model | Table | Key attributes |
|---|---|---|
| `Restaurant` | `restaurants` | `slug String @db.Citext @unique`, `taxPercent Decimal @db.Decimal(5,2)`, `timezone` |
| `User` | `users` | `email String @db.Citext @unique`, `passwordHash`, `lastLoginAt` |
| `RestaurantUser` | `restaurant_users` | `@@unique([restaurantId, userId])`, `role UserRole` |
| `RefreshToken` | `refresh_tokens` | **new — see below** |
| `RestaurantTable` | `restaurant_tables` | `@@unique([restaurantId, tableNumber])`, `@@unique([id, restaurantId])` |
| `TableWaiterAssignment` | `table_waiter_assignments` | `unassignedAt DateTime?`; composite FK → `RestaurantTable(id, restaurantId)` |
| `MenuCategory` | `menu_categories` | `name String @db.Citext`, `@@unique([restaurantId, name])`, `@@unique([id, restaurantId])` |
| `MenuItem` | `menu_items` | `name String @db.Citext`, `price Decimal @db.Decimal(10,2)`, `isAvailable`, `isActive`, `@@unique([restaurantId, categoryId, name])` |
| `TableSession` | `table_sessions` | `@@unique([id, tableId])`, `@@unique([id, restaurantId])` |
| `Order` | `orders` | `@@unique([restaurantId, orderNumber])`, `@@unique([id, restaurantId])` (parent of the `OrderItem` composite FK), status timestamps |
| `OrderItem` | `order_items` | snapshot `itemName` + `unitPrice`, `lineTotal` read-only; composite FK → `Order(id, restaurantId)` |
| `RestaurantCounter` | `restaurant_counters` | `restaurantId @id` (no surrogate key), `lastOrderNumber Int` |

Conventions: `@@map("snake_case_table")` on every model, `@map("snake_case_column")` on every
field, `@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`,
`@db.Timestamptz(6)` on all timestamps, `@updatedAt` on `updatedAt`.

### The `refresh_tokens` table

`refresh_tokens` is the 12th table, added for this stack's rotating-refresh-token auth. It
is documented in full in `database/CLAUDE.md` — DDL in section 004, indexes in 009, and
queries 3a–3g covering issue, rotate, reuse detection, logout, active sessions and cleanup.
Keep the token lifetime there (`interval '7 days'`) in sync with `JWT_REFRESH_TTL`.

Prisma model `RefreshToken` → `@@map("refresh_tokens")`, with a self-relation for
`replacedById` and `ip String? @db.Inet`.

---

## Auth

### Flow
1. `POST /auth/login` → verify Argon2id hash → issue access JWT (15m) + refresh JWT (7d)
2. Refresh token stored **hashed** in `refresh_tokens` with a `family_id`
3. `POST /auth/refresh` → verify signature → look up hash → rotate: revoke old row, insert
   new row with the same `family_id`, return a new pair
4. **Reuse detection**: presented token already `revoked_at` → revoke the whole `family_id`
   and force re-login (classic stolen-token response)
5. `POST /auth/logout` → revoke the current family

### Token payloads
- Access: `{ sub: userId, rid: restaurantId, role: UserRole, iat, exp }`
- Refresh: `{ sub: userId, jti: refreshTokenId, fid: familyId, iat, exp }`

`rid` and `role` are read **only** from the verified token — never from body, query or header.

> **Why the refresh token carries `jti`:** Argon2 salts every hash, so
> `WHERE tokenHash = …` can never match. You look the row up by `jti`, *then*
> `argon2.verify()` that single row. Full decision table in `database/CLAUDE.md` query 3b.

### To implement
- `PasswordService` — `hash()` / `verify()` with Argon2id, tuned cost from env
- `TokenService` — `issuePair()` `rotate()` `revokeFamily()` `cleanupExpired()`
- `JwtStrategy` — validates access token → returns `AuthUser`
- `JwtRefreshStrategy` — separate secret, reads the refresh token
- `LocalStrategy` — email + password for login
- `JwtAuthGuard` registered globally via `APP_GUARD`, bypassed by `@Public()`
- Timing-safe login: always run an Argon2 verify even when the email is unknown

---

## RBAC

- `enum Role { OWNER, WAITER, KITCHEN }` mirroring the Prisma enum
- `@Roles(Role.OWNER)` decorator → `SetMetadata`
- `RolesGuard` (global `APP_GUARD`) reads metadata + `request.user.role`
- `@Public()` for `/auth/login`, `/auth/register-restaurant`, `/health`
- `@CurrentUser()` param decorator → typed `AuthUser`
- `@RestaurantId()` param decorator → `request.user.rid`
- `TableAccessGuard` — a `WAITER` may only touch tables actively assigned to them; `OWNER`
  bypasses it
- **Tenant scoping rule**: every service method takes `restaurantId` as its first argument
  and every Prisma call includes `where: { restaurantId }`. No exceptions.

---

## API endpoints

### Auth — `/api/auth`
| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/register-restaurant` | public | Restaurant + owner in one transaction |
| POST | `/login` | public | Argon2 verify → token pair |
| POST | `/refresh` | public (refresh token) | Rotate the pair |
| POST | `/logout` | any | Revoke the token family |
| GET | `/me` | any | User + restaurant + role |
| PATCH | `/me/password` | any | Change own password, revoke all families |

### Restaurant — `/api/restaurant`
`GET /` (any) · `PATCH /` (OWNER — name, phone, address, taxPercent, timezone)

### Staff — `/api/staff`
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/` | OWNER | List staff |
| GET | `/waiters` | OWNER | Waiter dropdown |
| POST | `/` | OWNER | Create waiter / kitchen handler (user + membership, one transaction) |
| PATCH | `/:userId` | OWNER | Update name, phone |
| PATCH | `/:userId/password` | OWNER | Reset a staff password |
| PATCH | `/:userId/status` | OWNER | Activate / deactivate |

### Tables — `/api/tables`
`GET /` (OWNER) · `GET /my` (WAITER) · `GET /:id` (OWNER, WAITER) · `POST /` (OWNER) ·
`POST /bulk` (OWNER) · `PATCH /:id` (OWNER) · `DELETE /:id` (OWNER, soft delete)

### Assignments — `/api/tables/:id/assignment`
`PUT /` (OWNER, reassign in a transaction) · `DELETE /` (OWNER) · `GET /history` (OWNER)

### Menu — `/api/menu`
| Method | Path | Role |
|---|---|---|
| GET | `/` (full nested menu) | any |
| GET | `/categories` · POST · PATCH `/:id` · DELETE `/:id` | any / OWNER |
| GET | `/categories/:id/items` | any |
| POST | `/items` · PATCH `/items/:id` · DELETE `/items/:id` | OWNER |
| PATCH | `/items/:id/availability` | OWNER |
| GET | `/search?q=` | any |

### Sessions — `/api/sessions`
`POST /` (open or reuse — idempotent) · `GET /:id` · `GET /:id/bill` · `POST /:id/close` ·
`GET /table/:tableId/history`

### Orders — `/api/orders`
`POST /` (OWNER, WAITER — send to kitchen) · `GET /:id` · `PATCH /:id/status`
(OWNER, KITCHEN) · `POST /:id/cancel` (OWNER, WAITER)

### Kitchen — `/api/kitchen`
`GET /board` · `GET /counts` · `PATCH /orders/:id/start` · `PATCH /orders/:id/complete` ·
`PATCH /orders/:id/reopen` — all OWNER + KITCHEN

**Board ordering is per column, not one global sort** (query 29): PENDING by
`placed_at` ASC (longest wait on top), PREPARING by `preparing_at` ASC (the queue
actually being cooked), COMPLETED by `completed_at` DESC (what just came off the
pass). Sorting everything by `placed_at` is wrong for the last two.

`reopen` is COMPLETED → PREPARING, for a handler who tapped "Mark complete" on
the wrong card. It **preserves `preparing_at`**, so the card returns to the
position in the queue it left rather than the back of it, and it refuses with
409 `SESSION_NOT_OPEN` once the table has been billed — `assert_session_open`
fires only on INSERT, so the service has to enforce that itself.

### Reports — `/api/reports`
`GET /summary` · `/daily` · `/top-items` · `/waiters` · `/prep-time` · `/hourly` — OWNER

### Health — `/api/health`
Terminus: liveness, readiness, `PrismaHealthIndicator`

---

## Services & critical transactions

Use `prisma.$transaction(async (tx) => { … })` (interactive) wherever two writes must
succeed together:

| Service | Method | Notes |
|---|---|---|
| `AuthService` | `registerRestaurant` | restaurant + user + membership |
| `StaffService` | `create` | user + membership; catch `P2002` for duplicate email / second KITCHEN |
| `AssignmentService` | `reassign` | close old row + insert new |
| `SessionService` | `open` | idempotent; rely on the partial unique index, catch `P2002` |
| `SessionService` | `close` | lock session, reject if orders still PENDING/PREPARING |
| `OrderService` | `place` | **the core one — below** |
| `KitchenService` | `transition` | guarded status change |
| `ReportService` | all | `$queryRaw` for the aggregate SQL in the database plan |

### `OrderService.place()` — the core transaction

```
1. tx.$queryRaw  SELECT … FROM table_sessions WHERE id AND restaurantId AND status='OPEN' FOR UPDATE
                 → 0 rows ⇒ throw SessionNotOpenException (409)
2. tx.$queryRaw  SELECT next_order_number($restaurantId)
3. tx.order.create({ … orderNumber, tableSessionId, tableId, createdByUserId })
4. tx.menuItem.findMany({ where: { id: { in: ids }, restaurantId, isActive, isAvailable } })
   → count mismatch ⇒ throw ItemUnavailableException (400)
5. tx.orderItem.createMany({ data: items.map(snapshot name + price from step 4) })
6. after COMMIT → realtime.emitOrderNew(restaurantId, order)
```

**Prices are read from the database in step 4, never from the request body.** The DTO
accepts only `{ menuItemId, quantity, note? }`.

Guarded status transitions stay in the `where` clause, not in TypeScript:

```ts
const { count } = await prisma.order.updateMany({
  where: { id, restaurantId, status: 'PENDING' },   // expected current state
  data:  { status: 'PREPARING', preparingAt: new Date() },
});
if (count === 0) throw new OrderAlreadyMovedException(); // 409
```

---

## DTOs (class-validator)

`RegisterRestaurantDto` · `LoginDto` · `RefreshDto` · `ChangePasswordDto` ·
`CreateStaffDto` · `UpdateStaffDto` · `ResetStaffPasswordDto` ·
`CreateTableDto` · `BulkCreateTablesDto` · `AssignWaiterDto` ·
`CreateCategoryDto` · `UpdateCategoryDto` · `CreateMenuItemDto` · `UpdateMenuItemDto` ·
`ToggleAvailabilityDto` · `MenuSearchDto` ·
`OpenSessionDto` · `CloseSessionDto` · `PlaceOrderDto` · `OrderItemDto` ·
`UpdateOrderStatusDto` · `ReportRangeDto` · `PaginationDto`

Response DTOs + `@ApiProperty()` for Swagger. Global `ValidationPipe({ whitelist: true,
forbidNonWhitelisted: true, transform: true })` so unknown fields are stripped, not trusted.

`PlaceOrderDto` shape: `{ tableId | sessionId, items: OrderItemDto[], note? }` where
`OrderItemDto = { menuItemId: uuid, quantity: int ≥ 1, note?: string }`. **No price field.**

---

## WebSockets — live kitchen updates

`RealtimeGateway` with `@WebSocketGateway({ namespace: '/realtime', cors })`.

### Connection
- JWT passed in `handshake.auth.token`
- `WsJwtGuard` verifies it in `handleConnection`; invalid → `socket.disconnect()`
- On connect, join rooms based on the token's `rid` and `role`

### Rooms
`restaurant:{rid}` · `restaurant:{rid}:kitchen` · `restaurant:{rid}:waiter:{userId}`

Never emit outside a tenant room.

### Server → client events
| Event | Emitted by | Room | Payload |
|---|---|---|---|
| `order:new` | `OrderService.place` | `:kitchen` + owner | order + items + table number |
| `order:status` | `KitchenService.transition` | tenant + originating waiter | `{ orderId, status, at }` |
| `order:cancelled` | `OrderService.cancel` | `:kitchen` + owner | `{ orderId }` |
| `table:opened` | `SessionService.open` | tenant | `{ tableId, sessionId }` |
| `table:closed` | `SessionService.close` | tenant | `{ tableId, sessionId }` |
| `table:assigned` | `AssignmentService` | tenant + both waiters | `{ tableId, waiterId }` |
| `menu:updated` | `MenuService` writes | tenant | `{ type, entityId }` |

### Client → server events
`ping` — heartbeat only. Room membership is decided server-side from the token, never
requested by the client.

### Rules
- Domain services depend on `RealtimeService`, **not** on the gateway (avoids circular
  imports and keeps services testable)
- Emit **after** the transaction commits, never inside it
- The kitchen dashboard also polls `GET /kitchen/board` every 15 s as a fallback — the
  socket is an optimization, not the only path

---

## Filters, interceptors, pipes

- `PrismaExceptionFilter` — maps Prisma error codes to HTTP:

| Prisma | Meaning | HTTP |
|---|---|---|
| `P2002` | unique constraint | 409 `DUPLICATE` |
| `P2003` | foreign key constraint | 400 `INVALID_REFERENCE` |
| `P2025` | record not found | 404 `NOT_FOUND` |
| `P2000` | value too long | 400 |

- `AllExceptionsFilter` — uniform body `{ error: { code, message, details? }, requestId }`
- `TransformInterceptor` — wrap successful responses, serialize `Prisma.Decimal` → string
- `LoggingInterceptor` — method, path, duration, requestId, userId
- `ThrottlerGuard` — global, tighter on `/auth/login`
- `ParseUUIDPipe` on every `:id` route param

### Domain error codes
`INVALID_CREDENTIALS` · `TOKEN_EXPIRED` · `TOKEN_REUSED` · `FORBIDDEN_ROLE` ·
`NOT_TENANT_MEMBER` · `EMAIL_TAKEN` · `KITCHEN_EXISTS` · `TABLE_NOT_ASSIGNED` ·
`SESSION_NOT_OPEN` · `ORDER_ALREADY_MOVED` · `ITEM_UNAVAILABLE` · `ORDERS_IN_PROGRESS` ·
`CATEGORY_NOT_EMPTY`

---

## Security checklist

- Argon2id for passwords and refresh tokens; cost parameters from env; never return `passwordHash`
- Refresh tokens stored hashed, rotated on every use, family revoked on reuse
- Access token 15 min; `rid` + `role` taken only from the verified JWT
- Global `JwtAuthGuard` + `RolesGuard` — endpoints are private by default, opt out with `@Public()`
- Every Prisma query filtered by `restaurantId`
- Prices resolved server-side from `menu_items`
- `whitelist: true` + `forbidNonWhitelisted: true` on the global ValidationPipe
- `helmet`, strict CORS origin, `@nestjs/throttler` on auth routes
- Prisma parameterizes everything; if you use `$queryRaw`, use the **tagged template** form
  (`` $queryRaw`…${value}` ``), never `$queryRawUnsafe`
- Container runs as a non-root user; secrets via env, never baked into the image

---

## Testing

- **Unit** — services with a mocked `PrismaService`; guards; `TokenService` rotation logic
- **e2e** — Supertest against a Testcontainers Postgres, `migrate deploy` + seed per suite
- Must-cover: cross-tenant read returns 404/403 · double status transition returns 409 ·
  price change does not alter past orders · second KITCHEN user rejected · concurrent
  session open creates exactly one session · close blocked with unfinished orders ·
  refresh-token reuse revokes the family · WS client cannot join another tenant's room

---

## Scripts

`start:dev` · `start:prod` · `build` · `lint` · `format` · `test` · `test:e2e` · `test:cov` ·
`prisma:generate` · `prisma:migrate` · `prisma:deploy` · `prisma:studio` · `db:seed` ·
`docker:up` · `docker:down`

---

## Build order

1. Docker compose + Postgres + Nest skeleton + `PrismaService` + health endpoint
2. `schema.prisma` (all 12 models) → `migrate dev --create-only` → hand-add raw SQL →
   apply → `seed.ts`
3. Auth: Argon2, JWT strategies, refresh rotation, global guards, `@Public`/`@Roles`
4. Staff + restaurant modules (owner creates waiters and the kitchen handler)
5. Menu module (categories, items, search)
6. Tables + assignments
7. Sessions (idempotent open, bill, close)
8. Orders (the place-order transaction) — the heart of the app
9. Kitchen board + guarded transitions
10. Realtime gateway wired into orders + kitchen
11. Reports (`$queryRaw` aggregates)
12. Swagger, e2e tests, production Dockerfile
