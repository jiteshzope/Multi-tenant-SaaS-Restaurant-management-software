# Step 23 — Frontend realtime integration

**Depends on:** [22 — Kitchen board UI](../22-kitchen-board-ui/CLAUDE.md)
(the board is the primary consumer of live updates) and the backend's
realtime gateway ([step 11](../11-realtime-gateway/CLAUDE.md)).

## What shipped

- `useSocket()` — connects to `VITE_SOCKET_URL` at namespace `/realtime`
  with `auth: { token: accessToken }`, reconnects with backoff, and
  **reconnects with the new token after every refresh** rather than holding
  a stale one. Room membership is entirely server-decided from the token;
  the client never requests a room.
- The event-to-cache map: `order:new` invalidates `qk.board` + `qk.counts`
  and toasts/sounds on kitchen and owner screens; `order:status` patches the
  board cache in place and invalidates the affected session; `order:cancelled`
  removes the card; `table:opened`/`table:closed` invalidate `qk.tables`/
  `qk.myTables`/`qk.table(id)`; `table:assigned` invalidates `qk.myTables`
  and toasts the affected waiter; `menu:updated` invalidates `qk.menu`.
- **Socket events only ever invalidate or patch the TanStack Query cache —
  never write to Zustand.** There is exactly one source of server truth in
  this app, and a socket event is a signal to refresh it, not a second copy
  of it.
- `ConnectionIndicator` in the Topbar — green connected, amber reconnecting,
  grey polling.
- The kitchen board's 15-second `refetchInterval` is **disabled while the
  socket is connected** and takes over automatically the moment it isn't —
  the socket is the optimization, polling is the guarantee, matching the
  backend's own framing of realtime.

## Key decisions

| Decision | Reason |
|---|---|
| Events patch the Query cache, never Zustand | Two sources of "current order status" (a socket-fed store and a query cache) would eventually disagree; there is only one |
| Polling disabled only while the socket is actually connected, not merely "present" | A socket object existing but not connected (reconnect backoff, network drop) must not silently stop the safety-net poll |
| Reconnect uses the freshly-rotated access token, not the one from initial connection | An access token is 15 minutes; a socket session can easily outlive it, and a reconnect with a stale token would be rejected by the backend's `handleConnection` check |

## Verified

With the kitchen board open and untouched, placing an order through the API
directly appeared as a new card within a few seconds — confirmed as a
socket push, not the 15s poll, by timing it. Blocking the WebSocket route
entirely in the browser's dev tools left the app fully functional, with the
board falling back to visibly polling (grey indicator) and new orders still
appearing, just on the slower cadence.

## Source of truth

[`frontend/CLAUDE.md`](../../../frontend/CLAUDE.md) → *Realtime*, and
*Build order* item 10. (A socket-reuse bug between the app shell and the
kitchen board, found while integration-testing this feature, is documented
in [step 25](../25-polish-accessibility-and-testing/CLAUDE.md) alongside the
other bugs found the same way.)
