import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { NotFoundException } from '../../common/exceptions/domain.exception';
import type {
  AssignWaiterDto,
  BulkCreateTablesDto,
  CreateTableDto,
  UpdateTableDto,
} from './dto/tables.dto';

export interface TableGridRow {
  id: string;
  tableNumber: number;
  label: string | null;
  capacity: number;
  status: 'VACANT' | 'OCCUPIED';
  waiterId: string | null;
  waiterName: string | null;
  sessionId: string | null;
  openedAt: Date | null;
  runningTotal: Prisma.Decimal;
  orderCount: bigint;
}

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Query 18 — one request drives the whole owner Tables screen: every table,
   * its waiter, its live session and the running total.
   */
  grid(restaurantId: string): Promise<TableGridRow[]> {
    return this.prisma.$queryRaw<TableGridRow[]>`
      SELECT t.id,
             t.table_number                        AS "tableNumber",
             t.label,
             t.capacity,
             t.status,
             w.id                                  AS "waiterId",
             w.name                                AS "waiterName",
             s.id                                  AS "sessionId",
             s.opened_at                           AS "openedAt",
             COALESCE(SUM(oi.line_total), 0)::numeric(12,2) AS "runningTotal",
             COUNT(DISTINCT o.id)                  AS "orderCount"
      FROM restaurant_tables t
      LEFT JOIN table_waiter_assignments a
             ON a.table_id = t.id AND a.unassigned_at IS NULL
      LEFT JOIN users w          ON w.id = a.waiter_user_id
      LEFT JOIN table_sessions s ON s.table_id = t.id AND s.status = 'OPEN'
      LEFT JOIN orders o         ON o.table_session_id = s.id AND o.status <> 'CANCELLED'
      LEFT JOIN order_items oi   ON oi.order_id = o.id
      WHERE t.restaurant_id = ${restaurantId}::uuid
        AND t.is_active
      GROUP BY t.id, w.id, w.name, s.id, s.opened_at
      ORDER BY t.table_number`;
  }

  /** Query 19 — only the tables assigned to me. */
  myTables(restaurantId: string, waiterUserId: string): Promise<TableGridRow[]> {
    return this.prisma.$queryRaw<TableGridRow[]>`
      SELECT t.id,
             t.table_number                        AS "tableNumber",
             t.label,
             t.capacity,
             t.status,
             w.id                                  AS "waiterId",
             w.name                                AS "waiterName",
             s.id                                  AS "sessionId",
             s.opened_at                           AS "openedAt",
             COALESCE(SUM(oi.line_total), 0)::numeric(12,2) AS "runningTotal",
             COUNT(DISTINCT o.id)                  AS "orderCount"
      FROM table_waiter_assignments a
      JOIN restaurant_tables t   ON t.id = a.table_id
      JOIN users w               ON w.id = a.waiter_user_id
      LEFT JOIN table_sessions s ON s.table_id = t.id AND s.status = 'OPEN'
      LEFT JOIN orders o         ON o.table_session_id = s.id AND o.status <> 'CANCELLED'
      LEFT JOIN order_items oi   ON oi.order_id = o.id
      WHERE a.restaurant_id  = ${restaurantId}::uuid
        AND a.waiter_user_id = ${waiterUserId}::uuid
        AND a.unassigned_at IS NULL
        AND t.is_active
      GROUP BY t.id, w.id, w.name, s.id, s.opened_at
      ORDER BY t.table_number`;
  }

  async one(restaurantId: string, tableId: string) {
    const rows = await this.prisma.$queryRaw<TableGridRow[]>`
      SELECT t.id,
             t.table_number                        AS "tableNumber",
             t.label,
             t.capacity,
             t.status,
             w.id                                  AS "waiterId",
             w.name                                AS "waiterName",
             s.id                                  AS "sessionId",
             s.opened_at                           AS "openedAt",
             COALESCE(SUM(oi.line_total), 0)::numeric(12,2) AS "runningTotal",
             COUNT(DISTINCT o.id)                  AS "orderCount"
      FROM restaurant_tables t
      LEFT JOIN table_waiter_assignments a
             ON a.table_id = t.id AND a.unassigned_at IS NULL
      LEFT JOIN users w          ON w.id = a.waiter_user_id
      LEFT JOIN table_sessions s ON s.table_id = t.id AND s.status = 'OPEN'
      LEFT JOIN orders o         ON o.table_session_id = s.id AND o.status <> 'CANCELLED'
      LEFT JOIN order_items oi   ON oi.order_id = o.id
      WHERE t.restaurant_id = ${restaurantId}::uuid
        AND t.id            = ${tableId}::uuid
      GROUP BY t.id, w.id, w.name, s.id, s.opened_at`;

    if (rows.length === 0) throw new NotFoundException('Table');
    return rows[0];
  }

  create(restaurantId: string, dto: CreateTableDto) {
    return this.prisma.restaurantTable.create({
      data: {
        restaurantId,
        tableNumber: dto.tableNumber,
        label: dto.label ?? null,
        capacity: dto.capacity ?? 4,
      },
      select: TABLE_FIELDS,
    });
  }

  /** Query 17 — `generate_series` in one statement, duplicates silently skipped. */
  async bulkCreate(restaurantId: string, dto: BulkCreateTablesDto) {
    if (dto.to < dto.from) throw new BadRequestException('`to` must be greater than `from`');
    if (dto.to - dto.from > 99) throw new BadRequestException('At most 100 tables per call');

    const created = await this.prisma.$queryRaw<{ id: string; table_number: number }[]>`
      INSERT INTO restaurant_tables (restaurant_id, table_number, capacity)
      SELECT ${restaurantId}::uuid, n, ${dto.capacity ?? 4}::smallint
      FROM generate_series(${dto.from}::int, ${dto.to}::int) AS n
      ON CONFLICT (restaurant_id, table_number) DO NOTHING
      RETURNING id, table_number`;

    return {
      created: created.length,
      skipped: dto.to - dto.from + 1 - created.length,
    };
  }

  async update(restaurantId: string, tableId: string, dto: UpdateTableDto) {
    await this.assertTable(restaurantId, tableId);
    return this.prisma.restaurantTable.update({
      where: { id: tableId },
      data: {
        ...(dto.tableNumber !== undefined ? { tableNumber: dto.tableNumber } : {}),
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
      },
      select: TABLE_FIELDS,
    });
  }

  /** Soft delete — session history hangs off this row. */
  async remove(restaurantId: string, tableId: string) {
    await this.assertTable(restaurantId, tableId);

    const open = await this.prisma.tableSession.count({
      where: { restaurantId, tableId, status: 'OPEN' },
    });
    if (open > 0) throw new BadRequestException('Close the open session before removing the table');

    await this.prisma.$transaction([
      this.prisma.tableWaiterAssignment.updateMany({
        where: { restaurantId, tableId, unassignedAt: null },
        data: { unassignedAt: new Date() },
      }),
      this.prisma.restaurantTable.update({ where: { id: tableId }, data: { isActive: false } }),
    ]);

    return { id: tableId, deleted: true };
  }

  /* --- assignments ------------------------------------------------------- */

  /** Query 21 — close the old row and open a new one, together or not at all. */
  async assign(restaurantId: string, tableId: string, dto: AssignWaiterDto) {
    await this.assertTable(restaurantId, tableId);

    const waiter = await this.prisma.restaurantUser.findFirst({
      where: {
        restaurantId,
        userId: dto.waiterUserId,
        role: 'WAITER',
        isActive: true,
        user: { isActive: true },
      },
      select: { userId: true, user: { select: { name: true } } },
    });
    if (!waiter) throw new NotFoundException('Active waiter');

    const previous = await this.prisma.tableWaiterAssignment.findFirst({
      where: { restaurantId, tableId, unassignedAt: null },
      select: { id: true, waiterUserId: true },
    });

    const assignment = await this.prisma.$transaction(async (tx) => {
      if (previous) {
        await tx.tableWaiterAssignment.updateMany({
          where: { id: previous.id, unassignedAt: null },
          data: { unassignedAt: new Date() },
        });
      }
      return tx.tableWaiterAssignment.create({
        data: { restaurantId, tableId, waiterUserId: dto.waiterUserId },
        select: { id: true, tableId: true, waiterUserId: true, assignedAt: true },
      });
    });

    this.realtime.tableAssigned(restaurantId, {
      tableId,
      waiterId: dto.waiterUserId,
      previousWaiterId: previous?.waiterUserId ?? null,
    });

    return { ...assignment, waiterName: waiter.user.name };
  }

  async unassign(restaurantId: string, tableId: string) {
    await this.assertTable(restaurantId, tableId);

    const current = await this.prisma.tableWaiterAssignment.findFirst({
      where: { restaurantId, tableId, unassignedAt: null },
      select: { id: true, waiterUserId: true },
    });
    if (!current) throw new NotFoundException('Active assignment');

    await this.prisma.tableWaiterAssignment.updateMany({
      where: { id: current.id, unassignedAt: null },
      data: { unassignedAt: new Date() },
    });

    this.realtime.tableAssigned(restaurantId, {
      tableId,
      waiterId: current.waiterUserId,
      previousWaiterId: current.waiterUserId,
    });

    return { tableId, unassigned: true };
  }

  /** Query 22 — "who was serving Table 5 last Friday?" */
  async assignmentHistory(restaurantId: string, tableId: string) {
    await this.assertTable(restaurantId, tableId);
    const rows = await this.prisma.tableWaiterAssignment.findMany({
      where: { restaurantId, tableId },
      orderBy: { assignedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        assignedAt: true,
        unassignedAt: true,
        waiter: { select: { id: true, name: true } },
      },
    });
    return rows.map(({ waiter, ...r }) => ({
      ...r,
      waiterId: waiter.id,
      waiterName: waiter.name,
    }));
  }

  private async assertTable(restaurantId: string, tableId: string) {
    const found = await this.prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Table');
    return found;
  }
}

const TABLE_FIELDS = {
  id: true,
  tableNumber: true,
  label: true,
  capacity: true,
  status: true,
  isActive: true,
} as const;
