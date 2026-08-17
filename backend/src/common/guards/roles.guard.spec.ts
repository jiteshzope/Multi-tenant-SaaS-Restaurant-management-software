import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ForbiddenRoleException } from '../exceptions/domain.exception';
import type { AuthUser } from '../../types/auth-user';

function context(user?: Partial<AuthUser>): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardWith(metadata: Record<string, unknown>) {
  const reflector = {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('lets a matching role through', () => {
    const guard = guardWith({ roles: ['OWNER'] });
    expect(guard.canActivate(context({ role: 'OWNER' }))).toBe(true);
  });

  it('rejects a role that is not listed', () => {
    const guard = guardWith({ roles: ['OWNER'] });
    expect(() => guard.canActivate(context({ role: 'WAITER' }))).toThrow(ForbiddenRoleException);
  });

  it('rejects an unauthenticated request on a role-guarded route', () => {
    const guard = guardWith({ roles: ['KITCHEN'] });
    expect(() => guard.canActivate(context(undefined))).toThrow(ForbiddenRoleException);
  });

  it('allows routes with no @Roles metadata', () => {
    const guard = guardWith({});
    expect(guard.canActivate(context({ role: 'WAITER' }))).toBe(true);
  });

  it('never runs on a @Public() route', () => {
    const guard = guardWith({ isPublic: true, roles: ['OWNER'] });
    expect(guard.canActivate(context(undefined))).toBe(true);
  });
});
