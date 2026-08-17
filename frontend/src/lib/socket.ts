import { io, type Socket } from 'socket.io-client';
import { env } from './env';

let socket: Socket | null = null;

/**
 * One socket for the whole app. Rooms are joined server-side from the token —
 * the client never asks to join one, which is why it cannot subscribe to
 * another tenant's stream.
 */
export function connectSocket(token: string): Socket {
  // Reuse whenever the token matches — including while the handshake is still
  // in flight. Checking `connected` here instead would let a second caller
  // (the shell and the kitchen board both call useSocket) tear down the
  // socket the first one is still opening, orphaning its listeners.
  const existing = socket;
  if (existing && (existing.auth as { token?: string } | undefined)?.token === token) {
    if (!existing.active) existing.connect();
    return existing;
  }

  disconnectSocket();

  socket = io(`${env.socketUrl}/realtime`, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 8_000,
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}
