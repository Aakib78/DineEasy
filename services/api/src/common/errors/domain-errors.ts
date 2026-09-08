/**
 * Domain-level errors. Handlers/services throw these; they know nothing about HTTP.
 * `DomainExceptionFilter` (../filters/domain-exception.filter.ts) maps each to a status
 * code and a consistent JSON error shape (see docs/api.md §Errors). This keeps HTTP
 * concerns out of the domain/service layer per spec §31.
 */

export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundDomainError extends DomainError {
  readonly code = 'NotFound';
  readonly httpStatus = 404;

  constructor(entity: string, id: string) {
    super(`${entity} ${id} not found`);
  }
}

export class ForbiddenDomainError extends DomainError {
  readonly code = 'Forbidden';
  readonly httpStatus = 403;

  constructor(message = 'You do not have permission to perform this action') {
    super(message);
  }
}

export class ValidationDomainError extends DomainError {
  readonly code = 'ValidationError';
  readonly httpStatus = 400;
}

export class ConflictDomainError extends DomainError {
  readonly code = 'Conflict';
  readonly httpStatus = 409;
}

/** Thrown by the order state machine on an illegal transition. See docs/architecture.md §5. */
export class InvalidOrderTransitionError extends DomainError {
  readonly code = 'InvalidOrderTransition';
  readonly httpStatus = 409;

  constructor(from: string, to: string) {
    super(`Cannot move order from ${from} to ${to}`);
  }
}

export class UnauthenticatedDomainError extends DomainError {
  readonly code = 'Unauthenticated';
  readonly httpStatus = 401;

  constructor(message = 'Invalid credentials or session') {
    super(message);
  }
}
