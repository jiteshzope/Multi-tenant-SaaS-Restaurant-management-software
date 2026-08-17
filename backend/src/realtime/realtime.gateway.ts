import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';
import type { AccessTokenPayload } from '../types/auth-user';
import type { AppConfig } from '../config/configuration';
import { RealtimeService } from './realtime.service';
import { rooms } from './rooms';

/**
 * What we hang off a connected socket. Socket.IO types `client.data` as `any`
 * by default, which makes every read of it unchecked — and this one holds the
 * verified token claims that decide which tenant rooms the socket is in, so it
 * is the last thing that should be untyped.
 */
interface SocketData {
  user?: AccessTokenPayload;
}

/** Socket.IO's defaults for the three event maps; only `data` is ours. */
type ClientSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

/**
 * Rooms are joined server-side from the verified token. The client never asks
 * to join one, so a socket can never subscribe to another tenant's stream.
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.bind(server);
    this.logger.log('Realtime gateway ready on /realtime');
  }

  handleConnection(client: ClientSocket): void {
    const raw =
      (client.handshake.auth?.token as string | undefined) ??
      stripBearer(client.handshake.headers.authorization);

    if (!raw) return void client.disconnect(true);

    let claims: AccessTokenPayload;
    try {
      claims = this.jwt.verify<AccessTokenPayload>(raw, {
        secret: this.config.get('jwt.accessSecret', { infer: true }),
      });
    } catch {
      return void client.disconnect(true);
    }

    client.data.user = claims;
    void client.join(rooms.tenant(claims.rid));
    if (claims.role === 'KITCHEN' || claims.role === 'OWNER') {
      void client.join(rooms.kitchen(claims.rid));
    }
    if (claims.role === 'WAITER') {
      void client.join(rooms.waiter(claims.rid, claims.sub));
    }

    client.emit('ready', { role: claims.role });
  }

  handleDisconnect(_client: ClientSocket): void {
    /* socket.io leaves every room automatically */
  }

  @SubscribeMessage('ping')
  handlePing(): { pong: number } {
    return { pong: Date.now() };
  }
}

function stripBearer(header?: string): string | undefined {
  if (!header) return undefined;
  return header.startsWith('Bearer ') ? header.slice(7) : header;
}
