# Step 15 — API layer & state management

**Depends on:** [14 — Frontend scaffolding & design system](../14-frontend-scaffolding-and-design-system/CLAUDE.md)
(needs the project skeleton to hang the API layer on) and the backend's
documented response envelope from step 13.

## What shipped

- `src/types/` — `ApiResponse<T>`, `ApiErrorBody`/`ErrorCode` (mirroring the
  backend's *Domain error codes* list one for one), and domain types
  (`Restaurant`, `User`, `MenuItem`, `KitchenOrder`, …) where **money and
  dates cross the wire as strings**, never numbers (`type Money = string`,
  `type Iso = string`) — matching `Prisma.Decimal` and `timestamptz`
  serialization exactly.
- `api/client.ts` — one Axios instance. Request interceptor attaches the
  bearer token from the auth store; success interceptor unwraps
  `response.data.data`; error interceptor normalizes every failure into a
  typed `ApiError` so no screen ever inspects `err.response?.data?.…`
  directly.
- **Single-flight refresh** on 401: the first 401 starts
  `POST /auth/refresh`, every other in-flight 401 awaits the same promise
  rather than each starting its own rotation. A failed refresh clears the
  store, disconnects the socket, and redirects to `/login?reason=expired`.
  Never retries a request twice; never retries `/auth/refresh` itself.
- `api/endpoints.ts` and one resource module per backend module
  (`auth.api`, `staff.api`, `tables.api`, `menu.api`, `sessions.api`,
  `orders.api`, `kitchen.api`, `reports.api`) — plain typed async functions,
  no React in this layer, which is what makes them mockable in tests.
- `queryClient.ts` — TanStack Query defaults (`staleTime: 30_000`, `retry:
  1`, never retrying 4xx, `refetchOnWindowFocus: true`) and the query-key
  factory `qk` in `lib/constants.ts`, so no component ever writes a raw
  array literal as a query key.
- `store/auth.store.ts`, `store/cart.store.ts`, `store/ui.store.ts`
  (Zustand + `persist`) — the access token is explicitly excluded from
  persistence via `partialize`; only the refresh token and non-sensitive UI
  state survive a reload.

## Key decisions

| Decision | Reason |
|---|---|
| Envelope unwrapping happens in exactly one place (`client.ts`) | If the backend's response shape ever changes, one file changes — no screen should know the envelope exists |
| Single-flight refresh | Without it, several components hitting 401 at once each rotate the refresh token, and only the first rotation wins — the rest get `401 TOKEN_REUSED` from the backend's own theft detection (see step 25 for the real bug this caused) |
| Access token kept in memory only, refresh token in `localStorage` | Limits the blast radius of an XSS reading persisted storage — only the longer-lived, revocable refresh token is there, and even that has a documented hardening path to an httpOnly cookie |
| `qk` factory instead of literal query keys | An invalidation can never silently miss a key because of a typo in a hand-written array |

## Verified

`api/client.test.ts` proves the single-flight guarantee directly: two
parallel requests that both 401 result in **exactly one**
`POST /auth/refresh` call, not two. A failed refresh is confirmed to clear
the auth store. Typed error mapping was checked against each backend error
code in the shared `ErrorCode` union.

## Source of truth

[`frontend/CLAUDE.md`](../../../frontend/CLAUDE.md) → *API layer*,
*TypeScript & domain types*, *State management*, *TanStack Query
conventions*, and *Build order* item 2.
