import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { ErrorCode, type ErrorCodeValue } from '../exceptions/domain.exception';

interface ErrorBody {
  error: { code: ErrorCodeValue; message: string; details?: unknown };
  requestId: string;
}

/**
 * Coerce an unknown `message` out of an exception payload into something a
 * human can read.
 *
 * `String(value)` is not good enough: the payload is `unknown`, and an object
 * stringifies to the literal text `[object Object]`, which is what the client
 * would then display. Anything that is not a string or an array of strings
 * falls back to the exception's own message instead.
 */
function messageOf(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return value.join(', ');
  }
  return fallback;
}

/**
 * The single exit point for every failure. Produces the uniform body the
 * frontend's axios error interceptor parses:
 *
 *   { error: { code, message, details? }, requestId }
 *
 * Prisma error codes are mapped here too (P2002 → 409 DUPLICATE, …) along with
 * the raw SQLSTATEs that reach us from $queryRaw (23505, 23503, 23514, 22P02).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;

    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();

    const { status, body } = this.translate(exception);
    body.requestId = req.requestId ?? '';

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${req.method} ${req.originalUrl} → ${status} ${body.error.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json(body);
  }

  /**
   * `status` is `HttpStatus` rather than `number` throughout. These really are
   * HTTP statuses, and saying so is what lets every comparison below read as
   * `HttpStatus.NOT_FOUND` instead of a bare 404 — a plain `number` compared
   * against an enum member is the kind of thing that silently stops matching.
   */
  private translate(exception: unknown): { status: HttpStatus; body: ErrorBody } {
    /* --- our own DomainException and every other HttpException --- */
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'object' && payload !== null) {
        const p = payload as Record<string, unknown>;

        // DomainException: { code, message, details }
        if (typeof p.code === 'string') {
          return {
            status,
            body: {
              error: {
                code: p.code as ErrorCodeValue,
                message: messageOf(p.message, exception.message),
                ...(p.details !== undefined && p.details !== null
                  ? { details: p.details }
                  : {}),
              },
              requestId: '',
            },
          };
        }

        // ValidationPipe: { message: string[], error, statusCode }
        if (Array.isArray(p.message)) {
          return {
            status,
            body: {
              error: {
                code: ErrorCode.VALIDATION_FAILED,
                message: 'Validation failed',
                details: p.message,
              },
              requestId: '',
            },
          };
        }

        return {
          status,
          body: {
            error: {
              code: codeForStatus(status),
              message: messageOf(p.message, exception.message),
            },
            requestId: '',
          },
        };
      }

      return {
        status,
        body: {
          error: { code: codeForStatus(status), message: messageOf(payload, exception.message) },
          requestId: '',
        },
      };
    }

    /* --- Prisma --- */
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return prismaError(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          error: { code: ErrorCode.VALIDATION_FAILED, message: 'Malformed query payload' },
          requestId: '',
        },
      };
    }

    /* --- raw SQLSTATE bubbling out of $queryRaw --- */
    const sqlstate = (exception as { code?: string } | null)?.code;
    if (typeof sqlstate === 'string' && SQLSTATE_MAP[sqlstate]) {
      const mapped = SQLSTATE_MAP[sqlstate];
      return {
        status: mapped.status,
        body: { error: { code: mapped.code, message: mapped.message }, requestId: '' },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: { code: ErrorCode.INTERNAL, message: 'Something went wrong' },
        requestId: '',
      },
    };
  }
}

const SQLSTATE_MAP: Record<
  string,
  { status: HttpStatus; code: ErrorCodeValue; message: string }
> = {
  '23505': {
    status: HttpStatus.CONFLICT,
    code: ErrorCode.DUPLICATE,
    message: 'That value already exists',
  },
  '23503': {
    status: HttpStatus.BAD_REQUEST,
    code: ErrorCode.INVALID_REFERENCE,
    message: 'Referenced record does not exist in this restaurant',
  },
  '23514': {
    status: HttpStatus.BAD_REQUEST,
    code: ErrorCode.VALIDATION_FAILED,
    message: 'A value violates a database constraint',
  },
  '22P02': {
    status: HttpStatus.BAD_REQUEST,
    code: ErrorCode.VALIDATION_FAILED,
    message: 'Malformed identifier',
  },
};

function prismaError(e: Prisma.PrismaClientKnownRequestError): {
  status: HttpStatus;
  body: ErrorBody;
} {
  const target = (e.meta?.target as string[] | string | undefined) ?? undefined;

  switch (e.code) {
    case 'P2002':
      return {
        status: HttpStatus.CONFLICT,
        body: {
          error: {
            code: ErrorCode.DUPLICATE,
            message: 'That value already exists',
            ...(target ? { details: { target } } : {}),
          },
          requestId: '',
        },
      };
    case 'P2003':
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          error: {
            code: ErrorCode.INVALID_REFERENCE,
            message: 'Referenced record does not exist in this restaurant',
          },
          requestId: '',
        },
      };
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        body: { error: { code: ErrorCode.NOT_FOUND, message: 'Not found' }, requestId: '' },
      };
    case 'P2000':
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          error: { code: ErrorCode.VALIDATION_FAILED, message: 'Value too long for column' },
          requestId: '',
        },
      };
    default:
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        body: {
          error: { code: ErrorCode.INTERNAL, message: 'Database error' },
          requestId: '',
        },
      };
  }
}

function codeForStatus(status: HttpStatus): ErrorCodeValue {
  if (status === HttpStatus.NOT_FOUND) return ErrorCode.NOT_FOUND;
  if (status === HttpStatus.CONFLICT) return ErrorCode.DUPLICATE;
  if (status === HttpStatus.FORBIDDEN) return ErrorCode.FORBIDDEN_ROLE;
  if (status === HttpStatus.UNAUTHORIZED) return ErrorCode.TOKEN_EXPIRED;
  if (status === HttpStatus.BAD_REQUEST) return ErrorCode.VALIDATION_FAILED;
  return ErrorCode.INTERNAL;
}
