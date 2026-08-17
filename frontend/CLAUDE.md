# React Frontend — Multi-Tenant Restaurant SaaS

The API contract lives in `../backend/CLAUDE.md`; the data model and the exact
shape of every payload lives in `../database/CLAUDE.md`. Those two are the source
of truth — this file never redefines a field name, it consumes one.

**Status: built and running.** The plan below is implemented; the runbook and the
list of deliberate deviations are in [Runbook](#runbook) and
[What was built](#what-was-built).

---

## Runbook

### Prerequisites

Node 22.x and npm 10.x. **The backend must be running on `:3000`** — the dev
server proxies to it, so development is same-origin and CORS can never mask a
real bug.

### First run, from `frontend/`

```bash
npm install          # ~1 min
npm run dev          # http://localhost:5173
```

`.env` ships with `VITE_API_URL=/api` and an empty `VITE_SOCKET_URL`, which means
"same origin" — the Vite proxy forwards `/api`, `/realtime` and `/socket.io` to
`http://localhost:3000`. Point `VITE_PROXY_TARGET` somewhere else if the API is
not on that port.

Sign in with any seed account (password `password123`); the login screen has
one-tap buttons for all three roles:

| Email | Lands on |
|---|---|
| `owner@spice.com` | `/owner` — dashboard, tables, menu, staff, kitchen, reports, settings |
| `amit@spice.com` | `/waiter` — the four tables assigned to Amit |
| `kitchen@spice.com` | `/kitchen` — the three-column board |

### Everyday commands

```bash
npm run dev          # dev server + API proxy
npm run build        # tsc -b && vite build  →  dist/
npm run preview      # serve dist/ on :4173, same proxy
npm run typecheck    # tsc -b --noEmit
npm run lint         # eslint (flat config)
npm run format       # prettier + tailwind class sorting
npm test             # vitest run
npm run test:cov     # coverage over lib/ store/ schemas/ api/client.ts
npm run palette      # validate the dark chart ramp — run after touching --chart-*
```

### Deploying

`npm run build` emits a static `dist/`. Serve it from any static host **with an
SPA fallback** (every unknown path → `index.html`, because the router owns
`/owner/tables/:id`), and put `/api`, `/realtime` and `/socket.io` behind the
same origin via a reverse proxy. Same-origin in production keeps the setup
identical to development and avoids CORS entirely.

If you would rather point the browser straight at the API, set both env vars at
build time instead:

```
VITE_API_URL=https://api.example.com/api
VITE_SOCKET_URL=https://api.example.com
```

and add that origin to the backend's `CORS_ORIGIN`.

Build output is vendor-split so an app deploy does not invalidate the libraries
in the browser cache:

| Chunk | gzip | Loaded by |
|---|---|---|
| `index` | ~171 kB | every screen |
| `charts` (Recharts) | ~113 kB | **only** the owner dashboard and reports |
| `query`, `forms`, `react`, `dates` | ~46 / 29 / 31 / 8 kB | every screen |

A waiter on a tablet and a kitchen handler on a wall screen never download
Recharts at all.

---

## What was built

Everything in the plan below is implemented, with these deliberate deviations:

| Plan said | Built as | Why |
|---|---|---|
| `npx shadcn@latest init` + `add …` | The same primitives vendored by hand into `src/components/ui/` | The generator is interactive and network-bound. `components.json` is present and correct, so `npx shadcn@latest add <component>` works normally from here. The files follow current shadcn output: Radix + CVA + `cn()`, `ref` as a plain prop, no `forwardRef`. |
| `z.uuid()` | `z.guid()` | Zod 4's `uuid()` enforces the RFC 9562 version and variant nibbles. The fixed seed ids (`11111111-1111-…`, `c0000000-0000-…`) deliberately do not carry them, and Nest's `ParseUUIDPipe` accepts the loose form — so `guid()` is what actually matches the backend. |
| MSW handlers | Vitest mocks at the axios adapter | The suite is the "minimal tests" set: pure logic plus the one integration point that is genuinely tricky (single-flight refresh). MSW is the natural next step when component tests arrive. |
| Playwright e2e | Not implemented | Left as the remaining gap. The flows were instead verified by driving the production build in headless Chrome — see below. |
| shadcn `Form` / `FormField` | A small `Field` wrapper | Label + control + `role="alert"` message, wired to `formState.errors`. RHF + `zodResolver` are used exactly as planned. |
| Prep time as "stat card + AreaChart" | Three stat tiles | The `/reports/prep-time` payload is three scalars (avg, worst, count) — there is no series to plot. Plotting two numbers would be a one-bar bar chart in disguise. |
| Optional React Compiler | **Off** | Decided once, at step 1, as the plan requires. `useMemo`/`useCallback` are therefore written explicitly where they matter. |

### Design system notes

- **Dark is the default** and `<html class="dark">` ships in `index.html`, so
  there is no light flash before hydration. `ui.store` persists the choice and
  the topbar toggles it.
- Every colour is a token in the `@theme` block of `src/index.css`. There is no
  `tailwind.config.ts` — Tailwind v4 is configured in CSS.
- **The dark base is a deep indigo-black, not a neutral grey** (`oklch(0.16
  0.019 266)`). Saturated status colours need something to sing against; flat
  grey flattens them. Three fixed radial washes — saffron top-right, blue
  bottom-left, violet bottom-centre — give the shell depth without touching
  legibility.
- **Five status hues, spread round the wheel** so no two read alike glanced at
  across a room: pending amber 72, preparing blue 252, completed green 155,
  occupied violet 300, and vacant slate 250 as the only deliberate near-neutral.
  Each is re-stepped for dark rather than reused from light.
- **The chart ramp is validated, not eyeballed** — `npm run palette` runs
  `scripts/validate-palette.mjs`, which parses the `.dark` block out of
  `index.css` and checks OKLCH L inside 0.48–0.67, chroma ≥ 0.10, ≥ 3:1 against
  `--card`, and adjacent-pair ΔE ≥ 8 under normal vision plus protanopia,
  deuteranopia and tritanopia. It exits non-zero, so CI can gate on it. Run it
  before changing `--chart-*`.
- Every chart plots a **single series**, so none carries a legend — the card
  title names what is drawn, with a leading mark in the series colour. Marks
  follow one spec: 2px lines, ≤24px bars with a 4px rounded data-end, ~10% area
  washes, hairline solid grid, and a tooltip on every chart.
- Status is never colour alone: `StatusBadge` is the only place an enum maps to
  a token, and it always renders an icon plus the word.
- **`.toned` is how a surface carries a status hue.** A component sets `--tone`
  inline from a status token and adds `toned` (tint + border), `toned-hover`
  (lift) or `tone-rail` (the 4px edge). The tint, the border and the badge on
  top can then never disagree, because they all read the same variable.

### Three bugs found by running it, and fixed

1. **The boot gate refreshed outside the single-flight latch.** `AuthBootGate`
   used a bare `axios.post('/auth/refresh')`, so React StrictMode's
   double-invoked effect rotated the *same* refresh token twice. One rotation
   won; the loser came back 401 `TOKEN_REUSED`, which is the backend correctly
   reporting a stolen-token replay — and the whole family was revoked. Visible
   symptom: deep-linking to `/waiter/tables/:id` bounced to `/waiter`, because
   the failed refresh fired `onSessionLost` → `/login` → and the login screen
   then redirected the (still valid) session to its role home.

   Fix: `client.ts` exports `refreshSession()`, the same latch the 401 retry
   uses, and the boot gate calls it. **Everything that refreshes now goes through
   one promise.** The latch is per-tab, which is why the `storage` listener in
   `main.tsx` exists.

2. **`connectSocket` tore down a socket mid-handshake.** The shell and the
   kitchen board both call `useSocket()`. The second caller found
   `socket.connected === false` (still opening), called `disconnectSocket()` —
   which runs `removeAllListeners()` — and opened a new one, orphaning the first
   caller's handlers. The result: the topbar showed "Live" while the board sat on
   "Refreshing every 15 s" and kept polling. Reuse now keys on the token alone.

3. **`Card` is `flex flex-col`,** so adding `flex flex-wrap` to a card that
   should be a row did nothing. The table-detail running-total card needed an
   explicit `flex-row`.

One environment note that cost time: the dev proxy targets **`127.0.0.1:3000`,
not `localhost:3000`**. On a dual-stack machine Node resolves `localhost` to
`::1` first and, unlike a browser, does not fall back — so the proxy returned
nothing against an API listening on IPv4. Override with `VITE_PROXY_TARGET`.

### The responsive and colour pass

A second run through every screen at 360, 390, 768 and 1440 px found content
being trimmed rather than laid out. What changed:

| Symptom | Cause | Fix |
|---|---|---|
| Owner table cards sliced "Assign"/"Edit" off the right edge at **every** width | one non-wrapping flex row inside an `overflow-hidden` card | primary action owns a full-width row, secondaries wrap under it |
| Staff table silently lost its Active toggle and Reset password on a phone | `<table class="w-full">` with no floor width crushes, then clips, with no scroll affordance | `DataTable` takes `minWidth`, wraps in `Scroller`, and columns declare a breakpoint via `meta.className` — anything dropped reappears elsewhere in the row |
| Menu descriptions rendered as "Char-…" | `line-clamp-1` in a squeezed column | two-line clamp, plus a width floor on the name column |
| Take-order categories past "Main Course" invisible on a phone | horizontal strip with a hard edge | `Scroller` fades whichever edge still has content |
| Kitchen columns wasted two-thirds of a tablet, and cut the last card in half | `lg:grid-cols-3` and a fixed `max-h` at every size | three columns from `md`; the height cap applies only from `md` up, so a phone column sizes to its contents |
| Kitchen timers read "279:40" | `formatClock` only ever emitted minutes | switches to `4h 39m` past an hour (covered by `lib/datetime.test.ts`) |
| Menu page overflowed the viewport at 360px | a `1fr` grid track takes its content's min-content width, so the table's floor width pushed the page wide | `min-w-0` on the track; `html`/`body` also get `overflow-x: clip` as a backstop |
| Restaurant name truncated to "Spice Ga…" at 360px | six controls competing in a 16-rem-tall bar | sound and theme toggles move into the account menu below `sm` |
| Category edit/reorder buttons unreachable on touch | `opacity-0 group-hover:opacity-100` | hover-gated only from `lg` up |
| **Kitchen columns stopped scrolling entirely** — a regression from the `Scroller` refactor above, caught on a board with 22 orders | the cap (`md:max-h-…`) landed on the wrapper and the `overflow` on the child; `height: 100%` against a max-height-only parent is `auto`, so the child grew to full content height and the section's `overflow-hidden` just clipped it | viewport carries `h-full max-h-[inherit]` so cap and overflow sit on one element — see the breakpoint rules in §12 |

Colour became load-bearing rather than decorative: stat tiles, kitchen columns,
table cards, filter pills and the login role buttons all take their hue from the
same status token the badge on them uses, via `.toned`. The kitchen card's age
ramp now drives border, timer chip and glow from one `--tone`, so a card can
never show a green rim above a red clock.

Overflow is checked by walking every rendered element and comparing its right
edge to the viewport — `documentElement.scrollWidth` cannot see it once
`overflow-x: clip` is set, which is exactly how the menu-page overflow survived
the first pass.

### A waiter signing in landed on /403

Reported after the pass above, and worth stating as a rule rather than a patch:
**`?next=` belongs to the route that was blocked, not to the person who signs in
next.**

`ProtectedRoute` parks the attempted path in `?next=` so a dropped session
returns where it was. But the two are not the same person on a shared tablet:
the owner's session drops on `/owner/kitchen`, a **waiter** signs in, and the
login screen replayed `next` straight into `navigate()`. `RoleGate` then did its
job and bounced them to `/403` immediately after a login that had just
succeeded. "Back to home" worked, which is what made it look cosmetic — it reads
`ROLE_HOME` and so never consulted `next` at all.

`postLoginPath(next, role)` in `lib/constants.ts` now owns the decision, and
`RoleGate` and it agree on one fact — the branch each role owns. `next` is
followed only when the signing-in role may actually reach it, and only when it
is a plain same-origin absolute path: it is query-string text, so `//host/x`,
`https://…` and malformed percent-encoding are discarded rather than handed to
the router. A legitimate deep link still survives — an owner bounced off
`/owner/reports` returns to `/owner/reports`.

Covered by `lib/constants.test.ts`, including the prefix-collision case
(`/waiterly` must not pass as inside `/waiter`).

### A fourth bug, found the same way

**Radix `Select` decides controlled-vs-uncontrolled from its first `value`, and
the owner's timezone paid for it.** `SettingsPage` held one `useForm` with
`values: restaurant.data ? {…} : undefined`. RHF applies `values` in an effect,
so the form's first paint ran with the field still empty; the Select mounted
uncontrolled, immediately emitted `onValueChange('')`, and that empty string
landed back in the form *after* the reset. Visible symptom: a restaurant with
`Asia/Kolkata` set showed "Choose a timezone", and saving would have written the
blank over it.

Two changes, both needed. Every Select is now a registered field through
`Controller` with `value={field.value ?? ''}` — `watch` + `setValue` never
registers the field at all. And the profile form is a child component that
renders only once the restaurant has loaded and seeds `defaultValues` from it,
which removes the empty first render that starts the sequence. The same defect
was latent in the menu item, staff role and table assignment dialogs.

### Verified behaviour

The production build was served with `vite preview` and driven in headless
Chrome over CDP against the live API:

- All eleven screens render for their role with **zero console errors**:
  login, register, owner dashboard / tables / menu / staff / kitchen / reports /
  settings, waiter tables, take-order, table detail, kitchen board
- The boot gate refreshes a persisted token and lands the user on their role home
- The kitchen board draws one bordered card per order with its items, per-item
  notes, order note, elapsed timer and exactly one action button per column
- Age colouring moves green → amber → red off the server's `ageSeconds`
- **Realtime works end to end**: with the board open and untouched, an order
  placed over the API appeared as a new card within four seconds — socket push,
  not the 15 s poll
- Money renders as `₹820.00` from the string the server sent, never recomputed

Re-driven after the responsive and colour pass, at **360 × 740, 390 × 844,
768 × 1024 and 1440 × 900** with touch emulation on for the three small sizes:

- All nine owner screens plus both waiter screens and the kitchen board render
  at every size with **zero console errors**
- **No element paints past the right edge** at any size, measured by walking
  every rendered node rather than trusting `scrollWidth`
- The kitchen board carries a populated PENDING / PREPARING / COMPLETED card at
  each size; the age ramp moves border, timer and glow together
- The timezone field shows `Asia/Kolkata` and a save round-trips it unchanged
- **Every scroll container was driven, not eyeballed**: with 22 orders on the
  board, each viewport's `scrollHeight`/`clientHeight` is compared, then it is
  scrolled to the end and checked that it moved and that the child does not
  spill past its wrapper. Verified at 1440×900 and 1024×600 for the kitchen
  columns, 1440×420 for the flex-stretched take-order rail, and 390×844 for the
  staff table. Below `md` the kitchen columns deliberately do not scroll — they
  size to their contents and the page scrolls, rather than nesting three scroll
  areas inside a phone.

Note that a `captureBeyondViewport` screenshot is useless for checking any of
this: it re-renders at full content height, which inflates `100vh` and makes
every `max-h-[calc(100vh-…)]` pane look like it fits. Capture at true viewport
size when a layout depends on viewport units.

### Tests

`npm test` — 7 files, 47 tests:

| File | Covers |
|---|---|
| `lib/money.test.ts` | paise round-trips, no drift on 3 × ₹0.10, cart sums, missing values |
| `lib/board.test.ts` | per-column kitchen ordering, NULLS-LAST and tie-break behaviour, and that an undone complete keeps its `preparingAt` so it lands back on its exact former index |
| `lib/datetime.test.ts` | `formatClock` as mm:ss under an hour and `4h 39m` over it, `formatDuration` unit dropping, negative and fractional clamping |
| `lib/constants.test.ts` | `postLoginPath` — honours a deep link the role owns, falls back to role home otherwise, rejects prefix collisions and non-same-origin `next` |
| `store/cart.store.test.ts` | add / increment / `setQty(0)` removes / per-session isolation / integer totals / snapshot shape |
| `schemas/schemas.test.ts` | boundary values mirroring the DB CHECKs — capacity 0 and 51, tax 101, price `"12.345"`, quantity 0, and that a smuggled price is stripped |
| `api/client.test.ts` | **single-flight refresh** (two parallel 401s → exactly one `/auth/refresh`), failed refresh clears the store, typed error mapping |

---

## Table of contents

1. [Stack](#stack)
2. [Folder structure](#folder-structure)
3. [Bootstrap commands](#bootstrap-commands)
4. [React 19 conventions](#react-19-conventions)
5. [TypeScript & domain types](#typescript--domain-types)
6. [API layer](#api-layer)
7. [Auth & token lifecycle](#auth--token-lifecycle)
8. [Routes & guards](#routes--guards)
9. [State management](#state-management)
10. [TanStack Query conventions](#tanstack-query-conventions)
11. [Forms — RHF + Zod](#forms--rhf--zod)
12. [Design system — Tailwind + shadcn/ui](#design-system--tailwind--shadcnui)
13. [Screens & components](#screens--components)
14. [TanStack Table usage](#tanstack-table-usage)
15. [Recharts usage](#recharts-usage)
16. [Realtime](#realtime)
17. [Money, dates and formatting rules](#money-dates-and-formatting-rules)
18. [Error handling & UX rules](#error-handling--ux-rules)
19. [Testing](#testing)
20. [Env, scripts, tooling](#env-scripts-tooling)
21. [Build order](#build-order)

---

## Stack

| Piece | Choice |
|---|---|
| Language | TypeScript 5, `strict: true` |
| Framework | React 19 |
| Build tool | Vite 7 |
| Routing | React Router v7 (declarative mode, `createBrowserRouter`) |
| Styling | Tailwind CSS 4 (CSS-first config) |
| Components | shadcn/ui (Radix primitives + CVA + `tailwind-merge`) |
| Server state | TanStack Query v5 |
| Client state | Zustand 5 (+ `persist`) |
| Forms | react-hook-form 7 + Zod 4 (`@hookform/resolvers` v5) |
| Tables | TanStack Table v8 |
| Charts | Recharts 3 |
| HTTP | Axios (single instance + interceptors) |
| Realtime | `socket.io-client` v4 |
| Icons | `lucide-react` (ships with shadcn/ui) |
| Toasts | `sonner` (shadcn's toast of choice) |
| Dates | `date-fns` + `date-fns-tz` |
| Unit / component tests | Vitest 4 + React Testing Library 16 + `@testing-library/user-event` + MSW 2 |
| E2E tests | Playwright 1 |
| Linting | ESLint 9 (**flat config**) + `typescript-eslint` 8 |
| Formatting | Prettier 3 + `prettier-plugin-tailwindcss` |

> **Verify the exact latest patch/minor before installing.** These majors are current as
> of writing; run `npm view <pkg> version` (or just install unpinned and read the
> lockfile) rather than trusting the numbers here. The majors are what matter — the
> conventions in this file assume React 19 + Tailwind 4 specifically.

### Packages

```
react react-dom react-router
@tanstack/react-query @tanstack/react-query-devtools
@tanstack/react-table
zustand axios socket.io-client
react-hook-form zod @hookform/resolvers
recharts sonner lucide-react date-fns date-fns-tz
class-variance-authority clsx tailwind-merge tw-animate-css
@radix-ui/react-*            (pulled in per shadcn component, never hand-added)
--- dev ---
typescript vite @vitejs/plugin-react
tailwindcss @tailwindcss/vite
vitest @vitest/coverage-v8 jsdom
@testing-library/react @testing-library/jest-dom @testing-library/user-event
msw @playwright/test
eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh
prettier prettier-plugin-tailwindcss
```

Note `typescript-eslint` is **one** package now — the flat-config entry point. The old
`@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` pair belongs to `.eslintrc`.

Three renames that older documentation and examples still get wrong:
`react-router-dom` → **`react-router`** (v7), `postcss`+`autoprefixer` → **`@tailwindcss/vite`**
(v4 needs neither), `tailwindcss-animate` → **`tw-animate-css`** (the v4-compatible fork
shadcn now generates).

---

## Folder structure

```
frontend/
├── e2e/                              Playwright specs + fixtures
│   ├── fixtures/auth.ts              storageState per role (owner/waiter/kitchen)
│   ├── owner.spec.ts  waiter.spec.ts  kitchen.spec.ts
│   └── playwright.config.ts
├── public/
├── src/
│   ├── main.tsx                      QueryClientProvider, RouterProvider, Toaster
│   ├── App.tsx                       router definition
│   ├── api/
│   │   ├── client.ts                 axios instance, auth header, refresh-retry
│   │   ├── queryClient.ts            QueryClient defaults
│   │   ├── endpoints.ts              typed path builders — no string literals in hooks
│   │   ├── auth.api.ts  staff.api.ts  tables.api.ts  menu.api.ts
│   │   └── sessions.api.ts  orders.api.ts  kitchen.api.ts  reports.api.ts
│   ├── types/
│   │   ├── api.ts                    ApiResponse<T>, ApiError, ErrorCode union
│   │   ├── domain.ts                 Restaurant, User, Table, MenuItem, Order, …
│   │   └── enums.ts                  UserRole, TableStatus, SessionStatus, OrderStatus
│   ├── schemas/                      Zod schemas mirroring backend DTOs
│   │   ├── auth.schema.ts  staff.schema.ts  table.schema.ts
│   │   └── menu.schema.ts  order.schema.ts  session.schema.ts
│   ├── store/
│   │   ├── auth.store.ts             user, restaurant, role, tokens
│   │   ├── cart.store.ts             in-progress order, keyed by sessionId
│   │   └── ui.store.ts               sidebar collapse, sound on/off, theme
│   ├── hooks/
│   │   ├── queries/                  one file per resource — useMenu, useMyTables, …
│   │   ├── mutations/                usePlaceOrder, useTransitionOrder, …
│   │   ├── useAuth.ts  useRole.ts  useSocket.ts
│   │   └── useDebounce.ts  useElapsed.ts  useConfirm.ts
│   ├── components/
│   │   ├── ui/                       shadcn/ui generated primitives (DO NOT hand-edit)
│   │   ├── layout/                   AppShell, Sidebar, Topbar, PageHeader, RoleBadge
│   │   ├── common/                   ProtectedRoute, RoleGate, ErrorBoundary,
│   │   │                             EmptyState, LoadingState, ConfirmDialog,
│   │   │                             DataTable, Money, RelativeTime, StatusBadge,
│   │   │                             Scroller (edge-fading scroll container)
│   │   └── charts/                   ChartCard, RevenueLineChart, TopItemsBarChart, …
│   ├── features/
│   │   ├── auth/                     LoginPage, RegisterRestaurantPage
│   │   ├── owner/                    dashboard/ staff/ tables/ menu/ kitchen/ reports/ settings/
│   │   ├── waiter/                   MyTablesPage
│   │   ├── kitchen/                  KitchenBoardPage + board components
│   │   └── shared/                   TakeOrderScreen, TableDetail, BillView
│   ├── lib/
│   │   ├── money.ts                  parse/format Decimal-as-string, paise math
│   │   ├── datetime.ts               restaurant-timezone formatting
│   │   ├── cn.ts                     clsx + tailwind-merge
│   │   └── constants.ts              query keys, poll intervals, role paths
│   ├── test/
│   │   ├── setup.ts                  jest-dom, MSW server lifecycle
│   │   ├── msw/handlers.ts           default happy-path API mocks
│   │   └── utils.tsx                 renderWithProviders(ui, { role, queryClient })
│   └── index.css                     @import "tailwindcss" + @theme design tokens
├── scripts/
│   └── validate-palette.mjs          gates the dark chart ramp — `npm run palette`
├── components.json                   shadcn/ui config
├── vite.config.ts                    react + tailwindcss plugins, alias, Vitest block
├── tsconfig.json                     paths: "@/*" → "src/*"
├── eslint.config.js                  ESLint 9 FLAT config — not .eslintrc
├── .prettierrc.json                  + prettier-plugin-tailwindcss (points at index.css)
├── .env.example
└── package.json
```

---

## Bootstrap commands

```bash
npm create vite@latest frontend -- --template react-ts
npm i
npm i tailwindcss @tailwindcss/vite          # v4 — no init, no postcss, no autoprefixer
npx shadcn@latest init                       # writes components.json + index.css @theme
npx shadcn@latest add button input label select textarea card badge dialog \
    drawer sheet dropdown-menu table tabs form separator skeleton switch \
    tooltip alert-dialog scroll-area sonner popover calendar command
npm i -D vitest jsdom @testing-library/react @testing-library/jest-dom \
    @testing-library/user-event msw @vitest/coverage-v8
npm init playwright@latest
```

Tailwind v4 wiring — there is **no `tailwind.config.ts`**:

```ts
// vite.config.ts
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [react(), tailwindcss()] });
```

```css
/* src/index.css */
@import "tailwindcss";
@import "tw-animate-css";
```

`@/*` path alias must be set in **both** `tsconfig.json` and `vite.config.ts`
(`resolve.alias`) or shadcn's generated imports break. `shadcn init` reads the alias from
`components.json`, so set it up before adding components.

---

## React 19 conventions

What actually changes versus the React 18 patterns still common in existing code:

| Do this | Not this | Why |
|---|---|---|
| `function Input({ ref, ...props }: Props & { ref?: Ref<HTMLInputElement> })` | `forwardRef(...)` | `ref` is a normal prop in 19. `forwardRef` still works but is legacy — shadcn's current output already drops it |
| `use(PromiseOrContext)` | `useContext` | `use()` reads context and can be called conditionally |
| `<title>` / `<meta>` rendered inline in a component | a head-management library | React 19 hoists document metadata natively |
| `useDeferredValue(searchTerm)` | manual debounce state | Still keep the 300 ms debounce on the **network** call; `useDeferredValue` smooths the list re-render |
| `<Context>` as the provider | `<Context.Provider>` | `.Provider` is deprecated in 19 |

Deliberate non-uses — the new primitives are a poor fit here and adding them would make
the code worse, not more modern:

- **`useOptimistic` is not used for the kitchen board.** Optimistic state there must
  survive a component unmount, be shared across two columns, and roll back on a specific
  409. That is TanStack Query's `onMutate`/`onError` job, and it already owns the cache
  (see [TanStack Query conventions](#tanstack-query-conventions)). `useOptimistic` is for
  local, transient, form-adjacent state.
- **Actions / `useActionState` are not used for forms.** Every form here is RHF + Zod
  against a JSON API, with server field errors mapped back onto fields. Actions buy you
  progressive enhancement this SPA cannot use.

**React Compiler is optional and off by default.** If enabled (`babel-plugin-react-compiler`
in `vite.config.ts`), delete `useMemo`/`useCallback` rather than leaving both — half-applied
memoization is worse than either extreme. Decide once, at step 1 of the build order, and
keep `eslint-plugin-react-hooks` on the compiler-aware rules either way. Skip it if
anything in the toolchain complains; it changes nothing else in this plan.

---

## TypeScript & domain types

**Rule: no `any`, no untyped `axios.get`.** Every response has a declared type in
`src/types/`, and every type mirrors a payload documented in `database/CLAUDE.md`.

```ts
// types/enums.ts  — mirrors the Postgres ENUMs exactly
export const UserRole      = { OWNER: 'OWNER', WAITER: 'WAITER', KITCHEN: 'KITCHEN' } as const;
export const OrderStatus   = { PENDING: 'PENDING', PREPARING: 'PREPARING',
                               COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED' } as const;
export const TableStatus   = { VACANT: 'VACANT', OCCUPIED: 'OCCUPIED' } as const;
export const SessionStatus = { OPEN: 'OPEN', CLOSED: 'CLOSED' } as const;

export type UserRole      = (typeof UserRole)[keyof typeof UserRole];
export type OrderStatus   = (typeof OrderStatus)[keyof typeof OrderStatus];
// …
```

```ts
// types/api.ts
export type ApiResponse<T> = { data: T; requestId: string };

export type ApiErrorBody = {
  error: { code: ErrorCode; message: string; details?: unknown };
  requestId: string;
};

// mirrors backend/CLAUDE.md → "Domain error codes"
export type ErrorCode =
  | 'INVALID_CREDENTIALS' | 'TOKEN_EXPIRED'   | 'TOKEN_REUSED'
  | 'FORBIDDEN_ROLE'      | 'NOT_TENANT_MEMBER'
  | 'EMAIL_TAKEN'         | 'KITCHEN_EXISTS'  | 'TABLE_NOT_ASSIGNED'
  | 'SESSION_NOT_OPEN'    | 'ORDER_ALREADY_MOVED' | 'ITEM_UNAVAILABLE'
  | 'ORDERS_IN_PROGRESS'  | 'CATEGORY_NOT_EMPTY'
  | 'DUPLICATE' | 'INVALID_REFERENCE' | 'NOT_FOUND';
```

> **Contract to confirm with the backend before writing `client.ts`:** the backend's
> `TransformInterceptor` wraps successful responses. This plan assumes
> `{ data, requestId }`. If it wraps differently, change the unwrap in **one place**
> (`client.ts`) — nothing else in the app should know the envelope exists.

Money and dates cross the wire as **strings**, never numbers:

```ts
export type Money = string;      // "250.00" — Prisma.Decimal serialized by the backend
export type Iso   = string;      // "2026-08-16T14:03:11.123Z" — timestamptz

export type MenuItem = {
  id: string; categoryId: string; name: string; description: string | null;
  price: Money; isVeg: boolean | null; isAvailable: boolean; displayOrder: number;
};

export type KitchenOrder = {
  id: string; orderNumber: number; status: OrderStatus; note: string | null;
  placedAt: Iso; preparingAt: Iso | null; completedAt: Iso | null;
  tableNumber: number; placedBy: string; ageSeconds: number;
  items: { name: string; quantity: number; note: string | null }[];
};

export type KitchenBoard = Record<'PENDING' | 'PREPARING' | 'COMPLETED', KitchenOrder[]>;
```

`KitchenOrder` is exactly query 29 in `database/CLAUDE.md` — items pre-aggregated per
order, which is what lets one bordered card hold a whole order.

---

## API layer

### `client.ts`

- One axios instance: `baseURL = import.meta.env.VITE_API_URL`, `timeout: 15000`.
- **Request interceptor** — attach `Authorization: Bearer <accessToken>` from the auth store.
- **Response interceptor (success)** — unwrap the envelope, returning `response.data.data`.
- **Response interceptor (error)** — normalize any failure into a typed `ApiError`
  (`{ code, message, status, details }`) so screens never inspect `err.response?.data?.…`.
- **401 handling** — refresh once, then retry the original request. Refresh is
  **single-flight**: the first 401 starts the refresh, every other in-flight 401 waits on
  the same promise. If refresh fails → clear the store, disconnect the socket, redirect to
  `/login?reason=expired`. Never retry a request twice; never retry `/auth/refresh` itself.
- 403 with `TABLE_NOT_ASSIGNED` / `FORBIDDEN_ROLE` → toast + navigate to the role home.

### Resource modules

One file per resource, each exporting plain typed async functions — **no React in this
layer**, which is what makes them trivial to unit-test and to mock in MSW.

```ts
// api/orders.api.ts
export const placeOrder = (body: PlaceOrderInput) =>
  client.post<never, Order>('/orders', body);
```

### Endpoint map (from `backend/CLAUDE.md`)

| Module | Calls |
|---|---|
| `auth.api` | `POST /auth/register-restaurant` · `/login` · `/refresh` · `/logout` · `GET /auth/me` · `PATCH /auth/me/password` |
| `staff.api` | `GET /staff` · `GET /staff/waiters` · `POST /staff` · `PATCH /staff/:id` · `/:id/password` · `/:id/status` |
| `tables.api` | `GET /tables` · `/tables/my` · `/tables/:id` · `POST /tables` · `/tables/bulk` · `PATCH /tables/:id` · `DELETE /tables/:id` · `PUT /tables/:id/assignment` · `DELETE /tables/:id/assignment` · `GET /tables/:id/assignment/history` |
| `menu.api` | `GET /menu` · `/menu/categories` · `/menu/categories/:id/items` · `/menu/search?q=` · `POST/PATCH/DELETE` categories + items · `PATCH /menu/items/:id/availability` |
| `sessions.api` | `POST /sessions` · `GET /sessions/:id` · `/sessions/:id/bill` · `POST /sessions/:id/close` · `GET /sessions/table/:tableId/history` |
| `orders.api` | `POST /orders` · `GET /orders/:id` · `PATCH /orders/:id/status` · `POST /orders/:id/cancel` |
| `kitchen.api` | `GET /kitchen/board` · `/kitchen/counts` · `PATCH /kitchen/orders/:id/start` · `/complete` · `/reopen` |
| `reports.api` | `GET /reports/summary` · `/daily` · `/top-items` · `/waiters` · `/prep-time` · `/hourly` |

**`restaurantId` is never sent by the client.** The server reads it from the JWT. If a
request body or query string ever carries it, that is a bug — see the tenancy rule in
`database/CLAUDE.md` §2.

---

## Auth & token lifecycle

| Token | Lifetime | Where it lives |
|---|---|---|
| Access | 15 min | Zustand, **memory only** — excluded from `persist` via `partialize` |
| Refresh | 7 days | Zustand, persisted to `localStorage` |

Boot sequence in `main.tsx`, before the router renders:

```
1. read persisted refresh token
2. none            → render router (lands on /login)
3. present         → POST /auth/refresh
   ├─ success      → store new pair, GET /auth/me, connect socket, render
   └─ failure      → clear store, render (lands on /login)
```

Rendering an `AuthBootGate` that shows a full-page skeleton during step 3 avoids the
"login screen flashes then vanishes" flicker.

- `useAuth()` — `{ user, restaurant, role, isAuthenticated, login, logout }`.
- On logout: `POST /auth/logout` → `queryClient.clear()` → socket disconnect → clear store.
- After `PATCH /auth/me/password` the backend revokes every family → force a re-login.
- Two tabs share `localStorage`; subscribe to the `storage` event so logging out in one
  tab logs out the other.

> Hardening path: move the refresh token to an httpOnly cookie (the backend already has
> `cookie-parser`). Only `client.ts` and this boot sequence change — no screen touches
> tokens directly, which is the point of keeping them behind `useAuth()`.

---

## Routes & guards

`createBrowserRouter` with a `ProtectedRoute` layout route per role branch.

| Path | Role | Screen |
|---|---|---|
| `/login` | public | Login |
| `/register` | public | Register restaurant + owner |
| `/owner` | OWNER | Dashboard (today's stats) |
| `/owner/tables` | OWNER | Table grid, assign waiters |
| `/owner/tables/:tableId` | OWNER | Table detail — orders so far, bill, close |
| `/owner/tables/:tableId/order` | OWNER | Take Order (shared screen) |
| `/owner/menu` | OWNER | Categories + items manager |
| `/owner/staff` | OWNER | Waiters + kitchen handler |
| `/owner/kitchen` | OWNER | Kitchen board (same component as the KITCHEN role) |
| `/owner/reports` | OWNER | Charts |
| `/owner/settings` | OWNER | Restaurant profile, tax percent, timezone |
| `/waiter` | WAITER | My assigned tables |
| `/waiter/tables/:tableId` | WAITER | Table detail — orders so far, bill, close |
| `/waiter/tables/:tableId/order` | WAITER | Take Order (shared screen) |
| `/kitchen` | KITCHEN | Kitchen board |
| `/403` | any | Not allowed |
| `*` | — | 404 |

- Post-login redirect: `OWNER → /owner`, `WAITER → /waiter`, `KITCHEN → /kitchen`
  (`ROLE_HOME` in `lib/constants.ts`; also used by "logo → home" and 403 recovery).
- `ProtectedRoute` — unauthenticated → `/login`, preserving `?next=`.
- **`?next=` is filtered through `postLoginPath(next, role)`, never replayed
  raw.** The path was parked by whoever was bounced; the person who signs in
  next may be a different role on the same device, and following it blindly
  drops them on `/403`. It is also query-string text, so only a same-origin
  absolute path inside the role's own branch is honoured.
- `RoleGate` — wrong role → `/403`. **UI gating is convenience only; the server enforces
  it.** Never treat a hidden button as a permission.
- The Take Order and Table Detail screens are one implementation in `features/shared/`,
  parameterized by `useRole()` for the back-link base path.
- `ErrorBoundary` at the router root (`errorElement`) plus one per feature branch.
- Route-level `React.lazy` for `/owner/reports` (Recharts) — it is the heaviest chunk.

---

## State management

| Concern | Tool | Notes |
|---|---|---|
| Server data (menu, tables, sessions, board, reports) | TanStack Query | the only cache of server truth |
| Auth (user, restaurant, role, tokens) | Zustand + `persist` | access token excluded from persistence |
| Order cart being built | Zustand + `persist` | keyed by `sessionId`, survives refresh |
| Form state | react-hook-form + Zod | never mirrored into Zustand |
| UI (modals, drawers, active category) | local `useState` | never global |

**Never copy server data into Zustand.** A cart holds `menuItemId`, `quantity`, `note` and
a *display-only* snapshot of name/price for rendering; the authoritative price is resolved
server-side at order time (`database/CLAUDE.md` query 26).

### `cart.store.ts`

```ts
type CartLine = { menuItemId: string; name: string; unitPrice: Money;
                  quantity: number; note?: string };

type CartState = {
  carts: Record<string, CartLine[]>;             // sessionId → lines
  add(sessionId: string, item: MenuItem): void;  // qty 1, or +1 if present
  setQty(sessionId: string, menuItemId: string, qty: number): void;  // 0 removes
  setNote(sessionId: string, menuItemId: string, note: string): void;
  clear(sessionId: string): void;
  totalCount(sessionId: string): number;
  totalPaise(sessionId: string): number;         // integer math — see Money rules
};
```

Clear the cart on: successful send, session close, and logout.

---

## TanStack Query conventions

`queryClient.ts` defaults: `staleTime: 30_000`, `retry: 1` (never retry 4xx),
`refetchOnWindowFocus: true`, and a global `onError` that toasts anything not handled
locally.

### Query key factory — `lib/constants.ts`

```ts
export const qk = {
  me:        ['me'] as const,
  menu:      ['menu'] as const,
  menuSearch:(q: string) => ['menu', 'search', q] as const,
  categories:['menu', 'categories'] as const,
  items:     (categoryId: string) => ['menu', 'categories', categoryId, 'items'] as const,
  staff:     ['staff'] as const,
  waiters:   ['staff', 'waiters'] as const,
  tables:    ['tables'] as const,
  myTables:  ['tables', 'my'] as const,
  table:     (id: string) => ['tables', id] as const,
  session:   (id: string) => ['sessions', id] as const,
  bill:      (id: string) => ['sessions', id, 'bill'] as const,
  board:     ['kitchen', 'board'] as const,
  counts:    ['kitchen', 'counts'] as const,
  report:    (name: string, range: DateRange) => ['reports', name, range] as const,
};
```

No raw array literals in components — always `qk.*`, so an invalidation can never miss a
key because of a typo.

### Invalidation map

| Mutation | Invalidates |
|---|---|
| `placeOrder` | `qk.board`, `qk.counts`, `qk.session(id)`, `qk.myTables` / `qk.tables` |
| `startOrder` / `completeOrder` | `qk.board`, `qk.counts` (optimistic first) |
| `cancelOrder` | `qk.board`, `qk.session(id)` |
| `openSession` | `qk.tables`, `qk.myTables`, `qk.table(id)` |
| `closeSession` | `qk.tables`, `qk.myTables`, `qk.session(id)`, `qk.bill(id)` |
| menu writes | `qk.menu`, `qk.categories`, `qk.items(catId)` |
| staff writes | `qk.staff`, `qk.waiters` |
| assignment writes | `qk.tables`, `qk.myTables` |

### Optimistic updates — only two places

1. **Kitchen status transitions** — move the card between columns immediately.
2. **Cart quantity** — local Zustand, so it is instant by construction.

The kitchen pattern (`onMutate` → snapshot → patch → `onError` rollback → `onSettled`
invalidate) must roll back **and** toast when the server answers 409 `ORDER_ALREADY_MOVED`
— that means the owner and the kitchen handler both clicked, and the server's guarded
`WHERE status = …` update rejected the loser (`database/CLAUDE.md` query 30).

The move carries `{ id, from, to }`, not just `to`: PREPARING is reachable from **both**
sides — forwards from PENDING, and backwards from COMPLETED when a handler undoes a
mistaken complete — so the source column cannot be inferred. The optimistic patch stamps
the destination's sort timestamp and re-sorts through `lib/board.ts`, so the card lands
where the refetch will put it rather than jumping a moment later.

Board polling: `refetchInterval: 15_000` on `qk.board`, **disabled while the socket is
connected**. The socket is the optimization; polling is the guarantee.

---

## Forms — RHF + Zod

One Zod schema per backend DTO, in `src/schemas/`, wired via `zodResolver`, rendered with
the shadcn `Form` components (`FormField` / `FormItem` / `FormMessage`).

| Schema | Mirrors DTO | Key rules |
|---|---|---|
| `loginSchema` | `LoginDto` | email, password ≥ 8 |
| `registerRestaurantSchema` | `RegisterRestaurantDto` | restaurant name, slug (lowercase, `a-z0-9-`), owner name/email/password + confirm |
| `createStaffSchema` | `CreateStaffDto` | name, email, password ≥ 8, `role ∈ {WAITER, KITCHEN}` |
| `resetPasswordSchema` | `ResetStaffPasswordDto` | password + confirm, `refine` equality |
| `createTableSchema` | `CreateTableDto` | `tableNumber ≥ 1`, `capacity 1–50`, optional label ≤ 40 |
| `bulkTablesSchema` | `BulkCreateTablesDto` | `from ≤ to`, `to − from ≤ 100` |
| `categorySchema` | `CreateCategoryDto` | name 1–120 trimmed, `displayOrder ≥ 0` |
| `menuItemSchema` | `CreateMenuItemDto` | name, `price` as a **string** matching `/^\d+(\.\d{1,2})?$/`, `isVeg` tri-state |
| `openSessionSchema` | `OpenSessionDto` | `guestCount 1–50` optional, customer name/phone optional |
| `placeOrderSchema` | `PlaceOrderDto` | `{ sessionId, items: [{ menuItemId, quantity ≥ 1, note? }], note? }` — **no price field** |
| `settingsSchema` | restaurant `PATCH` | `taxPercent` 0–100 string, timezone from an IANA list |

Rules:
- **Zod 4 syntax**, which differs from Zod 3 in two places that surface on the very
  first schema: string formats are top-level (`z.email()`, `z.uuid()` — not
  `z.string().email()`, which is deprecated), and the error customization API is a single
  `error` param instead of `message` / `invalid_type_error` / `required_error`. Requires
  `@hookform/resolvers` **v5+**; v4 does not understand Zod 4's internals.
- Every constraint here must match a `CHECK` in `database/CLAUDE.md` — capacity 1–50, tax
  0–100, quantity > 0, price ≥ 0. Client validation is UX; the database is the guarantee.
- Price inputs are **text**, validated by regex, sent as a string. Never `type="number"`
  for money — the float round-trip is exactly what `numeric(10,2)` exists to prevent.
- Server field errors (409 `EMAIL_TAKEN`, `KITCHEN_EXISTS`) map onto the field via
  `setError('email', …)`, not a bare toast.
- `formState.isSubmitting` disables the submit button; every destructive submit goes
  through `ConfirmDialog`.

---

## Design system — Tailwind + shadcn/ui

- shadcn components are **generated** into `components/ui/` and treated as vendored code:
  regenerate or extend via wrappers, don't rewrite them by hand.
- **Tailwind v4 is configured in CSS, not JS.** All design tokens live in an `@theme`
  block in `index.css`; there is no `tailwind.config.ts` to edit. A token declared as
  `--color-status-pending` automatically generates `bg-status-pending`,
  `text-status-pending`, `border-status-pending` — that is the whole mechanism.
- Never hardcode a hex in a component; every color resolves to a token.

```css
/* src/index.css — alongside the shadcn-generated --primary, --destructive, …
   These are the dark values; :root carries the light ramp separately. */
.dark {
  --status-pending:   oklch(0.81 0.17 75);    /* amber  */
  --status-preparing: oklch(0.71 0.18 252);   /* blue   */
  --status-completed: oklch(0.75 0.18 155);   /* green  */
  --status-vacant:    oklch(0.68 0.035 250);  /* slate  */
  --status-occupied:  oklch(0.72 0.19 300);   /* violet */
}
```

Status colors are used everywhere so the kitchen, the tables and the reports agree:

| Meaning | Token | Used by |
|---|---|---|
| `PENDING` | `status-pending` (amber) | kitchen column, order chips |
| `PREPARING` | `status-preparing` (blue) | kitchen column, table detail |
| `COMPLETED` | `status-completed` (green) | kitchen column, bill lines |
| `CANCELLED` | `muted-foreground` + strikethrough | table detail |
| `VACANT` | `status-vacant` (slate) | table cards |
| `OCCUPIED` | `status-occupied` (violet) | table cards |

- `StatusBadge` is the single component that maps an enum value to a token. No screen
  writes its own `switch` over `OrderStatus`.
- Breakpoints: **tablet-first** for waiter and kitchen (`md` is the design target,
  touch targets ≥ 44px), desktop-first for owner (`lg`+ with a persistent sidebar).
  **Every screen must also hold at 360px** — the narrowest phone in service. Two
  rules fall out of that and are not optional:
  - Text that carries meaning **wraps; it never truncates**. `truncate` is for a
    line that repeats information available elsewhere (a breadcrumb, a subtitle);
    a dish name, a page title or a money figure gets `break-words`/`text-balance`.
  - A pane that can overflow wears a visible affordance. Use `Scroller`
    (`components/common/`), which measures its own edges and fades whichever one
    still has content behind it. CSS alone cannot distinguish "scrolled to the
    end" from "fits", and a hard edge reads as *trimmed*.
  - **The height cap and the `overflow` must end up on the same element.** This
    is what `Scroller` exists to get right, and it is easy to break: a wrapper
    holding only `max-height` has no *definite* height, so `height: 100%` on the
    scrolling child inside it resolves to `auto`, the child grows to the full
    content height, and nothing scrolls — the content is simply clipped by
    whatever ancestor has `overflow-hidden`. The viewport therefore carries
    `h-full max-h-[inherit]`: the inherited cap handles wrappers that declare
    one, `h-full` handles wrappers stretched by a flex parent, and whichever
    does not apply is inert.
- **Hover is not an interaction on a tablet.** Anything gated behind
  `group-hover` must be visible below `lg`, or it does not exist for a waiter.
- Dark mode: v4 has no `darkMode: 'class'` config key — it is a custom variant in CSS,
  `@custom-variant dark (&:is(.dark *));` (shadcn's `init` writes this for you). Toggle the
  `.dark` class on `<html>` from `ui.store` — kitchens are often dim.
- `sonner`'s `<Toaster richColors position="top-right" />` mounts once in `main.tsx`.

---

## Screens & components

### Layout & shared
`AppShell` · `Sidebar` (role-aware links) · `Topbar` (restaurant name, user, role badge,
connection dot, logout) · `PageHeader` · `ProtectedRoute` · `RoleGate` · `ErrorBoundary` ·
`EmptyState` · `LoadingState` (skeletons) · `ConfirmDialog` · `DataTable` · `Money` ·
`RelativeTime` · `StatusBadge` · `ConnectionIndicator` · `Scroller`

### Auth
`LoginForm` · `RegisterRestaurantForm` — both centered card layouts, `?reason=expired`
renders an inline "Session expired, please log in again" alert.

### Owner — Staff (`/owner/staff`)
`StaffTable` (TanStack Table) · `AddStaffDialog` (name, email, password, role) ·
`ResetPasswordDialog` · `ToggleActiveSwitch` · owner row is not deactivatable ·
the KITCHEN option is disabled with a hint once an active kitchen handler exists
(the server still answers 409 `KITCHEN_EXISTS` — handle both).

### Owner — Tables (`/owner/tables`)
`TableGrid` + `TableCard` (number, capacity, `VACANT`/`OCCUPIED` badge, waiter name,
running total, order count) · `AddTableDialog` · `BulkAddTablesDialog` ·
`AssignWaiterDialog` · `AssignmentHistorySheet` · filters: status (All/Vacant/Occupied)
and waiter · card actions: **Take Order** (vacant) / **View table** (occupied).
Backed by query 18 in `database/CLAUDE.md` — one request drives the whole screen.

### Owner — Menu (`/owner/menu`)
Two-pane: `CategoryList` (with `displayOrder` up/down controls) and `ItemTable` for the
selected category · `AddCategoryDialog` · `AddItemDialog` / `EditItemDialog` ·
`AvailabilityToggle` (optimistic) · `DeleteConfirm` — deleting a category with items
returns 409 `CATEGORY_NOT_EMPTY`, shown as "Move or delete its items first."
**No image fields anywhere — by design.**

### Owner — Settings (`/owner/settings`)
Restaurant name, phone, address, `taxPercent`, timezone. Changing tax changes future bill
math only; already-closed bills are historical.

### Waiter — My tables (`/waiter`)
`MyTablesGrid` + `TableCard`: `VACANT` → **Take Order**, `OCCUPIED` → **View / Add order**
with elapsed time and running total. Backed by query 19. Empty state: "No tables assigned
yet — ask the owner to assign you some."

### Take Order screen — **the core UI** (`features/shared/TakeOrderScreen`)

```
┌───────────────────────────────────────────────────────────────┐
│  ← Table 5          Session open 24 min      [ Preview (4) ]   │
├──────────────┬────────────────────────────────────────────────┤
│              │  🔍 Search items…                              │
│  CATEGORIES  │────────────────────────────────────────────────│
│    30%       │  ITEMS  70%                                    │
│              │  ┌──────────────┐ ┌──────────────┐             │
│  Starters    │  │Chicken Biryani│ │ Veg Biryani │             │
│ ▸Biryani     │  │  ₹250         │ │  ₹180       │             │
│  Main Course │  │  [ − 2 + ]    │ │  [   Add  ] │             │
│  Drinks      │  └──────────────┘ └──────────────┘             │
│  Desserts    │                                                │
└──────────────┴────────────────────────────────────────────────┘
```

- Entering the screen calls `POST /sessions` **first** — idempotent, so a double-tap
  returns the same session (`database/CLAUDE.md` query 23). The returned `sessionId` keys
  the cart. Guard the button with `isPending` as well.
- `CategoryColumn` — `w-[30%]`, vertical list, active highlight, item counts.
- `ItemsPanel` — `w-[70%]`, responsive card grid (`grid-cols-2 lg:grid-cols-3`).
- `SearchInput` — sticky at the top of the items column, debounced 300 ms, hits
  `GET /menu/search?q=` across **all** categories; clearing it restores the selected
  category. Show "in <category>" on each search result.
- `MenuItemCard` — name, price, veg dot, `QuantityStepper` (− / qty / +). When
  `isAvailable === false`: greyed, `+` disabled, "Unavailable" badge.
- `PreviewButton` — floating/sticky, shows line count and cart total, disabled when empty.
- `OrderPreviewSheet` — selected lines, editable quantities, remove, optional per-item
  note, order-level note, subtotal, **Back to selection** and **Send Order to Kitchen**.
- On success: clear that session's cart, `toast.success('Order #103 sent to kitchen')`,
  navigate back to the table detail.
- Mobile: categories collapse into a horizontal scroll strip above the items.
- The payload contains **only** `{ menuItemId, quantity, note? }`. Sending a price is a bug.

### Table detail (`features/shared/TableDetail`)
Order timeline (one block per order: `#number`, status badge, items, placed-by, time),
running total, **Add another order**, **View bill**, **Close table**. Closing is blocked
while any order is `PENDING`/`PREPARING` — the server answers 409 `ORDERS_IN_PROGRESS`;
pre-disable the button and explain why. Cancel is offered only on `PENDING` orders.

### Kitchen board (`/kitchen` and `/owner/kitchen` — one component)

```
┌─── PENDING (3) ────┬─── PREPARING (1) ──┬─── COMPLETED (5) ───┐
│ ╔════════════════╗ │ ╔════════════════╗ │ ╔════════════════╗  │
│ ║ #103  Table 5  ║ │ ║ #101  Table 2  ║ │ ║ #98   Table 7  ║  │
│ ║ 2× Chicken Bir.║ │ ║ 1× Dal Tadka   ║ │ ║ 3× Coke        ║  │
│ ║ 2× Coke        ║ │ ║ 4× Butter Naan ║ │ ╚════════════════╝  │
│ ║ 4× Butter Naan ║ │ ╚════════════════╝ │                     │
│ ║ ⏱ 4 min        ║ │  [ Mark Complete ] │                     │
│ ║ [ Start ]      ║ │                    │                     │
│ ╚════════════════╝ │                    │                     │
└────────────────────┴────────────────────┴─────────────────────┘
```

- `KitchenColumn` × 3 with count badges; each column scrolls independently.
- **Each column sorts on its own timestamp**, matching query 29 — `placedAt` ASC in
  PENDING so the longest wait is on top, `preparingAt` ASC in PREPARING so the queue reads
  in cooking order, `completedAt` DESC in COMPLETED so the last plate off the pass is on
  top. `lib/board.ts` restates that ordering for the *optimistic* update only, so a card
  does not jump when the refetch lands; the server remains the source of truth.
- `KitchenOrderCard` — **one visible border wraps the entire order** so every item in it
  reads as one unit that moves together. Shows order number, table number, waiter name,
  all items with quantities, per-item notes, order note, elapsed timer.
- Exactly **one** action button per card: `PENDING → Start`, `PREPARING → Mark complete`,
  `COMPLETED → Move back`. Items are never moved individually — there is no per-item
  status in the schema.
- **Move back is an undo, not a workflow step**, so it is `outline` rather than the
  primary fill: it must not compete with Start and Mark complete during service. It sends
  the order to PREPARING with its original `preparingAt` intact, which is what returns the
  card to the slot it left instead of the back of the queue. Once the table has been
  billed the server answers 409 `SESSION_NOT_OPEN` and the card stays put.
- Age colouring driven by `ageSeconds`: green < 5 min, amber 5–10, red > 10, ticking
  client-side via `useElapsed`.
- Optimistic move; rollback + toast on 409 `ORDER_ALREADY_MOVED`.
- New order arrival: slide-in animation + optional sound (`ui.store.soundEnabled`).
- The owner's copy is the same component with no extra permissions in the UI — the server
  already allows OWNER + KITCHEN on these endpoints.

### Bill (`features/shared/BillView`)
Restaurant header (name, address, phone), table number, guest count, served-by, merged
item lines (query 34), subtotal, tax at the restaurant's `taxPercent`, grand total ·
`PrintBillButton` → `window.print()` with a print-only stylesheet (`@media print`: hide
shell/sidebar/buttons, black on white, full width) · `CloseTableConfirm`.
Totals are **rendered from the server's bill payload**, never recomputed in the browser.

### Owner — Dashboard & Reports
`StatCards` (today's revenue, orders, open tables, avg bill) · `RevenueLineChart` ·
`TopItemsBarChart` · `WaiterPerformanceTable` · `PrepTimeCard` · `HourlyLoadChart` ·
`DateRangePicker` (presets: Today / 7d / 30d / custom) — the range is part of the query key.

---

## TanStack Table usage

Used wherever data is tabular, sortable or filterable. One shared `DataTable<TData>` in
`components/common/` wraps `useReactTable` + the shadcn `Table` primitives; feature files
only declare `ColumnDef<T>[]`.

| Table | Columns | Features |
|---|---|---|
| `StaffTable` | name, email, role, status, last login, actions | sort, role filter, global search |
| `ItemTable` | name, price, veg, availability, actions | sort by name/price, availability filter |
| `WaiterPerformanceTable` | waiter, orders, tables served, revenue | sort by revenue desc |
| `SessionHistoryTable` | opened, closed, duration, served by, total | sort by opened desc, pagination |
| `AssignmentHistoryTable` | waiter, assigned at, unassigned at | sort desc |

Conventions: `getCoreRowModel` always; add `getSortedRowModel` / `getFilteredRowModel`
only where the table above says so. Client-side paging is fine for staff and menu;
order/session history uses the backend's keyset pagination (`database/CLAUDE.md` query 45)
with a "Load more" button, not page numbers.

---

## Recharts usage

Only on `/owner` and `/owner/reports`, lazy-loaded. Every chart sits in a `ChartCard`
(title, range subtitle, loading skeleton, `EmptyState` when there is no data).

| Chart | Component | Source |
|---|---|---|
| Revenue per day (30d) | `LineChart` | `GET /reports/daily` |
| Top 10 items | horizontal `BarChart` | `GET /reports/top-items` |
| Orders by hour | `BarChart` | `GET /reports/hourly` |
| Prep time avg vs worst | stat card + `AreaChart` | `GET /reports/prep-time` |

Rules: wrap in `ResponsiveContainer`; colors come from the CSS variables, not literals;
money values are converted from `Money` strings to numbers **once**, at the chart boundary
only (charts cannot plot strings) — never for anything that is displayed or summed;
axis and tooltip labels use the money/date formatters so charts and tables agree.

---

## Realtime

`useSocket()` — connects to `VITE_SOCKET_URL` at namespace `/realtime` with
`auth: { token: accessToken }`, reconnects with backoff, and **reconnects with the new
token after every refresh**. Rooms are joined server-side from the token; the client never
asks to join one.

| Event | Action |
|---|---|
| `order:new` | Invalidate `qk.board` + `qk.counts`; toast + sound on kitchen/owner screens |
| `order:status` | Patch the board cache in place; invalidate the affected `qk.session(id)` |
| `order:cancelled` | Remove the card from the board cache |
| `table:opened` / `table:closed` | Invalidate `qk.tables`, `qk.myTables`, `qk.table(id)` |
| `table:assigned` | Invalidate `qk.myTables` (+ toast for the affected waiter) |
| `menu:updated` | Invalidate `qk.menu`, `qk.categories` |

Rules:
- Socket events **invalidate or patch the Query cache** — they never write to Zustand and
  never become a second source of truth.
- `ConnectionIndicator` in the Topbar: green connected / amber reconnecting / grey polling.
- While disconnected, the board's 15 s `refetchInterval` takes over automatically.
- The app must be fully usable with the socket blocked entirely — verify this in an e2e
  test that aborts the WebSocket route.

---

## Money, dates and formatting rules

**Money never becomes a float.** `lib/money.ts`:

```ts
toPaise(m: Money): number          // "250.00" → 25000   (integer)
fromPaise(p: number): Money        // 25000 → "250.00"
sumPaise(lines): number            // cart subtotal — integer addition only
formatMoney(m: Money, currency = 'INR'): string   // Intl.NumberFormat('en-IN')
```

- Cart arithmetic runs in paise; the result is only formatted at render time.
- The bill's subtotal/tax/total come from the server (query 35) and are **displayed**,
  never recomputed — the client would drift from the database's `ROUND`.
- `<Money value={line.amount} />` is the only way money reaches the DOM.

**Dates**: the server sends UTC ISO strings; `lib/datetime.ts` formats them in
`restaurant.timezone` (`date-fns-tz`), because "today's revenue" means today in Kolkata,
not in the browser's locale. Elapsed timers use `ageSeconds` from the server as the
baseline and tick locally, so a wrong client clock cannot make an order look fresh.

---

## Error handling & UX rules

| Server response | UI |
|---|---|
| 401 (expired) | silent refresh + retry; on failure → `/login?reason=expired` |
| 403 `TABLE_NOT_ASSIGNED` | toast "This table is not assigned to you" → back to `/waiter` |
| 409 `ORDER_ALREADY_MOVED` | rollback the optimistic move + "Someone already moved this order" |
| 409 `SESSION_NOT_OPEN` on **Move back** | rollback + "That table has already been closed" — the bill is final |
| 409 `SESSION_NOT_OPEN` | "This table was closed" → invalidate + navigate to the table |
| 409 `ORDERS_IN_PROGRESS` | keep **Close table** disabled with a tooltip listing the open orders |
| 409 `EMAIL_TAKEN` / `KITCHEN_EXISTS` | inline field error on the form |
| 400 `ITEM_UNAVAILABLE` | mark the offending lines in the preview, don't clear the cart |
| 5xx / network | `ErrorBoundary` or a retry card — never a blank screen |

General rules:
- Disable **Send Order to Kitchen** when the cart is empty or a request is in flight.
- Confirm before: closing a table, deleting a category/item, deactivating staff,
  reassigning a table that is currently occupied.
- Skeletons for grids and tables, spinners inside buttons, `EmptyState` everywhere.
- Accessibility: every icon-only button has an `aria-label`; dialogs trap focus (Radix
  handles this); the kitchen board is keyboard-navigable; status is never conveyed by
  color alone — always color **plus** text.

---

## Testing

### Vitest + RTL (unit / component)
`vitest.config` inside `vite.config.ts`, `environment: 'jsdom'`, `setupFiles:
['src/test/setup.ts']`. MSW intercepts at the network layer, so components under test use
the real hooks and the real axios client. `renderWithProviders` wraps in
`QueryClientProvider` (fresh client, `retry: false`), `MemoryRouter` and a seeded auth
store.

Must-cover:
- `money.ts` — `toPaise`/`fromPaise` round-trips, no float drift on 3 × ₹0.10
- `client.ts` — single-flight refresh: two parallel 401s trigger exactly **one**
  `/auth/refresh`; a failing refresh clears the store
- `cart.store` — add / increment / `setQty(0)` removes / `clear` / per-session isolation
- `TakeOrderScreen` — search debounce, category switch, stepper, disabled preview when
  empty, unavailable item cannot be added, payload contains **no price field**
- `KitchenOrderCard` — one action per status; 409 rolls the card back to its column
- `RoleGate` / `ProtectedRoute` — redirects per role
- Zod schemas — boundary values that mirror the DB CHECKs (capacity 0 and 51, tax 101,
  quantity 0, price `"12.345"`)
- `BillView` — renders server totals verbatim; does not recompute

### Playwright (e2e)
Runs against the real backend + a freshly seeded database (`npx prisma db seed`), using
the seed users from `database/CLAUDE.md` (`owner@spice.com`, `amit@spice.com`,
`kitchen@spice.com`, password `password123`). Per-role `storageState` fixtures skip the
login form in every spec except the auth one.

Must-cover flows:
1. **Full happy path** — waiter logs in → opens Table 5 → adds 3 items → preview → sends →
   kitchen (second browser context) sees the order appear in PENDING → Start → Complete →
   waiter closes the table → bill totals are correct → print dialog opens.
2. **Owner parity** — owner takes an order from `/owner/tables/:id/order` and moves it on
   `/owner/kitchen`.
3. **Multiple orders, one table** — three separate sends land as three bordered cards, and
   the bill merges identical lines.
4. **Race** — owner and kitchen both click Start; one succeeds, the other shows the 409
   message and the card does not duplicate.
5. **Assignment** — owner assigns Table 6 to Amit; Amit's `/waiter` shows it without a
   manual reload (socket) and still does with WebSockets blocked (polling).
6. **Access control** — a waiter navigating to `/owner/staff` lands on `/403`; a waiter
   opening another waiter's table gets the 403 message.
7. **Session expiry** — expire the access token mid-session; the next action refreshes
   transparently and no data is lost.

Coverage targets: 80% on `lib/`, `store/`, `schemas/` and `api/client.ts`; component tests
prioritize the Take Order and Kitchen screens over breadth.

---

## Env, scripts, tooling

`.env.example`:

```
VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
```

Access via a small `env.ts` that parses `import.meta.env` with Zod and throws at boot on a
missing var — the same fail-fast rule the backend applies to its config.

Scripts: `dev` · `build` (`tsc -b && vite build`) · `preview` · `lint` · `format` ·
`typecheck` · `test` · `test:watch` · `test:cov` · `e2e` · `e2e:ui`

### Lint & format

**ESLint 9 uses flat config.** The config is `eslint.config.js` exporting an array — 
`.eslintrc.*`, `extends`, and `env` are the old system and are simply not read. Compose
with `typescript-eslint`'s helper, which is what makes the array readable:

```js
// eslint.config.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'src/components/ui'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  { languageOptions: { parserOptions: { projectService: true } } },
  { plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: { ...reactHooks.configs.recommended.rules } },
);
```

Two project-specific choices:
- **`src/components/ui` is ignored.** It is generated shadcn code; linting it produces
  churn you would only "fix" by editing vendored files, which this plan forbids.
- `recommendedTypeChecked` (not plain `recommended`) — the whole point of the strict-TS
  contract in this app is catching `any` leaking out of API responses.

**Prettier 3** with `prettier-plugin-tailwindcss` for class sorting. Under Tailwind v4 the
plugin has no JS config to read, so point it at the CSS entry instead:

```json
{ "plugins": ["prettier-plugin-tailwindcss"], "tailwindStylesheet": "./src/index.css" }
```

Omit that key and class sorting silently does nothing for custom tokens like
`bg-status-pending`.

Vite dev server proxies `/api` and `/socket.io` to `http://localhost:3000` so development
is same-origin and CORS never masks a real bug.

CI order: `typecheck → lint → test → build → e2e`.

---

## Build order

1. Vite + TS + Tailwind v4 + shadcn init, `@/*` alias, `cn()`, `@theme` tokens, dark
   variant, React Compiler decision (on or off — not half), `AppShell`
2. `types/` + `api/client.ts` (envelope unwrap, typed errors, single-flight refresh) +
   `queryClient.ts` + MSW handlers
3. Auth: `auth.store`, boot refresh gate, `LoginPage`, `ProtectedRoute`, `RoleGate`, router
4. Owner shell → Staff (first full CRUD: RHF + Zod + TanStack Table + dialogs)
5. Menu (categories + items, availability toggle, search) — the data the order screen needs
6. Tables + assignments (owner grid, waiter grid)
7. Sessions + Table detail (open, timeline, bill, close)
8. **Take Order screen** — cart store, 30/70 layout, search, stepper, preview, send
9. **Kitchen board** — three columns, bordered cards, optimistic guarded transitions
10. Realtime (`useSocket`, invalidation map, connection indicator, polling fallback)
11. Reports (lazy Recharts, date range, waiter table)
12. Print bill CSS, dark mode, accessibility pass, Vitest suite, Playwright flows
```
