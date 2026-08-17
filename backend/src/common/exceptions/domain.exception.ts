import { HttpException, HttpStatus } from '@nestjs/common';

/** Stable, client-facing error codes. Mirrored by the frontend's ErrorCode union. */
export const ErrorCode = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REUSED: 'TOKEN_REUSED',
  FORBIDDEN_ROLE: 'FORBIDDEN_ROLE',
  NOT_TENANT_MEMBER: 'NOT_TENANT_MEMBER',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  KITCHEN_EXISTS: 'KITCHEN_EXISTS',
  TABLE_NOT_ASSIGNED: 'TABLE_NOT_ASSIGNED',
  SESSION_NOT_OPEN: 'SESSION_NOT_OPEN',
  ORDER_ALREADY_MOVED: 'ORDER_ALREADY_MOVED',
  ITEM_UNAVAILABLE: 'ITEM_UNAVAILABLE',
  ORDERS_IN_PROGRESS: 'ORDERS_IN_PROGRESS',
  CATEGORY_NOT_EMPTY: 'CATEGORY_NOT_EMPTY',
  DUPLICATE: 'DUPLICATE',
  INVALID_REFERENCE: 'INVALID_REFERENCE',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export class DomainException extends HttpException {
  constructor(
    readonly code: ErrorCodeValue,
    message: string,
    status: HttpStatus,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

/* --- the concrete ones, so services read like the business rule they encode --- */

export class InvalidCredentialsException extends DomainException {
  constructor() {
    super(ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password', HttpStatus.UNAUTHORIZED);
  }
}

export class TokenReusedException extends DomainException {
  constructor() {
    super(
      ErrorCode.TOKEN_REUSED,
      'Refresh token replay detected — all sessions revoked. Please log in again.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class TokenExpiredException extends DomainException {
  constructor() {
    super(ErrorCode.TOKEN_EXPIRED, 'Session expired. Please log in again.', HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenRoleException extends DomainException {
  constructor(required: readonly string[]) {
    super(
      ErrorCode.FORBIDDEN_ROLE,
      `This action requires one of: ${required.join(', ')}`,
      HttpStatus.FORBIDDEN,
    );
  }
}

export class NotTenantMemberException extends DomainException {
  constructor() {
    super(
      ErrorCode.NOT_TENANT_MEMBER,
      'You are not an active member of this restaurant',
      HttpStatus.FORBIDDEN,
    );
  }
}

export class EmailTakenException extends DomainException {
  constructor() {
    super(ErrorCode.EMAIL_TAKEN, 'That email address is already registered', HttpStatus.CONFLICT);
  }
}

export class KitchenExistsException extends DomainException {
  constructor() {
    super(
      ErrorCode.KITCHEN_EXISTS,
      'This restaurant already has an active kitchen handler',
      HttpStatus.CONFLICT,
    );
  }
}

export class TableNotAssignedException extends DomainException {
  constructor() {
    super(ErrorCode.TABLE_NOT_ASSIGNED, 'This table is not assigned to you', HttpStatus.FORBIDDEN);
  }
}

export class SessionNotOpenException extends DomainException {
  constructor() {
    super(ErrorCode.SESSION_NOT_OPEN, 'This table session is not open', HttpStatus.CONFLICT);
  }
}

export class OrderAlreadyMovedException extends DomainException {
  constructor() {
    super(ErrorCode.ORDER_ALREADY_MOVED, 'Someone already moved this order', HttpStatus.CONFLICT);
  }
}

export class ItemUnavailableException extends DomainException {
  constructor(details?: unknown) {
    super(
      ErrorCode.ITEM_UNAVAILABLE,
      'One or more items are unavailable and were not ordered',
      HttpStatus.BAD_REQUEST,
      details,
    );
  }
}

export class OrdersInProgressException extends DomainException {
  constructor(details?: unknown) {
    super(
      ErrorCode.ORDERS_IN_PROGRESS,
      'Orders are still in the kitchen — the table cannot be closed yet',
      HttpStatus.CONFLICT,
      details,
    );
  }
}

export class CategoryNotEmptyException extends DomainException {
  constructor() {
    super(
      ErrorCode.CATEGORY_NOT_EMPTY,
      'Move or delete this category’s items first',
      HttpStatus.CONFLICT,
    );
  }
}

export class NotFoundException extends DomainException {
  constructor(what = 'Resource') {
    super(ErrorCode.NOT_FOUND, `${what} not found`, HttpStatus.NOT_FOUND);
  }
}
