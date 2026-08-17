import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { DateRangeDto } from '../../common/dto/pagination.dto';

/**
 * Every aggregate here is `$queryRaw` because it needs `date_trunc`, `EXTRACT`
 * or `AT TIME ZONE` — PostgreSQL features Prisma has no API for. All of them
 * are tagged templates, so every value is parameterized.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Query 39 — today's headline numbers, in the restaurant's own timezone. */
  async summary(restaurantId: string) {
    const tz = await this.timezone(restaurantId);

    const [today] = await this.prisma.$queryRaw<
      {
        sessionsServed: bigint;
        ordersPlaced: bigint;
        revenue: Prisma.Decimal;
        avgBill: Prisma.Decimal | null;
      }[]
    >`
      SELECT COUNT(DISTINCT s.id)                       AS "sessionsServed",
             COUNT(DISTINCT o.id)                       AS "ordersPlaced",
             COALESCE(SUM(oi.line_total), 0)::numeric(12,2) AS "revenue",
             ROUND(COALESCE(SUM(oi.line_total), 0)
                   / NULLIF(COUNT(DISTINCT s.id), 0), 2)     AS "avgBill"
      FROM table_sessions s
      LEFT JOIN orders o       ON o.table_session_id = s.id AND o.status <> 'CANCELLED'
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE s.restaurant_id = ${restaurantId}::uuid
        AND s.opened_at >= date_trunc('day', now() AT TIME ZONE ${tz})`;

    const openTables = await this.prisma.tableSession.count({
      where: { restaurantId, status: 'OPEN' },
    });

    const activeTables = await this.prisma.restaurantTable.count({
      where: { restaurantId, isActive: true },
    });

    return { ...today, openTables, activeTables };
  }

  /** Query 40 — revenue per day for the line chart. */
  async daily(restaurantId: string, range: DateRangeDto) {
    const tz = await this.timezone(restaurantId);
    const { from, to } = bounds(range, 30);

    return this.prisma.$queryRaw<
      { day: Date; orders: bigint; revenue: Prisma.Decimal }[]
    >`
      SELECT date_trunc('day', o.placed_at AT TIME ZONE ${tz})::date AS "day",
             COUNT(DISTINCT o.id)                                    AS "orders",
             COALESCE(SUM(oi.line_total), 0)::numeric(12,2)          AS "revenue"
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.restaurant_id = ${restaurantId}::uuid
        AND o.status <> 'CANCELLED'
        AND o.placed_at >= ${from}
        AND o.placed_at <  ${to}
      GROUP BY 1
      ORDER BY 1`;
  }

  /** Query 41 — top 10 by units sold. */
  async topItems(restaurantId: string, range: DateRangeDto) {
    const { from, to } = bounds(range, 30);

    return this.prisma.$queryRaw<
      { itemName: string; unitsSold: bigint; revenue: Prisma.Decimal }[]
    >`
      SELECT oi.item_name                            AS "itemName",
             SUM(oi.quantity)                        AS "unitsSold",
             SUM(oi.line_total)::numeric(12,2)       AS "revenue"
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.restaurant_id = ${restaurantId}::uuid
        AND o.status <> 'CANCELLED'
        AND o.placed_at >= ${from}
        AND o.placed_at <  ${to}
      GROUP BY oi.item_name
      ORDER BY "unitsSold" DESC
      LIMIT 10`;
  }

  /** Query 42 — waiter performance. */
  async waiters(restaurantId: string, range: DateRangeDto) {
    const { from, to } = bounds(range, 30);

    return this.prisma.$queryRaw<
      {
        waiterId: string;
        waiter: string;
        ordersTaken: bigint;
        tablesServed: bigint;
        revenue: Prisma.Decimal;
      }[]
    >`
      SELECT u.id                                    AS "waiterId",
             u.name                                  AS "waiter",
             COUNT(DISTINCT o.id)                    AS "ordersTaken",
             COUNT(DISTINCT o.table_session_id)      AS "tablesServed",
             COALESCE(SUM(oi.line_total), 0)::numeric(12,2) AS "revenue"
      FROM orders o
      JOIN users u             ON u.id = o.created_by_user_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.restaurant_id = ${restaurantId}::uuid
        AND o.status <> 'CANCELLED'
        AND o.placed_at >= ${from}
        AND o.placed_at <  ${to}
      GROUP BY u.id, u.name
      ORDER BY "revenue" DESC`;
  }

  /** Query 43 — only possible because preparing_at / completed_at are stored. */
  async prepTime(restaurantId: string, range: DateRangeDto) {
    const { from, to } = bounds(range, 30);

    const [row] = await this.prisma.$queryRaw<
      {
        avgMinutes: Prisma.Decimal | null;
        worstMinutes: Prisma.Decimal | null;
        ordersMeasured: bigint;
      }[]
    >`
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - placed_at)) / 60)::numeric, 1) AS "avgMinutes",
             ROUND(MAX(EXTRACT(EPOCH FROM (completed_at - placed_at)) / 60)::numeric, 1) AS "worstMinutes",
             COUNT(*)                                                                    AS "ordersMeasured"
      FROM orders
      WHERE restaurant_id = ${restaurantId}::uuid
        AND status = 'COMPLETED'
        AND completed_at IS NOT NULL
        AND placed_at >= ${from}
        AND placed_at <  ${to}`;

    return row;
  }

  /** Query 44 — busiest hours, bucketed in the restaurant's timezone. */
  async hourly(restaurantId: string, range: DateRangeDto) {
    const tz = await this.timezone(restaurantId);
    const { from, to } = bounds(range, 30);

    const rows = await this.prisma.$queryRaw<{ hourOfDay: number; orders: bigint }[]>`
      SELECT EXTRACT(HOUR FROM o.placed_at AT TIME ZONE ${tz})::int AS "hourOfDay",
             COUNT(*)                                              AS "orders"
      FROM orders o
      WHERE o.restaurant_id = ${restaurantId}::uuid
        AND o.status <> 'CANCELLED'
        AND o.placed_at >= ${from}
        AND o.placed_at <  ${to}
      GROUP BY 1
      ORDER BY 1`;

    // Fill the gaps so the chart always draws a full 24-hour axis.
    const byHour = new Map(rows.map((r) => [r.hourOfDay, Number(r.orders)]));
    return Array.from({ length: 24 }, (_, hourOfDay) => ({
      hourOfDay,
      orders: byHour.get(hourOfDay) ?? 0,
    }));
  }

  private async timezone(restaurantId: string): Promise<string> {
    const r = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    return r.timezone;
  }
}

function bounds(range: DateRangeDto, defaultDays: number): { from: Date; to: Date } {
  const to = range.to ? new Date(range.to) : new Date();
  const from = range.from
    ? new Date(range.from)
    : new Date(to.getTime() - defaultDays * 24 * 60 * 60 * 1000);
  return { from, to };
}
