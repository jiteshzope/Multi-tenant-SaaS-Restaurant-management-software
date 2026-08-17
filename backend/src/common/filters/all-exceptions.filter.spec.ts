import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';
import {
  ItemUnavailableException,
  OrderAlreadyMovedException,
} from '../exceptions/domain.exception';

interface Captured {
  status: number;
  body: { error: { code: string; message: string; details?: unknown }; requestId: string };
}

function run(exception: unknown): Captured {
  const captured = {} as Captured;
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: Captured['body']) {
      captured.body = body;
    },
  };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({ method: 'GET', originalUrl: '/api/x', requestId: 'req-1' }),
    }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, host);
  return captured;
}

describe('AllExceptionsFilter', () => {
  it('renders a DomainException as { error: { code, message } }', () => {
    const out = run(new OrderAlreadyMovedException());
    expect(out.status).toBe(HttpStatus.CONFLICT);
    expect(out.body.error.code).toBe('ORDER_ALREADY_MOVED');
    expect(out.body.requestId).toBe('req-1');
  });

  it('carries `details` through so the UI can mark the offending lines', () => {
    const out = run(new ItemUnavailableException({ menuItemIds: ['abc'] }));
    expect(out.status).toBe(HttpStatus.BAD_REQUEST);
    expect(out.body.error.details).toEqual({ menuItemIds: ['abc'] });
  });

  it('maps Prisma P2002 to 409 DUPLICATE', () => {
    const out = run(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '6',
        meta: { target: ['email'] },
      }),
    );
    expect(out.status).toBe(HttpStatus.CONFLICT);
    expect(out.body.error.code).toBe('DUPLICATE');
  });

  it('maps Prisma P2025 to 404 NOT_FOUND', () => {
    const out = run(
      new Prisma.PrismaClientKnownRequestError('missing', { code: 'P2025', clientVersion: '6' }),
    );
    expect(out.status).toBe(HttpStatus.NOT_FOUND);
    expect(out.body.error.code).toBe('NOT_FOUND');
  });

  it('maps a raw 23505 SQLSTATE from $queryRaw to 409', () => {
    const out = run(Object.assign(new Error('duplicate key'), { code: '23505' }));
    expect(out.status).toBe(HttpStatus.CONFLICT);
    expect(out.body.error.code).toBe('DUPLICATE');
  });

  it('never leaks an unknown error’s message', () => {
    const out = run(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    expect(out.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(out.body.error.message).toBe('Something went wrong');
  });

  /**
   * The payload is `unknown`, so a `message` that is not a string used to be
   * stringified into the literal text `[object Object]` and sent to the client
   * as the explanation. It falls back to the exception's own message instead.
   */
  it('does not render a non-string message as "[object Object]"', () => {
    const out = run(new HttpException({ code: 'NOT_FOUND', message: { en: 'Nope' } }, 404));
    expect(out.body.error.code).toBe('NOT_FOUND');
    expect(out.body.error.message).not.toContain('[object Object]');
    expect(out.body.error.message.length).toBeGreaterThan(0);
  });

  it('joins a string[] message rather than stringifying the array', () => {
    const out = run(new HttpException({ code: 'NOT_FOUND', message: ['a', 'b'] }, 404));
    expect(out.body.error.message).toBe('a, b');
  });
});
