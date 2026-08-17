import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { ClientMeta, TokenService } from './token.service';
import {
  EmailTakenException,
  InvalidCredentialsException,
  NotTenantMemberException,
} from '../common/exceptions/domain.exception';
import { constraintTouches } from '../common/prisma-error';
import type { AuthUser } from '../types/auth-user';
import type {
  ChangePasswordDto,
  LoginDto,
  RegisterRestaurantDto,
} from './dto/auth.dto';

/** Owner first, then kitchen, then waiter — the membership a multi-tenant login lands on. */
const ROLE_PRIORITY = { OWNER: 0, KITCHEN: 1, WAITER: 2 } as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  /** Restaurant + owner user + OWNER membership, all or nothing. */
  async registerRestaurant(dto: RegisterRestaurantDto, meta: ClientMeta) {
    const passwordHash = await this.passwords.hash(dto.ownerPassword);

    const created = await this.prisma
      .$transaction(async (tx) => {
        const restaurant = await tx.restaurant.create({
          data: { name: dto.restaurantName, slug: dto.slug, phone: dto.phone ?? null },
          select: { id: true, name: true, slug: true },
        });

        const user = await tx.user.create({
          data: { name: dto.ownerName, email: dto.ownerEmail, passwordHash },
          select: { id: true, name: true, email: true },
        });

        await tx.restaurantUser.create({
          data: { restaurantId: restaurant.id, userId: user.id, role: 'OWNER' },
        });

        return { restaurant, user };
      })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          if (constraintTouches(e, 'email')) throw new EmailTakenException();
        }
        throw e;
      });

    const authUser: AuthUser = {
      userId: created.user.id,
      restaurantId: created.restaurant.id,
      role: 'OWNER',
      email: created.user.email,
      name: created.user.name,
    };

    const pair = await this.tokens.issuePair(authUser, meta);
    return { ...pair, user: await this.me(authUser) };
  }

  async login(dto: LoginDto, meta: ClientMeta) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        isActive: true,
        memberships: {
          where: { isActive: true, restaurant: { isActive: true } },
          select: { role: true, restaurantId: true },
        },
      },
    });

    // Always spend the same time, so a wrong email and a wrong password are
    // indistinguishable from the outside.
    if (!user) {
      await this.passwords.burnTime(dto.password);
      throw new InvalidCredentialsException();
    }

    const ok = await this.passwords.verify(user.passwordHash, dto.password);
    if (!ok || !user.isActive) throw new InvalidCredentialsException();
    if (user.memberships.length === 0) throw new NotTenantMemberException();

    const membership = [...user.memberships].sort(
      (a, b) => ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role],
    )[0];

    const authUser: AuthUser = {
      userId: user.id,
      restaurantId: membership.restaurantId,
      role: membership.role,
      email: user.email,
      name: user.name,
    };

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const pair = await this.tokens.issuePair(authUser, meta);
    return { ...pair, user: await this.me(authUser) };
  }

  async refresh(refreshToken: string, meta: ClientMeta) {
    const { user, ...pair } = await this.tokens.rotate(refreshToken, meta);
    return { ...pair, user: await this.me(user) };
  }

  async logout(user: AuthUser, refreshToken?: string): Promise<{ revoked: number }> {
    if (refreshToken) {
      try {
        const claims = this.tokens.verifyRefresh(refreshToken);
        if (claims.sub === user.userId) {
          return { revoked: await this.tokens.revokeFamily(claims.fid, 'LOGOUT') };
        }
      } catch {
        /* an unparseable token still logs the caller out everywhere, below */
      }
    }
    return { revoked: await this.tokens.revokeAllForUser(user.userId) };
  }

  /** `GET /auth/me` — user + restaurant + role, never the password hash. */
  async me(user: AuthUser) {
    const membership = await this.prisma.restaurantUser.findFirst({
      where: { userId: user.userId, restaurantId: user.restaurantId, isActive: true },
      select: {
        role: true,
        user: { select: { id: true, name: true, email: true, phone: true, lastLoginAt: true } },
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            phone: true,
            address: true,
            currency: true,
            timezone: true,
            taxPercent: true,
          },
        },
      },
    });
    if (!membership) throw new NotTenantMemberException();

    return {
      user: membership.user,
      restaurant: membership.restaurant,
      role: membership.role,
    };
  }

  /** Changing your own password revokes every session, everywhere. */
  async changePassword(user: AuthUser, dto: ChangePasswordDto) {
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.userId },
      select: { passwordHash: true },
    });

    const ok = await this.passwords.verify(row.passwordHash, dto.currentPassword);
    if (!ok) throw new InvalidCredentialsException();

    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.prisma.user.update({ where: { id: user.userId }, data: { passwordHash } });
    await this.tokens.revokeAllForUser(user.userId);

    return { changed: true };
  }
}
