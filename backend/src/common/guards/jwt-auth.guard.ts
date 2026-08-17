import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators';
import { TokenExpiredException } from '../exceptions/domain.exception';

/**
 * Registered globally via APP_GUARD — endpoints are private by default and opt
 * out with `@Public()`. Nothing downstream ever reads a tenant id or a role
 * from anywhere but `request.user`, which only this guard populates.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(ctx: ExecutionContext) {
    if (ctx.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    return super.canActivate(ctx);
  }

  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) throw new TokenExpiredException();
    return user;
  }
}
