/** The backend's TransformInterceptor envelope. Unwrapped once, in api/client.ts. */
export type ApiResponse<T> = { data: T; requestId: string };

export type ApiErrorBody = {
  error: { code: ErrorCode; message: string; details?: unknown };
  requestId: string;
};

/** Mirrors backend/CLAUDE.md → "Domain error codes". */
export type ErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REUSED'
  | 'FORBIDDEN_ROLE'
  | 'NOT_TENANT_MEMBER'
  | 'EMAIL_TAKEN'
  | 'KITCHEN_EXISTS'
  | 'TABLE_NOT_ASSIGNED'
  | 'SESSION_NOT_OPEN'
  | 'ORDER_ALREADY_MOVED'
  | 'ITEM_UNAVAILABLE'
  | 'ORDERS_IN_PROGRESS'
  | 'CATEGORY_NOT_EMPTY'
  | 'DUPLICATE'
  | 'INVALID_REFERENCE'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'INTERNAL'
  | 'NETWORK';

/** Every failure reaches a screen in this shape — no `err.response?.data?.…` anywhere. */
export class ApiError extends Error {
  // Written out rather than declared as constructor parameter properties:
  // `erasableSyntaxOnly` (the type-stripping build) does not allow those.
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static isApiError(e: unknown): e is ApiError {
    return e instanceof ApiError;
  }
}
