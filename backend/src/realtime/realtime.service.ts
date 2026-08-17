import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import { serialize } from '../common/interceptors/transform.interceptor';
import { rooms } from './rooms';

/**
 * Emit helpers injected into domain services. Services depend on *this*, never
 * on the gateway — that keeps them unit-testable and avoids a circular import
 * (gateway → service → gateway).
 *
 * Every emit happens AFTER the transaction has committed.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server?: Server;

  /** Called once by the gateway in afterInit(). */
  bind(server: Server): void {
    this.server = server;
  }

  private emit(room: string, event: string, payload: unknown): void {
    if (!this.server) return; // realtime is an optimization; polling is the guarantee
    this.server.to(room).emit(event, serialize(payload));
  }

  orderNew(restaurantId: string, payload: unknown): void {
    this.emit(rooms.kitchen(restaurantId), 'order:new', payload);
    this.emit(rooms.tenant(restaurantId), 'order:new', payload);
  }

  orderStatus(restaurantId: string, payload: { orderId: string; status: string; at: Date }): void {
    this.emit(rooms.tenant(restaurantId), 'order:status', payload);
    this.emit(rooms.kitchen(restaurantId), 'order:status', payload);
  }

  orderCancelled(restaurantId: string, payload: { orderId: string }): void {
    this.emit(rooms.kitchen(restaurantId), 'order:cancelled', payload);
    this.emit(rooms.tenant(restaurantId), 'order:cancelled', payload);
  }

  tableOpened(restaurantId: string, payload: { tableId: string; sessionId: string }): void {
    this.emit(rooms.tenant(restaurantId), 'table:opened', payload);
  }

  tableClosed(restaurantId: string, payload: { tableId: string; sessionId: string }): void {
    this.emit(rooms.tenant(restaurantId), 'table:closed', payload);
  }

  tableAssigned(
    restaurantId: string,
    payload: { tableId: string; waiterId: string; previousWaiterId?: string | null },
  ): void {
    this.emit(rooms.tenant(restaurantId), 'table:assigned', payload);
    this.emit(rooms.waiter(restaurantId, payload.waiterId), 'table:assigned', payload);
    if (payload.previousWaiterId) {
      this.emit(rooms.waiter(restaurantId, payload.previousWaiterId), 'table:assigned', payload);
    }
  }

  menuUpdated(restaurantId: string, payload: { type: string; entityId?: string }): void {
    this.emit(rooms.tenant(restaurantId), 'menu:updated', payload);
  }
}
