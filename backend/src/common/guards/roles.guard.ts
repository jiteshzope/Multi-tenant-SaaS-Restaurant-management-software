import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators';
import { ForbiddenRoleException } from '../exceptions/domain.exception';

/**
 * Global companion to JwtAuthGuard. The role is read from the verified access
 * token only — never from a header, body or query string.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = ctx.switchToHttp().getRequest<Request>().user;
    if (!user || !required.includes(user.role)) throw new ForbiddenRoleException(required ?? []);

    return true;
  }
}
