# Multi-Tenant Restaurant SaaS

One product, many restaurants. Each tenant gets an owner, waiters, one kitchen
handler, a floor of tables, a menu, and orders that flow table → kitchen → bill.

Three projects, three plans. **Each plan owns its layer and is the source of
truth for it** — none of them redefines a field another one already declares.

| Folder | Layer | Plan |
|---|---|---|
| [`database/`](database/CLAUDE.md) | PostgreSQL 16 — schema, constraints, triggers, every query shape | source of truth for the **data model** |
| [`backend/`](backend/CLAUDE.md) | NestJS 11 + Prisma 6 — REST API, auth, RBAC, WebSockets | source of truth for the **API contract** |
| [`frontend/`](frontend/CLAUDE.md) | React 19 + Vite 7 + Tailwind 4 — owner, waiter and kitchen UIs | consumes both |

These three are **specifications** — read one top to bottom to understand a
layer as it stands today. [`docs/build-log/`](docs/build-log/CLAUDE.md) is
the companion **timeline**: 25 numbered steps recording the order the project
was actually built in, from the database design through the last frontend
polish pass, each citing the plan section it implements.

---

## Start everything

Prerequisites: **Node 22**, **npm 10**, **Docker Desktop** with hardware
virtualization enabled in the BIOS/UEFI.

```bash
# 1 — database + API
cd backend
npm install
docker compose -f docker/docker-compose.yml up -d db
npx prisma generate && npx prisma migrate deploy && npx prisma db seed
npm run start:dev                 # http://localhost:3000/api

# 2 — frontend, in a second terminal
cd frontend
npm install
npm run dev                       # http://localhost:5173
```

Open `http://localhost:5173` and sign in. The login screen has one-tap buttons
for the three seeded roles; the password for all of them is `password123`.

| Email | Role | Lands on |
|---|---|---|
| `owner@spice.com` | OWNER | `/owner` |
| `amit@spice.com` | WAITER | `/waiter` (tables 1–4) |
| `suresh@spice.com` | WAITER | `/waiter` (tables 5–8) |
| `kitchen@spice.com` | KITCHEN | `/kitchen` |

Also worth opening: `http://localhost:3000/api/docs` (Swagger) and
`npx prisma studio` from `backend/` (data browser).

### Try the whole loop

1. Sign in as **Amit**, tap **Take order** on Table 1.
2. Add a few items, hit **Preview**, then **Send to kitchen**.
3. In a second browser (or a private window) sign in as **Rahul** at `/kitchen` —
   the order arrives as a new card without a reload.
4. **Start** it, then **Mark complete**.
5. Back as Amit: **View bill**, then **Close table**. Closing is refused while
   anything is still in the kitchen.

---

## The rules that hold the whole thing together

These are enforced in more than one layer on purpose, and every plan repeats them
in its own terms:

- **Every tenant-scoped query filters by `restaurant_id`,** and that id comes
  only from the verified access token — never from a body, query string or
  header. Composite foreign keys make the database refuse a cross-tenant link
  even if the API forgets.
- **Prices are resolved server-side** from `menu_items` at order time and
  snapshotted into `order_items`. The client sends `{ menuItemId, quantity }` and
  nothing else; a later price change can never re-price a past bill.
- **Money is never a float.** `numeric(10,2)` in Postgres, `Prisma.Decimal` in
  the service layer, a **string** on the wire, integer paise in the browser's
  cart maths, and formatted only at render time.
- **State changes put the expected current state in the `WHERE` clause,** never
  in a TypeScript `if`. Two people clicking "Start" at the same moment: one wins,
  the other gets 409.
- **Realtime is an optimization, not a dependency.** Sockets push updates; a 15 s
  poll takes over whenever the socket is down, and the app is fully usable with
  WebSockets blocked entirely.

---

## Status

Built, running and verified end to end — the database schema applies from
scratch, the API passes its unit suite and a scripted run of every critical
flow, and the production frontend build was driven through all eleven screens in
a real browser with no console errors. Each plan's own **Runbook** and
**What was built** sections record the deviations and the checks behind that
claim.

Known gaps, both test-only: backend e2e with Supertest + Testcontainers, and the
Playwright flows in `frontend/CLAUDE.md` § Testing.
