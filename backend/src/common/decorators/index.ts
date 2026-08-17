import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole } from '@prisma/client';
import type { AuthUser } from '../../types/auth-user';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Opt an endpoint out of the global JwtAuthGuard. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restrict an endpoint to the listed roles. Enforced by the global RolesGuard. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** The verified user, straight from the access token. */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const user = req.user as AuthUser;
    return field ? user?.[field] : user;
  },
);

/**
 * The tenant id — always from the verified token, never from body/query/header.
 * This is the single most important rule in the codebase.
 */
export const RestaurantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return (req.user as AuthUser).restaurantId;
});
