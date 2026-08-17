import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { Observable, map } from 'rxjs';

/**
 * Wraps every successful response as `{ data, requestId }` and serializes the two
 * JSON-hostile types Prisma hands back:
 *
 *   Prisma.Decimal → string   ("250.00" — never Number, or paise are lost)
 *   bigint         → number   (COUNT(*) from $queryRaw)
 *
 * The frontend's axios client unwraps `.data` in exactly one place, so no screen
 * ever knows this envelope exists.
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();

    const req = ctx.switchToHttp().getRequest<Request>();
    return next.handle().pipe(
      map((data: unknown) => ({ data: serialize(data), requestId: req.requestId ?? '' })),
    );
  }
}

export function serialize(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'bigint') return Number(value);
  if (Prisma.Decimal.isDecimal(value)) return value.toFixed(2);
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');

  if (Array.isArray(value)) return value.map(serialize);

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serialize(v);
    }
    return out;
  }

  return value;
}
