# Build Log — how this project was actually planned and built

This is a step-by-step record of the order the project was built in, one folder
per step. It exists for a different reason than the three plan documents at
[`database/CLAUDE.md`](../../database/CLAUDE.md), [`backend/CLAUDE.md`](../../backend/CLAUDE.md)
and [`frontend/CLAUDE.md`](../../frontend/CLAUDE.md): those three are **specifications** —
the complete, current source of truth for their layer, meant to be read top to
bottom or grepped for a section. This log is a **timeline** — it shows the
sequence of decisions, what existed after each step, and what broke and got
fixed along the way. Read the plan docs to understand the system as it is;
read this log to understand the order it was built in and why that order was
chosen.

Every step below cites the exact section of the layer's plan document it
implements, so nothing here duplicates the full spec — each folder is a short
"what shipped in this step, and what it depended on" note.

## Why this order

Data model first, then the API that enforces it, then the UI that consumes
it — because a UI built against an unstable contract is wasted work twice
over, and a multi-tenant system's hardest bugs (cross-tenant leaks, double
writes, stale prices) are cheapest to close off with a `CHECK` constraint or
a composite foreign key **before** there is a service layer papering over
their absence. Inside the backend, auth and RBAC land before any domain
module because every later endpoint sits behind them. Inside the frontend,
the design system and the API/auth plumbing land before any screen, because
every screen after that is "consume this contract," not "invent scaffolding."

## The 25 steps

### Phase 0 — Data model
| Step | What shipped |
|---|---|
| [01 — Database schema design](01-database-schema-design/CLAUDE.md) | The 12-table multi-tenant data model, the ER diagram, the multi-tenancy strategy — designed and written down before any code |

### Phase 1 — Backend (NestJS 11 + Prisma 6)
| Step | What shipped |
|---|---|
| [02 — Project scaffolding & tooling](02-project-scaffolding-and-tooling/CLAUDE.md) | Docker Compose + Postgres, Nest skeleton, `PrismaService`, health endpoint |
| [03 — Prisma migrations & seed data](03-prisma-migrations-and-seed-data/CLAUDE.md) | `schema.prisma`, the seven hand-sequenced migrations, `seed.ts` |
| [04 — Authentication & refresh tokens](04-authentication-and-refresh-tokens/CLAUDE.md) | Argon2id, JWT access tokens, rotating refresh tokens, reuse detection |
| [05 — RBAC, restaurant & staff modules](05-rbac-restaurant-and-staff/CLAUDE.md) | Guards, decorators, the owner-creates-staff flow |
| [06 — Menu module](06-menu-module/CLAUDE.md) | Categories, items, availability, search |
| [07 — Tables & assignments](07-tables-and-assignments/CLAUDE.md) | Physical tables, waiter assignment history |
| [08 — Table sessions](08-table-sessions/CLAUDE.md) | Idempotent open, bill, close |
| [09 — Orders module](09-orders-module/CLAUDE.md) | The place-order transaction — the heart of the app |
| [10 — Kitchen module](10-kitchen-module/CLAUDE.md) | The board query, guarded status transitions |
| [11 — Realtime gateway](11-realtime-gateway/CLAUDE.md) | WebSocket rooms wired into orders + kitchen |
| [12 — Reports module](12-reports-module/CLAUDE.md) | `$queryRaw` aggregate endpoints |
| [13 — Backend hardening & docs](13-backend-hardening-and-docs/CLAUDE.md) | Swagger, Jest suite, ESLint fixed, production Dockerfile, scripted end-to-end verification |

### Phase 2 — Frontend (React 19 + Vite 7 + Tailwind 4)
| Step | What shipped |
|---|---|
| [14 — Frontend scaffolding & design system](14-frontend-scaffolding-and-design-system/CLAUDE.md) | Vite + Tailwind v4 + shadcn/ui, design tokens, dark mode |
| [15 — API layer & state management](15-frontend-api-layer-and-state/CLAUDE.md) | `client.ts`, single-flight refresh, TanStack Query, Zustand stores |
| [16 — Auth flow & routing](16-frontend-auth-and-routing/CLAUDE.md) | Boot gate, login, `ProtectedRoute`, `RoleGate`, the router |
| [17 — Owner shell & staff UI](17-owner-staff-ui/CLAUDE.md) | First full CRUD screen — the template every later screen copies |
| [18 — Menu management UI](18-owner-menu-ui/CLAUDE.md) | Categories + items, the data the order screen needs |
| [19 — Tables & assignments UI](19-owner-tables-ui/CLAUDE.md) | Owner table grid, waiter assignment |
| [20 — Sessions & table detail UI](20-sessions-and-table-detail-ui/CLAUDE.md) | Open/close a table, order timeline, bill |
| [21 — Take Order screen](21-take-order-screen/CLAUDE.md) | The core UI — cart, search, preview, send to kitchen |
| [22 — Kitchen board UI](22-kitchen-board-ui/CLAUDE.md) | Three columns, optimistic guarded transitions |
| [23 — Frontend realtime integration](23-frontend-realtime-integration/CLAUDE.md) | Socket wired to the Query cache, polling fallback |
| [24 — Reports UI](24-reports-ui/CLAUDE.md) | Lazy-loaded Recharts dashboard |
| [25 — Polish, accessibility & testing](25-polish-accessibility-and-testing/CLAUDE.md) | Print bill, responsive pass, four real bugs found and fixed, Vitest suite |

## How to read a step folder

Each `CLAUDE.md` in these folders follows the same shape:

- **Depends on** — the steps that had to exist first
- **What shipped** — concretely, by file/module/endpoint name
- **Key decisions** — the choice made and the one-line reason
- **Verified** — what was actually run/tested/observed before moving on
- **Source of truth** — the section of `database/`, `backend/` or `frontend/`
  `CLAUDE.md` that fully specifies this step; go there for exhaustive detail
