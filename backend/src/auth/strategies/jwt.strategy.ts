import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AppConfig } from '../../config/configuration';
import type { AccessTokenPayload, AuthUser } from '../../types/auth-user';

/**
 * Turns a verified access token into the `AuthUser` every guard, controller and
 * service downstream reads. `rid` and `role` come from here and nowhere else.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<AppConfig, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('jwt.accessSecret', { infer: true }),
    });
  }

  validate(payload: AccessTokenPayload): AuthUser {
    return {
      userId: payload.sub,
      restaurantId: payload.rid,
      role: payload.role,
      email: payload.email,
      name: payload.name,
    };
  }
}
