import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import {
  NotFoundException,
  OrdersInProgressException,
  SessionNotOpenException,
  TableNotAssignedException,
} from '../../common/exceptions/domain.exception';
import type { AuthUser } from '../../types/auth-user';
import type { OpenSessionDto } from './dto/sessions.dto';

interface RawSession {
  id: string;
  restaurantId: string;
  tableId: string;
  status: 'OPEN' | 'CLOSED';
  guestCount: number | null;
  customerName: string | null;
  customerPhone: string | null;
  openedAt: Date;
  created: boolean;
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Query 23 — idempotent open. A double-tap, or the owner and the waiter
   * tapping at the same moment, returns the *same* session: the partial unique
   * index `uq_one_open_session_per_table` is what makes that a guarantee rather
   * than a hope.
   */
  async open(user: AuthUser, dto: OpenSessionDto) {
    await this.assertTableAccess(user, dto.tableId);

    const rows = await this.prisma.$queryRaw<RawSession[]>`
      WITH inserted AS (
        INSERT INTO table_sessions
              (restaurant_id, table_id, opened_by_user_id, guest_count, customer_name, customer_phone)
        VALUES (${user.restaurantId}::uuid, ${dto.tableId}::uuid, ${user.userId}::uuid,
                ${dto.guestCount ?? null}::smallint, ${dto.customerName ?? null}::varchar,
                ${dto.customerPhone ?? null}::varchar)
        ON CONFLICT (table_id) WHERE status = 'OPEN'
        DO NOTHING
        RETURNING id, restaurant_id, table_id, status, guest_count,
                  customer_name, customer_phone, opened_at
      )
      SELECT id                AS "id",
             restaurant_id     AS "restaurantId",
             table_id          AS "tableId",
             status            AS "status",
             guest_count       AS "guestCount",
             customer_name     AS "customerName",
             customer_phone    AS "customerPhone",
             opened_at         AS "openedAt",
             true              AS "created"
      FROM inserted
      UNION ALL
      SELECT s.id, s.restaurant_id, s.table_id, s.status, s.guest_count,
             s.customer_name, s.customer_phone, s.opened_at, false
      FROM table_sessions s
      WHERE s.table_id      = ${dto.tableId}::uuid
        AND s.restaurant_id = ${user.restaurantId}::uuid
        AND s.status = 'OPEN'
        AND NOT EXISTS (SELECT 1 FROM inserted)`;

    if (rows.length === 0) throw new NotFoundException('Table');
    const session = rows[0];

    if (session.created) {
      // Emitted after the statement committed — never inside the transaction.
      this.realtime.tableOpened(user.restaurantId, {
        tableId: session.tableId,
        sessionId: session.id,
      });
    }

    return session;
  }

  /** Query 25 — the table-detail timeline: every order with its items. */
  async detail(user: AuthUser, sessionId: string) {
    const session = await this.prisma.tableSession.findFirst({
      where: { id: sessionId, restaurantId: user.restaurantId },
      select: {
        id: true,
        tableId: true,
        status: true,
        guestCount: true,
        customerName: true,
        customerPhone: true,
        openedAt: true,
        closedAt: true,
        table: { select: { tableNumber: true, label: true, capacity: true } },
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
    });
    if (!session) throw new NotFoundException('Session');
    await this.assertTableAccess(user, session.tableId);

    const orders = await this.prisma.order.findMany({
      where: { tableSessionId: sessionId, restaurantId: user.restaurantId },
      orderBy: { placedAt: 'asc' },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        note: true,
        placedAt: true,
        preparingAt: true,
        completedAt: true,
        cancelledAt: true,
        createdBy: { select: { id: true, name: true } },
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            itemName: true,
            unitPrice: true,
            quantity: true,
            lineTotal: true,
            note: true,
          },
        },
      },
    });

    const shaped = orders.map(({ createdBy, items, ...o }) => ({
      ...o,
      placedById: createdBy.id,
      placedBy: createdBy.name,
      items,
      orderTotal: items.reduce(
        (sum, i) => sum.plus(i.lineTotal ?? new Prisma.Decimal(0)),
        new Prisma.Decimal(0),
      ),
    }));

    const runningTotal = shaped
      .filter((o) => o.status !== 'CANCELLED')
      .reduce((sum, o) => sum.plus(o.orderTotal), new Prisma.Decimal(0));

    return {
      ...session,
      tableNumber: session.table.tableNumber,
      tableLabel: session.table.label,
      orders: shaped,
      runningTotal,
      unfinishedOrders: shaped.filter(
        (o) => o.status === 'PENDING' || o.status === 'PREPARING',
      ).length,
    };
  }

  /**
   * Queries 34–36 — merged lines plus totals, computed by PostgreSQL. The
   * client renders these verbatim; recomputing in the browser would drift from
   * the database's ROUND.
   */
  async bill(user: AuthUser, sessionId: string) {
    const session = await this.prisma.tableSession.findFirst({
      where: { id: sessionId, restaurantId: user.restaurantId },
      select: {
        id: true,
        tableId: true,
        status: true,
        guestCount: true,
        customerName: true,
        openedAt: true,
        closedAt: true,
        table: { select: { tableNumber: true, label: true } },
        openedBy: { select: { name: true } },
        restaurant: {
          select: {
            name: true,
            address: true,
            phone: true,
            currency: true,
            taxPercent: true,
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Session');
    await this.assertTableAccess(user, session.tableId);

    const lines = await this.prisma.$queryRaw<
      { itemName: string; unitPrice: Prisma.Decimal; quantity: bigint; amount: Prisma.Decimal }[]
    >`
      SELECT oi.item_name          AS "itemName",
             oi.unit_price         AS "unitPrice",
             SUM(oi.quantity)      AS "quantity",
             SUM(oi.line_total)    AS "amount"
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.table_session_id = ${sessionId}::uuid
        AND o.restaurant_id    = ${user.restaurantId}::uuid
        AND o.status <> 'CANCELLED'
      GROUP BY oi.item_name, oi.unit_price
      ORDER BY oi.item_name`;

    const [totals] = await this.prisma.$queryRaw<
      {
        subtotal: Prisma.Decimal;
        taxPercent: Prisma.Decimal;
        taxAmount: Prisma.Decimal;
        grandTotal: Prisma.Decimal;
        currency: string;
      }[]
    >`
      WITH lines AS (
        SELECT SUM(oi.line_total) AS subtotal
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.table_session_id = ${sessionId}::uuid
          AND o.restaurant_id    = ${user.restaurantId}::uuid
          AND o.status <> 'CANCELLED'
      )
      SELECT COALESCE(l.subtotal, 0)::numeric(12,2)                       AS "subtotal",
             r.tax_percent                                               AS "taxPercent",
             ROUND(COALESCE(l.subtotal, 0) * r.tax_percent / 100, 2)     AS "taxAmount",
             ROUND(COALESCE(l.subtotal, 0) * (1 + r.tax_percent / 100), 2) AS "grandTotal",
             r.currency                                                  AS "currency"
      FROM restaurants r
      CROSS JOIN lines l
      WHERE r.id = ${user.restaurantId}::uuid`;

    return {
      sessionId: session.id,
      status: session.status,
      restaurant: session.restaurant,
      tableNumber: session.table.tableNumber,
      tableLabel: session.table.label,
      guestCount: session.guestCount,
      customerName: session.customerName,
      servedBy: session.openedBy.name,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      lines,
      ...totals,
    };
  }

  /**
   * Query 37 — the checkout transaction. The session row is locked FOR UPDATE
   * so a new order cannot slip in between the check and the close, and
   * `sync_table_status` flips the table back to VACANT on its own.
   */
  async close(user: AuthUser, sessionId: string) {
    const session = await this.prisma.tableSession.findFirst({
      where: { id: sessionId, restaurantId: user.restaurantId },
      select: { id: true, tableId: true },
    });
    if (!session) throw new NotFoundException('Session');
    await this.assertTableAccess(user, session.tableId);

    const closed = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; table_id: string }[]>`
        SELECT id, table_id
        FROM table_sessions
        WHERE id = ${sessionId}::uuid
          AND restaurant_id = ${user.restaurantId}::uuid
          AND status = 'OPEN'
        FOR UPDATE`;
      if (locked.length === 0) throw new SessionNotOpenException();

      const unfinished = await tx.order.findMany({
        where: {
          tableSessionId: sessionId,
          restaurantId: user.restaurantId,
          status: { in: ['PENDING', 'PREPARING'] },
        },
        select: { orderNumber: true, status: true },
      });
      if (unfinished.length > 0) throw new OrdersInProgressException({ orders: unfinished });

      return tx.tableSession.update({
        where: { id: sessionId },
        data: { status: 'CLOSED', closedAt: new Date(), closedByUserId: user.userId },
        select: { id: true, tableId: true, status: true, closedAt: true },
      });
    });

    this.realtime.tableClosed(user.restaurantId, {
      tableId: closed.tableId,
      sessionId: closed.id,
    });

    return closed;
  }

  /** Query 38 — closed sessions for one table. */
  async history(user: AuthUser, tableId: string, limit = 20) {
    await this.assertTableAccess(user, tableId);
    return this.prisma.$queryRaw<
      {
        id: string;
        openedAt: Date;
        closedAt: Date | null;
        servedBy: string;
        total: Prisma.Decimal;
      }[]
    >`
      SELECT s.id,
             s.opened_at                     AS "openedAt",
             s.closed_at                     AS "closedAt",
             u.name                          AS "servedBy",
             COALESCE(SUM(oi.line_total), 0)::numeric(12,2) AS "total"
      FROM table_sessions s
      JOIN users u             ON u.id = s.opened_by_user_id
      LEFT JOIN orders o       ON o.table_session_id = s.id AND o.status <> 'CANCELLED'
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE s.restaurant_id = ${user.restaurantId}::uuid
        AND s.table_id      = ${tableId}::uuid
        AND s.status = 'CLOSED'
      GROUP BY s.id, u.name
      ORDER BY s.opened_at DESC
      LIMIT ${limit}`;
  }

  /** A WAITER may only reach tables actively assigned to them; OWNER bypasses. */
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
