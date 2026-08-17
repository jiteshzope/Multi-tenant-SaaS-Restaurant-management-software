# Step 05 — RBAC, restaurant & staff modules

**Depends on:** [04 — Authentication & refresh tokens](../04-authentication-and-refresh-tokens/CLAUDE.md)
(needs `request.user` populated by `JwtAuthGuard` before a role can be
checked).

## What shipped

- `RolesGuard`, registered globally alongside `JwtAuthGuard`, reading
  `@Roles(...)` metadata against `request.user.role`.
- `@Roles()`, `@CurrentUser()` (typed `AuthUser`) and `@RestaurantId()`
  (reads `request.user.rid`) decorators — the vocabulary every later module
  is written in.
- `TableAccessGuard` — a `WAITER` may only act on tables actively assigned
  to them; `OWNER` bypasses it. Written here even though `tables`/`orders`
  don't exist yet, because it's part of the same authorization layer.
- `RestaurantsModule` — `GET /restaurant` (any authenticated role), `PATCH
  /restaurant` (`OWNER` only — name, phone, address, `taxPercent`, timezone).
- `StaffModule` — the owner-creates-staff flow:
  - `POST /staff` — creates a `User` + `RestaurantUser` membership in one
    transaction; catches Prisma `P2002` to distinguish a duplicate email
    (`409 EMAIL_TAKEN`) from a second active `KITCHEN` row (`409
    KITCHEN_EXISTS`), both of which are actually the same database
    constraint firing for different reasons.
  - `GET /staff`, `GET /staff/waiters` (dropdown source for table
    assignment), `PATCH /staff/:userId`, `PATCH /staff/:userId/password`
    (owner resets a staff password), `PATCH /staff/:userId/status`
    (activate/deactivate).

## Key decisions

| Decision | Reason |
|---|---|
| RBAC guard and tenant-access guard kept separate (`RolesGuard` vs `TableAccessGuard`) | "Can a KITCHEN user hit this route at all" and "does this specific WAITER own this specific table" are different questions with different failure codes (`403 FORBIDDEN_ROLE` vs `403 TABLE_NOT_ASSIGNED`) |
| Staff creation is one transaction, not two sequential writes | A user created without its membership row is an orphan account nobody can use or find |
| The database's `uq_one_active_kitchen_per_restaurant` partial index is the actual enforcement, not application logic | The API catches the resulting `P2002` rather than pre-checking "does a kitchen handler already exist" — closes the race between two simultaneous creates |
| Owner row is never deactivatable from `PATCH /staff/:userId/status` | There must always be exactly one way to administer a restaurant |

## Verified

Scripted checks: a `WAITER` calling `GET /staff` returns `403
FORBIDDEN_ROLE`; an unauthenticated call returns `401`; creating a second
`KITCHEN` user for the same restaurant returns `409 KITCHEN_EXISTS`;
creating a user with an email already in use returns `409 EMAIL_TAKEN`
— both traced through `common/prisma-error.ts`'s normalization of Prisma's
`meta.target`, which is `unknown`-typed and needed a real fix (see step 13)
before this distinction could be trusted.

## Source of truth

[`backend/CLAUDE.md`](../../../backend/CLAUDE.md) → *RBAC*, *API endpoints*
(`/api/restaurant`, `/api/staff`), *Services & critical transactions*
(`StaffService.create`), and *Build order* item 4.
