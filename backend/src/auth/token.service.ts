import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import {
  InvalidCredentialsException,
  TokenExpiredException,
  TokenReusedException,
} from '../common/exceptions/domain.exception';
import type { AppConfig } from '../config/configuration';
import type { AccessTokenPayload, AuthUser, RefreshTokenPayload } from '../types/auth-user';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

interface PreparedRefresh {
  id: string;
  familyId: string;
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Rotating refresh tokens with reuse detection — database/CLAUDE.md queries 3a–3g.
 *
 * The refresh JWT carries `jti` (the refresh_tokens row id) because Argon2 salts
 * every hash, so `WHERE token_hash = …` can never match. You find the row by
 * `jti`, then verify that one row.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Login — starts a brand-new token family. */
  async issuePair(user: AuthUser, meta: ClientMeta): Promise<TokenPair> {
    const refresh = await this.prepareRefresh(user, randomUUID());
    await this.prisma.refreshToken.create({ data: this.rowFor(user, refresh, meta) });
    return this.pair(user, refresh);
  }

  /**
   * Rotate. Both writes run in one transaction and the revoke carries the
   * `revokedAt: null` guard, so two parallel refreshes cannot both win.
   *
   * The Argon2 hash is computed *before* the transaction opens — never await
   * anything slow between BEGIN and COMMIT.
   */
  async rotate(presented: string, meta: ClientMeta): Promise<TokenPair & { user: AuthUser }> {
    const claims = this.verifyRefresh(presented);

    const row = await this.prisma.refreshToken.findFirst({
      where: { id: claims.jti, userId: claims.sub },
    });
    if (!row) throw new TokenExpiredException();

    const matches = await this.passwords.verify(row.tokenHash, presented);
    if (!matches) throw new TokenExpiredException();

    if (row.revokedAt) {
      // Replay of an already-rotated token: the lineage is compromised.
      await this.revokeFamily(row.familyId, 'REUSE_DETECTED');
      throw new TokenReusedException();
    }

    if (row.expiresAt.getTime() <= Date.now()) throw new TokenExpiredException();

    const user = await this.loadUser(claims.sub, claims.rid);
    const refresh = await this.prepareRefresh(user, row.familyId);

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.create({ data: this.rowFor(user, refresh, meta) });

      const { count } = await tx.refreshToken.updateMany({
        where: { id: row.id, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokedReason: 'ROTATED',
          replacedById: refresh.id,
        },
      });
      if (count === 0) throw new TokenExpiredException(); // lost the race → rollback
    });

    return { ...this.pair(user, refresh), user };
  }

  async revokeFamily(familyId: string, reason: 'LOGOUT' | 'REUSE_DETECTED'): Promise<number> {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return count;
  }

  async revokeAllForUser(userId: string, reason: 'LOGOUT' = 'LOGOUT'): Promise<number> {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return count;
  }

  /** Nightly housekeeping — query 3g. Revoked rows are kept a while on purpose. */
  async cleanupExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    return count;
  }

  verifyRefresh(token: string): RefreshTokenPayload {
    try {
      return this.jwt.verify<RefreshTokenPayload>(token, {
        secret: this.config.get('jwt.refreshSecret', { infer: true }),
      });
    } catch {
      throw new TokenExpiredException();
    }
  }

  signAccess(user: AuthUser): string {
    const payload: AccessTokenPayload = {
      sub: user.userId,
      rid: user.restaurantId,
      role: user.role,
      email: user.email,
      name: user.name,
    };
    return this.jwt.sign(payload, {
      secret: this.config.get('jwt.accessSecret', { infer: true }),
      expiresIn: this.config.get('jwt.accessTtl', { infer: true }),
    });
  }

  /* ------------------------------------------------------------------ */

  private async prepareRefresh(user: AuthUser, familyId: string): Promise<PreparedRefresh> {
    const id = randomUUID();
    const payload: RefreshTokenPayload = {
      sub: user.userId,
      jti: id,
      fid: familyId,
      rid: user.restaurantId,
    };
    const token = this.jwt.sign(payload, {
      secret: this.config.get('jwt.refreshSecret', { infer: true }),
      expiresIn: this.config.get('jwt.refreshTtl', { infer: true }),
    });

    const decoded = this.jwt.decode<{ exp: number }>(token);
    return {
      id,
      familyId,
      token,
      tokenHash: await this.passwords.hash(token),
      expiresAt: new Date(decoded.exp * 1000),
    };
  }

  private rowFor(user: AuthUser, refresh: PreparedRefresh, meta: ClientMeta) {
    return {
      id: refresh.id,
      userId: user.userId,
      familyId: refresh.familyId,
      tokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt,
      userAgent: meta.userAgent?.slice(0, 400) ?? null,
      ip: meta.ip ?? null,
    };
  }

  private pair(user: AuthUser, refresh: PreparedRefresh): TokenPair {
    return {
      accessToken: this.signAccess(user),
      refreshToken: refresh.token,
      expiresAt: refresh.expiresAt.toISOString(),
    };
  }

  /** Re-reads role and status on every rotation: a deactivated staff member cannot refresh. */
  private async loadUser(userId: string, restaurantId: string): Promise<AuthUser> {
    const membership = await this.prisma.restaurantUser.findFirst({
      where: {
        userId,
        restaurantId,
        isActive: true,
        user: { isActive: true },
        restaurant: { isActive: true },
      },
      select: {
        role: true,
        restaurantId: true,
        user: { select: { id: true, email: true, name: true } },
      },
    });
    if (!membership) throw new InvalidCredentialsException();

    return {
      userId: membership.user.id,
      restaurantId: membership.restaurantId,
      role: membership.role,
      email: membership.user.email,
      name: membership.user.name,
    };
  }
}
