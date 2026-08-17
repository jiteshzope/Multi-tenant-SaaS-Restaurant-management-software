import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/** Stamps a requestId on every request and logs method, path, status, duration, user. */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();

    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();

    req.requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    res.setHeader('x-request-id', req.requestId);

    const started = Date.now();
    return next.handle().pipe(
      tap({
        next: () => this.write(req, res.statusCode, started),
        error: () => this.write(req, res.statusCode, started),
      }),
    );
  }

  private write(req: Request, status: number, started: number): void {
    const user = req.user;
    const who = user ? `${user.role}:${user.userId.slice(0, 8)}` : 'anon';
    this.logger.log(
      `${req.method} ${req.originalUrl} ${status} ${Date.now() - started}ms ${who} rid=${req.requestId?.slice(0, 8)}`,
    );
  }
}
