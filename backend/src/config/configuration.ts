import type { Env } from './env.validation';

/**
 * Typed view over the validated environment. Injected as
 * `ConfigService<AppConfig, true>` so `config.get('jwt.accessSecret')` is typed.
 */
export interface AppConfig {
  nodeEnv: Env['NODE_ENV'];
  port: number;
  corsOrigin: string[];
  swaggerEnabled: boolean;
  logLevel: Env['LOG_LEVEL'];
  jwt: {
    accessSecret: string;
    accessTtl: string;
    refreshSecret: string;
    refreshTtl: string;
  };
  argon2: {
    memoryCost: number;
    timeCost: number;
    parallelism: number;
  };
  throttle: {
    ttl: number;
    limit: number;
  };
}

export default (): AppConfig => {
  const env = process.env as unknown as Env;
  return {
    nodeEnv: (env.NODE_ENV ?? 'development'),
    port: Number(env.PORT ?? 3000),
    corsOrigin: String(env.CORS_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    swaggerEnabled: String(env.SWAGGER_ENABLED ?? 'true') === 'true',
    logLevel: (env.LOG_LEVEL ?? 'log'),
    jwt: {
      accessSecret: String(env.JWT_ACCESS_SECRET),
      accessTtl: String(env.JWT_ACCESS_TTL ?? '15m'),
      refreshSecret: String(env.JWT_REFRESH_SECRET),
      refreshTtl: String(env.JWT_REFRESH_TTL ?? '7d'),
    },
    argon2: {
      memoryCost: Number(env.ARGON2_MEMORY_COST ?? 19456),
      timeCost: Number(env.ARGON2_TIME_COST ?? 2),
      parallelism: Number(env.ARGON2_PARALLELISM ?? 1),
    },
    throttle: {
      ttl: Number(env.THROTTLE_TTL ?? 60),
      limit: Number(env.THROTTLE_LIMIT ?? 120),
    },
  };
};
