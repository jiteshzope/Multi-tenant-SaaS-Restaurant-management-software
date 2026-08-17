import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import type { AuthUser } from '../../types/auth-user';

export interface KitchenOrderRow {
  id: string;
  orderNumber: number;
  status: 'PENDING' | 'PREPARING' | 'COMPLETED';
  note: string | null;
  placedAt: Date;
  preparingAt: Date | null;
  completedAt: Date | null;
  tableNumber: number;
  placedBy: string;
  ageSeconds: number;
  items: { name: string; quantity: number; note: string | null }[];
}

export type KitchenBoard = Record<'PENDING' | 'PREPARING' | 'COMPLETED', KitchenOrderRow[]>;

@Injectable()
export class KitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  /**
   * Query 29 — each order arrives as ONE row with its items pre-aggregated into
   * JSON, which is what lets React draw a single bordered card per order.
   * `ageSeconds` is computed by PostgreSQL so a wrong client clock cannot make
   * a stale order look fresh.
   */
  async board(restaurantId: string): Promise<KitchenBoard> {
    const timezone = await this.timezone(restaurantId);

    const rows = await this.prisma.$queryRaw<KitchenOrderRow[]>`
      SELECT o.id,
             o.order_number   AS "orderNumber",
             o.status,
             o.note,
             o.placed_at      AS "placedAt",
             o.preparing_at   AS "preparingAt",
             o.completed_at   AS "completedAt",
             t.table_number   AS "tableNumber",
             u.name           AS "placedBy",
             EXTRACT(EPOCH FROM (now() - o.placed_at))::int AS "ageSeconds",
             COALESCE(
               json_agg(
                 json_build_object('name', oi.item_name,
                                   'quantity', oi.quantity,
                                   'note', oi.note)
                 ORDER BY oi.created_at
               ) FILTER (WHERE oi.id IS NOT NULL),
               '[]'
             ) AS items
      FROM orders o
      JOIN restaurant_tables t ON t.id = o.table_id
      JOIN users u             ON u.id = o.created_by_user_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.restaurant_id = ${restaurantId}::uuid
        AND o.status IN ('PENDING', 'PREPARING', 'COMPLETED')
        AND o.placed_at >= date_trunc('day', now() AT TIME ZONE ${timezone})
      GROUP BY o.id, t.table_number, u.name
      /*
        Each column answers a different question, so each sorts on its own
        timestamp — one ORDER BY, because the rows arrive in a single result set
        and are bucketed below.

          PENDING    placed_at ASC     what has been waiting longest to start
          PREPARING  preparing_at ASC  the order of the queue actually being cooked
          COMPLETED  completed_at DESC what just came off the pass

        Sorting all three by placed_at, as this used to, was wrong for two of
        them: an order placed early but started late jumped the PREPARING queue,
        and the COMPLETED column buried the most recent plate at the bottom.

        Each CASE is NULL outside its own status, so it is inert for the other
        two groups and they fall through to placed_at.
      */
      ORDER BY CASE WHEN o.status = 'COMPLETED' THEN o.completed_at END DESC NULLS LAST,
               CASE WHEN o.status = 'PREPARING' THEN o.preparing_at END ASC NULLS LAST,
               o.placed_at ASC`;

    const board: KitchenBoard = { PENDING: [], PREPARING: [], COMPLETED: [] };
    for (const row of rows) board[row.status].push(row);
    return board;
  }

  /** Query 33 — the column badges. */
  async counts(restaurantId: string) {
    const timezone = await this.timezone(restaurantId);
    const rows = await this.prisma.$queryRaw<{ status: string; count: bigint }[]>`
      SELECT status, COUNT(*) AS count
      FROM orders
      WHERE restaurant_id = ${restaurantId}::uuid
        AND placed_at >= date_trunc('day', now() AT TIME ZONE ${timezone})
      GROUP BY status`;

    const counts: Record<string, number> = {
      PENDING: 0,
      PREPARING: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };
    for (const r of rows) counts[r.status] = Number(r.count);
    return counts;
  }

  start(user: AuthUser, orderId: string) {
    return this.orders.transition(user, orderId, 'PREPARING');
  }

  complete(user: AuthUser, orderId: string) {
    return this.orders.transition(user, orderId, 'COMPLETED');
  }

  /** Undo a mistaken "Mark complete" — back to PREPARING, original queue position. */
  reopen(user: AuthUser, orderId: string) {
    return this.orders.reopen(user, orderId);
  }

  /** "Today" means today in the restaurant's timezone, not the server's. */
  private async timezone(restaurantId: string): Promise<string> {
    const r = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    return r.timezone;
  }
}
