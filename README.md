# Multi-Tenant Restaurant SaaS

A restaurant management platform where many restaurants ("tenants") share one
application and one database. Each tenant gets an owner, waiters, a kitchen
handler, a floor of tables, a menu, and orders that flow **table → kitchen →
bill** in real time.

Built as a full three-layer system — PostgreSQL schema, NestJS API, React
frontend — with the tenancy, money and concurrency guarantees enforced in the
database rather than assumed by the application.

---

## The domain in one diagram

The chain that the whole data model hangs off:

```
RESTAURANT          the tenant
    ↓
TABLE               physical table #5
    ↓
TABLE SESSION       the group of customers sitting there right now
    ↓
ORDER               one "Send to Kitchen" press
    ↓
ORDER ITEMS         Chicken Biryani × 2, Coke × 2  (price frozen at order time)
```

Orders hang off the **session**, not the table — the same physical table serves
different customers on different days, so the bill is "everything in this
visit," not "everything ever ordered at Table 5."

Three roles, three different views of it:

| Role | Sees |
|---|---|
| **Owner** | Dashboard, tables, menu, staff, kitchen board, reports, settings |
| **Waiter** | Only the tables assigned to them → take order, view bill, close table |
| **Kitchen** | A three-column board: PENDING / PREPARING / COMPLETED |

---

## Stack

| Layer | Choice |
|---|---|
| Database | PostgreSQL 16 — `citext`, `pg_trgm`, partial indexes, trigger functions, generated columns |
| API | NestJS 11 · Prisma 6 · TypeScript 5 (strict) |
| Auth | Argon2id · JWT access tokens · rotating refresh tokens with reuse detection |
| Realtime | Socket.IO — tenant-scoped rooms |
| Frontend | React 19 · Vite 7 · Tailwind 4 · TanStack Query 5 · Zustand 5 · RHF + Zod 4 |
| Charts / Tables | Recharts 3 · TanStack Table 8 |
| Testing | Jest 30 (backend) · Vitest 4 (frontend) |
| Infra | Docker Compose · multi-stage production Dockerfile |

---

## Quick start

Prerequisites: **Node 22**, **npm 10**, **Docker Desktop**.

```bash
# 1 — database + API
cd backend
npm install
docker compose -f docker/docker-compose.yml up -d db
npx prisma generate && npx prisma migrate deploy && npx prisma db seed
npm run start:dev                 # http://localhost:3000/api

# 2 — frontend, second terminal
cd frontend
npm install
npm run dev                       # http://localhost:5173
```

Seeded logins (password `password123` for all):

| Email | Role | Lands on |
|---|---|---|
| `owner@spice.com` | OWNER | `/owner` |
| `amit@spice.com` | WAITER | `/waiter` — tables 1–4 |
| `kitchen@spice.com` | KITCHEN | `/kitchen` |

Also worth opening: `http://localhost:3000/api/docs` (Swagger) and
`npx prisma studio` from `backend/`.

**Try the full loop:** sign in as Amit → take an order on Table 1 → send it to
the kitchen → open `/kitchen` in a second browser and watch the card arrive
without a reload → Start → Mark complete → back as Amit, view the bill and
close the table.

---

## The engineering decisions worth a look

Each of these is enforced in more than one layer on purpose. Full reasoning
lives in the layer documents linked below — this is the index.

**Tenant isolation is a database guarantee, not a code convention.**
Every tenant-owned row carries `restaurant_id`, taken only from the verified
JWT — never from a request body or query string. Composite foreign keys
(`(table_id, restaurant_id) → restaurant_tables (id, restaurant_id)`) mean
PostgreSQL itself refuses a cross-tenant link even if the API forgets to
filter.

**Prices are snapshotted, so a menu edit can't rewrite history.**
`order_items` copies `item_name` and `unit_price` from `menu_items` at insert
time. The client sends only `{ menuItemId, quantity }` — there is no price
field in the request shape, and the global validation pipe strips one if it
appears. `line_total` is a generated column the application can never write.

**Money is never a float, at any layer.**
`numeric(10,2)` in Postgres → `Prisma.Decimal` in services → a **string** on
the wire → integer paise for cart arithmetic in the browser → formatted only
at render time.

**Concurrency is resolved by the database, not a TypeScript `if`.**
State changes put the expected current state in the `WHERE` clause, so two
people clicking "Start" on the same order produce exactly one 200 and one 409.
Partial unique indexes do the same job for "one open session per table" and
"one active kitchen handler per restaurant" — two simultaneous session opens
return the *same* session.

**Realtime is an optimization, never a dependency.**
Sockets push updates; a 15-second poll takes over automatically whenever the
socket is down. The app is fully usable with WebSockets blocked entirely.

---

## Documentation

Implementation and execution detail is **not** in this README — it lives in
four layered documents, each the source of truth for its own layer, none
redefining a field another one declares.

| Document | Owns |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Orientation, the cross-cutting rules, running everything |
| [`database/CLAUDE.md`](database/CLAUDE.md) | **The data model** — every column, type, constraint, index, trigger, and a runnable query for every screen |
| [`backend/CLAUDE.md`](backend/CLAUDE.md) | **The API contract** — endpoints, RBAC, transactions, WebSocket events, runbook |
| [`frontend/CLAUDE.md`](frontend/CLAUDE.md) | The UI layer — routing, state, design system, screens, formatting rules |

Read one of those top to bottom to understand a layer as it stands today.

### How it was built

[`docs/build-log/`](docs/build-log/CLAUDE.md) is the companion **timeline** —
25 numbered steps recording the order the project was actually built in, from
the schema design through the final polish pass. Each step notes what shipped,
the decisions made and why, what was verified before moving on, and cites the
plan section it implements.

The sequence, in short: data model → API that enforces it → UI that consumes
it. Auth and RBAC land before any domain module because every later endpoint
sits behind them; the design system and API plumbing land before any screen
for the same reason.

---

## Status

Built, running and verified end to end.

- **Schema** applies from scratch — seven ordered migrations, extensions →
  tables → functions → triggers → indexes → constraints → generated columns.
- **API** passes its Jest unit suite (5 suites, 30 tests) plus a scripted run
  of every critical flow against the real seeded database: cross-tenant and
  cross-role rejection, concurrent session open, concurrent status
  transitions, the price-snapshot guarantee, refresh-token reuse detection,
  and bill arithmetic.
- **Frontend** passes its Vitest suite (7 files, 47 tests) and the production
  build was driven through all eleven screens in headless Chrome at 360, 390,
  768 and 1440 px with zero console errors.

**Known gaps**, both test-only and deliberately recorded rather than papered
over: backend e2e with Supertest + Testcontainers, and the Playwright flows
specified in `frontend/CLAUDE.md` § Testing.

Several real bugs were found by running the finished build and are documented
with their root causes in the layer docs — a refresh-token rotation race
caused by refreshing outside the single-flight latch, a socket torn down
mid-handshake by a second consumer, and a Radix `Select` mounting
uncontrolled against not-yet-loaded form data.
