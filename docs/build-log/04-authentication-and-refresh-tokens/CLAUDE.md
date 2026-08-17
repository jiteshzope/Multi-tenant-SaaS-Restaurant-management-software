# Step 04 — Authentication & refresh tokens

**Depends on:** [03 — Prisma migrations & seed data](../03-prisma-migrations-and-seed-data/CLAUDE.md)
(needs `users` and `refresh_tokens` to exist and be seeded).

## What shipped

- `PasswordService` — Argon2id hash/verify, cost parameters read from env
  (`ARGON2_MEMORY_COST`, `ARGON2_TIME_COST`, `ARGON2_PARALLELISM`).
- `TokenService` — issues an access/refresh pair, rotates a refresh token,
  detects reuse, revokes a whole token family.
- `JwtStrategy` (Passport, backs the global `JwtAuthGuard`) for the 15-minute
  access token. Login and refresh are **not** Passport strategies — refresh
  needs a database lookup by `jti` plus an Argon2 verify before it can accept
  anything, which lives in `TokenService.rotate()`; login is a plain
  controller call for the same reason.
- `POST /auth/register-restaurant` — restaurant + owner user + membership
  created in one transaction.
- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET
  /auth/me`, `PATCH /auth/me/password`.
- The `@Public()` decorator + globally-registered `JwtAuthGuard` — every
  route is private by default from this step forward; a route opts **out**,
  never in.

## The refresh-token design, implemented

- Access token payload: `{ sub: userId, rid: restaurantId, role, iat, exp }`.
  `rid` and `role` are read only from the verified token — never from a
  request body.
- Refresh token payload: `{ sub: userId, jti: refreshTokenId, fid: familyId,
  iat, exp }`. Because Argon2 salts every hash, `WHERE token_hash = …` can
  never match, so the row is found by `jti` first and then verified with
  `argon2.verify()`.
- **Rotation**: every successful refresh revokes the presented row
  (`revoked_reason = 'ROTATED'`) and inserts its replacement in the same
  `family_id`, linked via `replaced_by_id`.
- **Reuse detection**: a refresh token that is already `revoked_at` can only
  mean it was copied — revoking the whole family logs out the thief and the
  legitimate user together, and the client sees `401 TOKEN_REUSED`.

## Key decisions

| Decision | Reason |
|---|---|
| `@node-rs/argon2` instead of `argon2` | Prebuilt native binaries — no node-gyp/MSVC toolchain needed on Windows; same Argon2id, same cost parameters |
| No `JwtRefreshStrategy` / `LocalStrategy` | Both routes need a database round-trip before the token can be judged valid, which is service logic, not a Passport strategy's job |
| Refresh token stored **hashed**, never plaintext | A database leak yields nothing usable; the same reasoning as password storage |
| Global `JwtAuthGuard`, opt-out via `@Public()` | New endpoints are private by default — a forgotten guard can never accidentally expose one |

## Verified

A scripted run against the seeded database confirmed: Argon2id login
succeeds for all three seed roles and a wrong password returns `401
INVALID_CREDENTIALS`; refresh rotation followed by replaying the old
(now-revoked) token returns `401 TOKEN_REUSED` **and revokes the entire
family**, not just the replayed row; an unauthenticated request to any
non-`@Public()` route returns `401` with no route-specific special-casing
needed.

## Source of truth

[`backend/CLAUDE.md`](../../../backend/CLAUDE.md) → *Auth* section (flow,
token payloads, what to implement) and *Build order* item 3;
[`database/CLAUDE.md`](../../../database/CLAUDE.md) → *Core tables* (the
`refresh_tokens` design) and example queries 3a–3g (issue, rotate, detect
reuse, logout, active sessions, cleanup).
