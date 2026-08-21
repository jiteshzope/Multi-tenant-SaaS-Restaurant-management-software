import type { UserRole } from '@prisma/client';

/** What every guard, controller and service sees after JwtAuthGuard has run. */
export interface AuthUser {
  /** users.id */
  userId: string;
  /** restaurants.id — read ONLY from the verified access token. */
  restaurantId: string;
  role: UserRole;
  name: string;
  email: string;
}

/** Access-token claims. */
export interface AccessTokenPayload {
  sub: string;
  rid: string;
  role: UserRole;
  email: string;
  name: string;
  iat?: number;
  exp?: number;
}

/** Refresh-token claims — `jti` is the refresh_tokens row id (see database/CLAUDE.md 3b). */
export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  fid: string;
  rid: string;
  iat?: number;
  exp?: number;
}

declare module 'express' {
  interface Request {
    user?: AuthUser;
    requestId?: string;
  }
}
