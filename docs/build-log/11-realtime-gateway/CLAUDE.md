# Step 11 — Realtime gateway

**Depends on:** [09 — Orders module](../09-orders-module/CLAUDE.md) and
[10 — Kitchen module](../10-kitchen-module/CLAUDE.md) (the events this
gateway emits originate in those two services).

## What shipped

`RealtimeModule` — `RealtimeGateway` (`@WebSocketGateway({ namespace:
'/realtime', cors })`) and `RealtimeService`, the thin emit-helper layer
domain services actually depend on.

- **Connection**: the JWT travels in `handshake.auth.token`. Verification
  happens inline in `handleConnection` (there is no `WsJwtGuard` class — a
  gateway lifecycle hook is not a guard context, so the token is checked
  before any room is joined and an invalid socket is disconnected
  immediately).
- **Rooms**, joined server-side purely from the verified token — the client
  never requests a room: `restaurant:{rid}`, `restaurant:{rid}:kitchen`,
  `restaurant:{rid}:waiter:{userId}`. Nothing is ever emitted outside a
  tenant room.
- **Server → client events**: `order:new` (from `OrderService.place`, to
  `:kitchen` + owner), `order:status` (from `KitchenService.transition`, to
  the tenant + the originating waiter), `order:cancelled`, `table:opened`,
  `table:closed`, `table:assigned`, `menu:updated`.
- Domain services depend on `RealtimeService`, never on `RealtimeGateway`
  directly — avoids a circular import between the gateway module and every
  domain module, and keeps services unit-testable without a socket.
- Every emit happens **after** the enclosing transaction commits, never
  inside it — a client should never see an event for a write that then
  rolls back.

## Key decisions

| Decision | Reason |
|---|---|
| No `WsJwtGuard` class, verification inline in `handleConnection` | Nest guards run in an HTTP execution context; a WebSocket lifecycle hook isn't one, so the plan's original guard-based design was adjusted to fit how Socket.IO connections actually authenticate |
| Rooms decided server-side from the token, not requested by the client | A client asking to join `restaurant:{other-rid}:kitchen` must be structurally impossible, not merely rejected |
| Realtime treated as an optimization, never a dependency | The kitchen board (step 22) still polls `GET /kitchen/board` every 15s regardless of socket state — sockets push updates faster, they are not the only path to a correct board |
| Emit after commit, not inside the transaction | An emitted event implies "this happened"; emitting mid-transaction could announce a write that a later step in the same transaction aborts |

## Verified

A socket presenting a token for one restaurant could not receive events
emitted to another restaurant's rooms — checked by connecting two sockets
with tokens from different seed contexts and confirming cross-talk never
occurred. An invalid/expired token on connection resulted in an immediate
disconnect rather than a silently-open unauthenticated socket.

## Source of truth

[`backend/CLAUDE.md`](../../../backend/CLAUDE.md) → *WebSockets — live
kitchen updates* (connection, rooms, the full event table) and *Build order*
item 10, plus the *What was built* deviation note on `WsJwtGuard`.
