import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { TableNotAssignedException } from '../exceptions/domain.exception';

/**
 * A WAITER may only touch tables actively assigned to them. OWNER and KITCHEN
 * bypass it — the role checks on those routes already limit who gets here.
 *
 * Reads the table id from `params.tableId`, `params.id` or `body.tableId`,
 * whichever the route uses.
 */
@Injectable()
export class TableAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const user = req.user;
    if (!user || user.role !== 'WAITER') return true;

    const params = req.params as Record<string, string | undefined>;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const tableId =
      params.tableId ?? params.id ?? (typeof body.tableId === 'string' ? body.tableId : undefined);
    if (!tableId) return true;

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
    return true;
  }
}
