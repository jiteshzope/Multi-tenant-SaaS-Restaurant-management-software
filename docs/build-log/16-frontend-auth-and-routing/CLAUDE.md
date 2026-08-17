# Step 16 — Auth flow & routing

**Depends on:** [15 — API layer & state management](../15-frontend-api-layer-and-state/CLAUDE.md)
(the boot gate calls the same refresh path this step wires into the router).

## What shipped

- The boot sequence in `main.tsx`, run **before** the router renders: read
  the persisted refresh token; if present, `POST /auth/refresh`, then
  `GET /auth/me`, connect the socket, and only then render; if absent or the
  refresh fails, clear the store and render straight to `/login`. An
  `AuthBootGate` shows a full-page skeleton during this step so the login
  screen never flashes and vanishes.
- `LoginPage` — one-tap buttons for the three seeded roles alongside the
  real form, `?reason=expired` rendered as an inline "session expired, log
  in again" alert.
- `RegisterRestaurantPage`.
- `createBrowserRouter` with role-branch layout routes: `ProtectedRoute`
  (unauthenticated → `/login`, preserving `?next=`) wrapping `RoleGate`
  (wrong role → `/403`).
- `ROLE_HOME` in `lib/constants.ts` — the single mapping `OWNER → /owner`,
  `WAITER → /waiter`, `KITCHEN → /kitchen`, reused by post-login redirect,
  the logo link, and 403 recovery.
- `ErrorBoundary` at the router root plus one per feature branch.

## Key decisions

| Decision | Reason |
|---|---|
| Refresh runs before the router renders, not after a redirect to `/login` | Avoids the flash of an unauthenticated screen for a user who actually has a valid session — a UX detail, but the wrong choice here directly caused the boot-gate bug documented in step 25 |
| `RoleGate` treated as convenience, not security | The backend enforces every permission independently; a hidden button or a client-side redirect is never the actual authorization boundary |
| One shared `ROLE_HOME` constant | Post-login redirect, the logo, and 403 recovery must never disagree about where a given role's home screen is |
| `?next=` preserved by `ProtectedRoute` at this step | Deep-linking (e.g. a bookmarked table detail page) should survive a session bounce — though see step 25 for why naive replay of `next` was itself a bug that needed a second pass |

## Verified

Signing in as each of the three seed accounts landed on the correct role
home. An unauthenticated visit to `/owner/staff` redirected to `/login` and
back to `/owner/staff` after signing in. A `WAITER` visiting `/owner/staff`
directly (URL typed by hand) landed on `/403`, confirming `RoleGate` fires
even when no UI link would ever have offered that path.

## Source of truth

[`frontend/CLAUDE.md`](../../../frontend/CLAUDE.md) → *Auth & token
lifecycle*, *Routes & guards*, and *Build order* item 3. (The `?next=`
replay bug found on the second pass through this flow is recorded in
[step 25](../25-polish-accessibility-and-testing/CLAUDE.md), not here — this
step captures what shipped first.)
