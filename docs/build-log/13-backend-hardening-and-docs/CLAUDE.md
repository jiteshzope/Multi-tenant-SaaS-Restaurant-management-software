# Step 13 — Backend hardening & docs

**Depends on:** all of steps 02–12 — this is the pass across the whole
backend once every module existed, not a new module of its own.

## What shipped

- **Swagger** (`@nestjs/swagger`) at `/api/docs`, `persistAuthorization` on
  so a bearer token survives a page refresh while exploring the API by hand.
- **The Jest unit suite** — 5 spec files, 30 tests: `transform.interceptor.spec.ts`
  (Decimal → fixed-2 string, bigint → number, nested walks), `roles.guard.spec.ts`,
  `password.service.spec.ts` (Argon2id round-trip, per-hash salt, malformed
  hash → `false`), `all-exceptions.filter.spec.ts`, `prisma-error.spec.ts`.
- **A scripted end-to-end run against the real seeded database** — not
  Testcontainers e2e (left as the documented remaining gap), but a script
  that actually exercised login for all three roles, cross-tenant/cross-role
  403s and 401s, concurrent session-open, concurrent status transitions, the
  price-snapshot guarantee, refresh-token reuse detection, and the bill
  math — the full checklist recorded in *Verified behaviour* below.
- **ESLint actually working.** `npm run lint` had been broken from the
  start in a way that looked like a config problem: `eslint` was named in
  the plan's package list but never actually installed, so `npx eslint`
  silently fetched an arbitrary version from the registry, found no
  `eslint.config.js`, and printed a migration guide instead of failing
  loudly. Fixed by installing `eslint` 9 + `typescript-eslint` 8 at the same
  majors the frontend already pinned, and adding a real flat config
  (`eslint.config.mjs` — the `.mjs` extension is deliberate: the package is
  CommonJS for Nest's build, but flat config is ESM).
- The production `docker/Dockerfile` (written in step 02) exercised for
  real: `docker compose -f docker/docker-compose.yml up -d --build`, whose
  entrypoint runs `npx prisma migrate deploy` before `node dist/main.js`, so
  a fresh container converges its own schema.

## Two real bugs the first clean lint run found

1. `String(e.meta?.target ?? '')` in the Prisma `P2002` handlers — Prisma
   types `meta.target` as `unknown`, returning it as `string[]`, a bare
   string, or nothing depending on the error. Blind `String()` on the wrong
   shape produced the literal text `[object Object]`, which meant
   `target.includes('email')` silently returned `false` and a duplicate
   email surfaced as an unhandled `500` instead of `409 EMAIL_TAKEN`. Fixed
   in `common/prisma-error.ts`, covered by `prisma-error.spec.ts`.
2. The same failure one layer out, in the exception filter's message
   formatting — a non-string exception message became `[object Object]` in
   the response body a client would display. Fixed to fall back to the
   exception's own message.

## Key decisions

| Decision | Reason |
|---|---|
| Scripted API run over Supertest + Testcontainers e2e | Covers the real database and real HTTP surface end to end without the added infrastructure weight; documented explicitly as the remaining gap rather than silently skipped |
| `recommendedTypeChecked` ESLint config, not plain `recommended` | The strict-TS contract exists specifically to catch an `any` leaking out of a `$queryRaw` before it reaches a response body — only the type-aware rules see that |
| Fix the lint failures found, don't silence them | All 17 errors on the first clean run were real; suppressing them would have re-hidden exactly the class of bug (`[object Object]` in a response) that had been running unnoticed |

## Verified behaviour (the full scripted checklist)

Argon2id login for all three roles, wrong password → 401; waiter hitting
`/staff` → 403 `FORBIDDEN_ROLE`; waiter reading another waiter's table →
403 `TABLE_NOT_ASSIGNED`; two concurrent `POST /sessions` → the same session
id; `sync_table_status` flipping correctly both directions; price-snapshot
holding after a menu price change; a smuggled `unitPrice` field stripped by
`forbidNonWhitelisted`; unavailable item → 400 `ITEM_UNAVAILABLE`; close
blocked with orders in progress → 409 `ORDERS_IN_PROGRESS`; two simultaneous
"Start" clicks → one 200, one 409 `ORDER_ALREADY_MOVED`; board columns each
sorted on their own timestamp; `reopen` preserving `preparingAt` and card
position; bill totals correct; second active `KITCHEN` handler → 409;
duplicate email → 409 `EMAIL_TAKEN`; refresh rotation + replay → 401
`TOKEN_REUSED` and the whole family revoked; reports returning money as
strings and counts as numbers.

## Source of truth

[`backend/CLAUDE.md`](../../../backend/CLAUDE.md) → *What was built*
(the full deviation table), *Linting*, *Tests*, and *Build order* item 12.
