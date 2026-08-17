import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../../auth/password.service';
import { TokenService } from '../../auth/token.service';
import { constraintTouches } from '../../common/prisma-error';
import {
  EmailTakenException,
  ForbiddenRoleException,
  KitchenExistsException,
  NotFoundException,
} from '../../common/exceptions/domain.exception';
import type {
  CreateStaffDto,
  ResetStaffPasswordDto,
  UpdateStaffDto,
  UpdateStaffStatusDto,
} from './dto/staff.dto';

/** Every method takes restaurantId first — the tenancy rule, made structural. */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  /** Query 5 — owner first, then kitchen, then waiters by name. */
  async list(restaurantId: string) {
    const rows = await this.prisma.restaurantUser.findMany({
      where: { restaurantId },
      select: {
        id: true,
        role: true,
        isActive: true,
        createdAt: true,
        user: {
          select: { id: true, name: true, email: true, phone: true, lastLoginAt: true },
        },
      },
    });

    const priority = { OWNER: 0, KITCHEN: 1, WAITER: 2 } as const;
    return rows
      .map((r) => ({
        membershipId: r.id,
        userId: r.user.id,
        name: r.user.name,
        email: r.user.email,
        phone: r.user.phone,
        role: r.role,
        isActive: r.isActive,
        lastLoginAt: r.user.lastLoginAt,
        createdAt: r.createdAt,
      }))
      .sort(
        (a, b) => priority[a.role] - priority[b.role] || a.name.localeCompare(b.name),
      );
  }

  async waiters(restaurantId: string) {
    const rows = await this.prisma.restaurantUser.findMany({
      where: { restaurantId, role: 'WAITER', isActive: true },
      select: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: 'asc' } },
    });
    return rows.map((r) => r.user);
  }

  /**
   * User + membership in one transaction — query 4. A user row with no
   * membership row is orphaned garbage.
   *
   * A taken email is rejected with 409 EMAIL_TAKEN rather than silently
   * attaching the existing account to this restaurant: letting an owner claim
   * an arbitrary existing login would be an account-takeover vector.
   */
  async create(restaurantId: string, dto: CreateStaffDto, createdBy: string) {
    const passwordHash = await this.passwords.hash(dto.password);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: dto.name,
            email: dto.email,
            phone: dto.phone ?? null,
            passwordHash,
          },
          select: { id: true, name: true, email: true, phone: true },
        });

        const membership = await tx.restaurantUser.create({
          data: { restaurantId, userId: user.id, role: dto.role, createdBy },
          select: { id: true, role: true, isActive: true, createdAt: true },
        });

        return {
          membershipId: membership.id,
          userId: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: membership.role,
          isActive: membership.isActive,
          lastLoginAt: null,
          createdAt: membership.createdAt,
        };
      });
    } catch (e) {
      throw translateStaffConflict(e, dto.role);
    }
  }

  async update(restaurantId: string, userId: string, dto: UpdateStaffDto) {
    await this.assertMember(restaurantId, userId);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      },
      select: { id: true, name: true, email: true, phone: true },
    });
    return user;
  }

  /** Owner resets a staff password — and every session that staff member holds dies. */
  async resetPassword(restaurantId: string, userId: string, dto: ResetStaffPasswordDto) {
    const membership = await this.assertMember(restaurantId, userId);
    if (membership.role === 'OWNER') {
      throw new ForbiddenRoleException(['use PATCH /auth/me/password for the owner account']);
    }

    const passwordHash = await this.passwords.hash(dto.password);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.tokens.revokeAllForUser(userId);
    return { changed: true };
  }

  /** Soft delete only — query 6. Deleting a user would orphan order history. */
  async setStatus(restaurantId: string, userId: string, dto: UpdateStaffStatusDto) {
    const membership = await this.assertMember(restaurantId, userId);
    if (membership.role === 'OWNER') {
      throw new ForbiddenRoleException(['the owner cannot be deactivated']);
    }

    try {
      const updated = await this.prisma.restaurantUser.update({
        where: { id: membership.id },
        data: { isActive: dto.isActive },
        select: { id: true, isActive: true, role: true, userId: true },
      });

      if (!dto.isActive) {
        // Free the tables they were serving and end their sessions.
        await this.prisma.tableWaiterAssignment.updateMany({
          where: { restaurantId, waiterUserId: userId, unassignedAt: null },
          data: { unassignedAt: new Date() },
        });
        await this.tokens.revokeAllForUser(userId);
      }

      return updated;
    } catch (e) {
      throw translateStaffConflict(e, membership.role);
    }
  }

  private async assertMember(restaurantId: string, userId: string) {
    const membership = await this.prisma.restaurantUser.findFirst({
      where: { restaurantId, userId },
      select: { id: true, role: true },
    });
    if (!membership) throw new NotFoundException('Staff member');
    return membership;
  }
}

function translateStaffConflict(e: unknown, role: string): unknown {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    if (constraintTouches(e, 'email')) return new EmailTakenException();
    // The partial unique index uq_one_active_kitchen_per_restaurant fired.
    if (role === 'KITCHEN' || constraintTouches(e, 'kitchen')) return new KitchenExistsException();
  }
  // Raw SQLSTATE from the partial unique index (Prisma reports these as P2002 too,
  // but a raw 23505 can surface when the index name is unknown to the client).
  const code = (e as { code?: string } | null)?.code;
  if (code === '23505' && role === 'KITCHEN') return new KitchenExistsException();
  return e;
}
