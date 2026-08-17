import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import {
  ItemUnavailableException,
  NotFoundException,
  OrderAlreadyMovedException,
  SessionNotOpenException,
  TableNotAssignedException,
} from '../../common/exceptions/domain.exception';
import type { AuthUser } from '../../types/auth-user';
import type { PlaceOrderDto } from './dto/orders.dto';

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  note: true,
  tableId: true,
  tableSessionId: true,
  placedAt: true,
  preparingAt: true,
  completedAt: true,
  cancelledAt: true,
  createdBy: { select: { id: true, name: true } },
  // Order has no direct relation to RestaurantTable in schema.prisma (the
  // composite FK lives in raw SQL), so the table number comes via the session.
  session: { select: { table: { select: { tableNumber: true, label: true } } } },
  items: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      menuItemId: true,
      itemName: true,
      unitPrice: true,
      quantity: true,
      lineTotal: true,
      note: true,
    },
  },
} satisfies Prisma.OrderSelect;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * The core transaction — database/CLAUDE.md query 26.
   *
   *   1. lock the session FOR UPDATE and confirm it is OPEN and ours
   *   2. next_order_number() — atomic per-restaurant counter
   *   3. insert the order header
   *   4. read name + price from menu_items (never from the request body)
   *   5. insert the items with that snapshot
   *   6. AFTER COMMIT — emit order:new
   */
  async place(user: AuthUser, dto: PlaceOrderDto) {
    const sessionId = await this.resolveSession(user, dto);

    // Merge duplicate lines before hitting the database: two "+1 Coke" taps are
    // one line of quantity 2, not two rows.
    const merged = new Map<string, { menuItemId: string; quantity: number; note?: string }>();
    for (const line of dto.items) {
      const existing = merged.get(line.menuItemId);
      if (existing) {
        existing.quantity += line.quantity;
        existing.note ??= line.note;
      } else {
        merged.set(line.menuItemId, { ...line });
      }
    }
    const lines = [...merged.values()];

    const orderId = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; table_id: string }[]>`
        SELECT id, table_id
        FROM table_sessions
        WHERE id = ${sessionId}::uuid
          AND restaurant_id = ${user.restaurantId}::uuid
          AND status = 'OPEN'
        FOR UPDATE`;
      if (locked.length === 0) throw new SessionNotOpenException();

      const [{ next }] = await tx.$queryRaw<{ next: number }[]>`
        SELECT next_order_number(${user.restaurantId}::uuid) AS next`;

      const order = await tx.order.create({
        data: {
          restaurantId: user.restaurantId,
          tableSessionId: sessionId,
          tableId: locked[0].table_id,
          orderNumber: next,
          createdByUserId: user.userId,
          note: dto.note ?? null,
        },
        select: { id: true },
      });

      const available = await tx.menuItem.findMany({
        where: {
          id: { in: lines.map((l) => l.menuItemId) },
          restaurantId: user.restaurantId,
          isActive: true,
          isAvailable: true,
        },
        select: { id: true, name: true, price: true },
      });

      if (available.length !== lines.length) {
        const ok = new Set(available.map((i) => i.id));
        throw new ItemUnavailableException({
          menuItemIds: lines.filter((l) => !ok.has(l.menuItemId)).map((l) => l.menuItemId),
        });
      }

      const priceOf = new Map(available.map((i) => [i.id, i]));
      await tx.orderItem.createMany({
        data: lines.map((line) => {
          const item = priceOf.get(line.menuItemId)!;
          return {
            restaurantId: user.restaurantId,
            orderId: order.id,
            menuItemId: item.id,
            itemName: item.name,
            unitPrice: item.price, // ← from the database, never the browser
            quantity: line.quantity,
            note: line.note ?? null,
            // lineTotal is GENERATED ALWAYS — deliberately absent.
          };
        }),
      });

      return order.id;
    });

    const order = await this.byId(user.restaurantId, orderId);
    this.realtime.orderNew(user.restaurantId, order);
    return order;
  }

  async detail(user: AuthUser, orderId: string) {
    const order = await this.byId(user.restaurantId, orderId);
    await this.assertTableAccess(user, order.tableId);
    return order;
  }

  /**
   * Query 32 — the expected current state lives in the WHERE clause, not in a
   * TypeScript `if`. Two simultaneous clicks: one updates a row, the other
   * matches nothing and gets 409.
   */
  async transition(
    user: AuthUser,
    orderId: string,
    to: 'PREPARING' | 'COMPLETED',
  ) {
    const from = to === 'PREPARING' ? 'PENDING' : 'PREPARING';
    const stamp = to === 'PREPARING' ? { preparingAt: new Date() } : { completedAt: new Date() };

    const { count } = await this.prisma.order.updateMany({
      where: { id: orderId, restaurantId: user.restaurantId, status: from },
      data: { status: to, ...stamp },
    });

    if (count === 0) {
      const exists = await this.prisma.order.findFirst({
        where: { id: orderId, restaurantId: user.restaurantId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Order');
      throw new OrderAlreadyMovedException();
    }

    const order = await this.byId(user.restaurantId, orderId);
    this.realtime.orderStatus(user.restaurantId, {
      orderId: order.id,
      status: order.status,
      at: new Date(),
    });
    return order;
  }

  /**
   * COMPLETED → PREPARING — the kitchen handler tapped "Mark complete" on the
   * wrong card and needs it back on the pass.
   *
   * Two deliberate choices.
   *
   * `preparingAt` is left exactly as it was. The board sorts the PREPARING
   * column by that column, so preserving it returns the card to the position it
   * left rather than to the back of the queue — which is the whole point of
   * undoing a mistake. Only an order that somehow reached COMPLETED without one
   * gets a fresh stamp, so it cannot sort as NULL.
   *
   * The session must still be OPEN. `assert_session_open` only fires on INSERT,
   * so nothing in the database stops an UPDATE parking a PREPARING order under
   * a session that has already been closed and billed — and `SessionService.close`
   * refuses to close while orders are in progress, so allowing it here would
   * manufacture a state the rest of the system says cannot exist.
   */
  async reopen(user: AuthUser, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId: user.restaurantId },
      select: {
        id: true,
        preparingAt: true,
        session: { select: { status: true } },
      },
    });
    if (!order) throw new NotFoundException('Order');
    if (order.session.status !== 'OPEN') throw new SessionNotOpenException();

    // The expected current state stays in the WHERE clause: two people undoing
    // the same card means one wins and the other gets a 409.
    const { count } = await this.prisma.order.updateMany({
      where: { id: orderId, restaurantId: user.restaurantId, status: 'COMPLETED' },
      data: {
        status: 'PREPARING',
        completedAt: null,
        ...(order.preparingAt ? {} : { preparingAt: new Date() }),
      },
    });
    if (count === 0) throw new OrderAlreadyMovedException();

    const updated = await this.byId(user.restaurantId, orderId);
    this.realtime.orderStatus(user.restaurantId, {
      orderId: updated.id,
      status: updated.status,
      at: new Date(),
    });
    return updated;
  }

  /** Query 28 — cancelling is only legal while the kitchen has not started. */
  async cancel(user: AuthUser, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId: user.restaurantId },
      select: { id: true, tableId: true },
    });
    if (!order) throw new NotFoundException('Order');
    await this.assertTableAccess(user, order.tableId);

    const { count } = await this.prisma.order.updateMany({
      where: { id: orderId, restaurantId: user.restaurantId, status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    if (count === 0) throw new OrderAlreadyMovedException();

    this.realtime.orderCancelled(user.restaurantId, { orderId });
    return this.byId(user.restaurantId, orderId);
  }

  /* ------------------------------------------------------------------ */

  private async byId(restaurantId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      select: ORDER_SELECT,
    });
    if (!order) throw new NotFoundException('Order');

    const { createdBy, session, ...rest } = order;
    return {
      ...rest,
      tableNumber: session.table.tableNumber,
      tableLabel: session.table.label,
      placedById: createdBy.id,
      placedBy: createdBy.name,
      orderTotal: order.items.reduce(
        (sum, i) => sum.plus(i.lineTotal ?? new Prisma.Decimal(0)),
        new Prisma.Decimal(0),
      ),
    };
  }

  private async resolveSession(user: AuthUser, dto: PlaceOrderDto): Promise<string> {
    if (dto.sessionId) {
      const session = await this.prisma.tableSession.findFirst({
        where: { id: dto.sessionId, restaurantId: user.restaurantId },
        select: { id: true, tableId: true, status: true },
      });
      if (!session) throw new NotFoundException('Session');
      if (session.status !== 'OPEN') throw new SessionNotOpenException();
      await this.assertTableAccess(user, session.tableId);
      return session.id;
    }

    if (!dto.tableId) throw new BadRequestException('Either sessionId or tableId is required');

    await this.assertTableAccess(user, dto.tableId);
    const session = await this.prisma.tableSession.findFirst({
      where: { restaurantId: user.restaurantId, tableId: dto.tableId, status: 'OPEN' },
      select: { id: true },
    });
    if (!session) throw new SessionNotOpenException();
    return session.id;
  }

  private async assertTableAccess(user: AuthUser, tableId: string): Promise<void> {
    if (user.role !== 'WAITER') return;
    const assignment = await this.prisma.tableWaiterAssignment.findFirst({
      where: {
        restaurantId: user.restaurantId,
        tableId,
        waiterUserId: user.userId,
        unassignedAt: null,
      },
      select: { id: true },
    });
    if (!assignment) throw new TableNotAssignedException();
  }
}
