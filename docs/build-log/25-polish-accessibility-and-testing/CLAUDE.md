# Step 25 — Polish, accessibility & testing

**Depends on:** all of steps 14–24 — this is the pass across the whole
frontend once every screen existed, the same role step 13 played for the
backend.

## What shipped

- Print-bill CSS (`@media print`: hide the shell/sidebar/buttons, black on
  white, full width), the dark-mode toggle wired into the topbar, and an
  accessibility pass: every icon-only button has an `aria-label`, dialogs
  trap focus (via Radix), the kitchen board is keyboard-navigable, and
  status is never conveyed by color alone.
- **The Vitest suite** — 7 files, 47 tests: `lib/money.test.ts` (paise
  round-trips, no drift on 3 × ₹0.10), `lib/board.test.ts` (per-column
  kitchen ordering, and that an undone complete keeps its `preparingAt`),
  `lib/datetime.test.ts` (clock formatting past an hour), `lib/constants.test.ts`
  (`postLoginPath` — see the `/403` bug below), `store/cart.store.test.ts`,
  `schemas/schemas.test.ts` (boundary values mirroring the database's
  `CHECK` constraints), `api/client.test.ts` (single-flight refresh).
- Playwright e2e was **not implemented** — left as the documented remaining
  gap, the same honest call the backend made about Testcontainers e2e in
  step 13. In its place, the flows were verified by actually driving the
  production build (`vite preview`) in headless Chrome over CDP against the
  live API.
- **A full responsive pass at 360, 390, 768 and 1440px**, with touch
  emulation on the three smaller sizes — run as a second pass after the
  screens were already believed finished, specifically because a first
  glance at any one screen in isolation does not catch a layout that only
  breaks at the narrowest phone width.

## Four real bugs found by running the finished app, and fixed

1. **The boot gate refreshed outside the single-flight latch.** `AuthBootGate`
   called a bare `axios.post('/auth/refresh')` instead of the shared
   `refreshSession()` helper, so React StrictMode's double-invoked effect
   rotated the same refresh token twice — one rotation won, the other came
   back `401 TOKEN_REUSED` (the backend correctly reporting what looks like
   a stolen-token replay), revoking the whole family. Visible symptom:
   deep-linking to `/waiter/tables/:id` bounced to `/waiter`. Fixed by
   routing the boot gate through the exact same single-flight promise the
   401 retry path uses.
2. **`connectSocket` tore down a socket mid-handshake.** Both the app shell
   and the kitchen board call `useSocket()`; the second caller found
   `socket.connected === false` (still opening), called
   `disconnectSocket()` — which runs `removeAllListeners()` — and opened a
   fresh one, orphaning the first caller's handlers. Symptom: the topbar
   showed "Live" while the board sat on "Refreshing every 15s" and kept
   polling regardless. Fixed by keying socket reuse on the token alone.
3. **`Card` is `flex flex-col`**, so adding `flex flex-wrap` to a card that
   needed to lay out as a row silently did nothing — the table-detail
   running-total card needed an explicit `flex-row` override.
4. **A waiter signing in on a shared tablet landed on `/403`.**
   `ProtectedRoute` parks a blocked path in `?next=`, but the owner whose
   session dropped on `/owner/kitchen` and the waiter who then signs in on
   the same device are not the same person — the login screen was replaying
   `next` straight into `navigate()` regardless of who had just
   authenticated. Fixed with `postLoginPath(next, role)` as the single place
   that decides: `next` is honored only when the signing-in role can
   actually reach it, and only when it's a same-origin absolute path (a
   `//host/x` or `https://…` string smuggled through the query string is
   discarded, not handed to the router). Covered by `lib/constants.test.ts`,
   including the prefix-collision case (`/waiterly` must not pass as inside
   `/waiter`).

## A fifth bug, found the same way, in a different subsystem

**Radix `Select` decides controlled-vs-uncontrolled from its first `value`.**
`SettingsPage`'s form seeded `values` from data that hadn't loaded yet on
first paint, so the timezone `Select` mounted uncontrolled, immediately
emitted an empty string, and that empty string landed back in the form after
the eventual reset — a restaurant with `Asia/Kolkata` already set displayed
"Choose a timezone," and saving would have blanked it. Fixed by making every
Select a registered field through `Controller` with an explicit fallback
value, and by not rendering the settings form until its data has actually
arrived. The same latent defect existed in the menu item, staff role, and
table assignment dialogs and was fixed in all of them.

## The responsive and color pass — what changed

Colour became load-bearing (stat tiles, kitchen columns, table cards, filter
pills and the login role buttons all take their hue from the same status
token their badge uses), and a dozen concrete layout issues were found and
fixed — non-wrapping action rows getting sliced off card edges, a staff
table silently dropping controls on a phone with no scroll affordance,
kitchen columns that stopped scrolling entirely after an earlier refactor
moved a height cap and its `overflow` onto different elements, and more —
each traced to a specific CSS cause and fixed rather than patched over.
Overflow was checked by walking every rendered element's right edge against
the viewport, not by trusting `scrollWidth`, which cannot see past an
`overflow-x: clip` backstop that was itself added during this pass.

## Verified

The production build was driven end to end at 360×740, 390×844, 768×1024
and 1440×900 with touch emulation on the three smaller sizes: all eleven
screens render for their role with zero console errors; no element paints
past the right edge at any size (measured, not eyeballed); the kitchen board
carries populated cards in all three columns at every size with its age
ramp moving border, timer and glow together; the timezone field shows
`Asia/Kolkata` and a save round-trips it unchanged; every scroll container
was actually driven — scrolled to the end and checked that it moved and
that its content didn't spill past its wrapper — rather than assumed correct
from a static screenshot.

## Source of truth

[`frontend/CLAUDE.md`](../../../frontend/CLAUDE.md) → *What was built*
(all bug narratives in full), *The responsive and colour pass*, *Verified
behaviour*, *Testing*, and *Build order* item 12.
