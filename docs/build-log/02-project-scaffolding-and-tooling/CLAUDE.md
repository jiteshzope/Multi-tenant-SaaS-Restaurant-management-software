# Step 02 — Project scaffolding & tooling

**Depends on:** [01 — Database schema design](../01-database-schema-design/CLAUDE.md)
(the model this scaffolding will eventually persist).

## What shipped

The empty-but-running skeleton everything else in the backend was built
inside:

- `backend/` bootstrapped with the Nest CLI (`nest new backend --strict
  --package-manager npm`) — TypeScript strict mode from the first commit.
- `backend/docker/docker-compose.yml` — a `db` service (`postgres:16-alpine`,
  named volume `pgdata`, `pg_isready` healthcheck) and an `api` service built
  from `Dockerfile.dev` with a source bind-mount for hot reload, gated on
  `db` being `service_healthy`.
- `backend/docker/Dockerfile` — the production multi-stage build: `deps`
  (`npm ci`) → `build` (`prisma generate` + `nest build`) → `runner`
  (`node:20-alpine`, non-root user). Written at this step even though it
  isn't exercised until step 13, because "how does this ship" is a scaffolding
  decision, not an afterthought.
- `src/prisma/prisma.module.ts` + `prisma.service.ts` — `PrismaService`
  extends `PrismaClient` with `onModuleInit`/`onModuleDestroy` lifecycle
  hooks, registered as a global module so every later feature module injects
  it without re-importing.
- `src/config/configuration.ts` + `env.validation.ts` — a Zod schema wired
  into `ConfigModule.forRoot({ validate })` so the app **refuses to boot**
  with a missing secret, rather than starting and failing the first request
  that needs it.
- A plain `HealthController` — `GET /health` (liveness) and `GET /health/ready`
  (pings PostgreSQL through `PrismaService`) — the first endpoint that could
  actually be curled.
- `.env.example` and `.dockerignore` (`node_modules`, `dist`, `.git`, `.env`,
  `test`).

## Key decisions

| Decision | Reason |
|---|---|
| `@nestjs/terminus` in the original plan, replaced by a plain `HealthController` | Two endpoints that need no indicator framework — the dependency was removed rather than left half-used |
| Fail-fast env validation from the first commit | A missing `JWT_ACCESS_SECRET` should be a boot-time error, not a 500 on the first login attempt three modules later |
| Production Dockerfile written before there's anything worth deploying | Deploy shape (non-root user, multi-stage, `migrate deploy` in the entrypoint) is an architectural decision, cheaper to get right early than to retrofit |
| Dev container source-bind-mounted, not rebuilt on every change | `npm run start:dev` watch mode inside the container matches the host workflow |

## Verified

`docker compose -f docker/docker-compose.yml up -d db` brings up Postgres;
`npm run start:dev` boots Nest against it; `GET /api/health` and
`GET /api/health/ready` both return `200`. This is the first point in the
build where "the backend runs" is a true statement — with no domain logic
in it yet.

## Source of truth

[`backend/CLAUDE.md`](../../../backend/CLAUDE.md) → *Folder structure*,
*Docker*, and *Build order* item 1 ("Docker compose + Postgres + Nest
skeleton + `PrismaService` + health endpoint").
