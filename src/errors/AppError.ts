export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, code = 'INVALID_INPUT') {
    super(message, 400, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, code = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

export class InsufficientFundsError extends AppError {
  constructor(message = 'Insufficient funds for this operation', code = 'INSUFFICIENT_FUNDS') {
    super(message, 400, code);
  }
}

export class CurrencyMismatchError extends AppError {
  constructor(message = 'Currency mismatch between transfer accounts', code = 'CURRENCY_MISMATCH') {
    super(message, 400, code);
  }
}

export class IdempotencyConflictError extends AppError {
  constructor(message = 'Idempotency key reused with a different request payload', code = 'IDEMPOTENCY_CONFLICT') {
    super(message, 409, code);
  }
}

export class MissingIdempotencyKeyError extends AppError {
  constructor(message = 'Idempotency-Key header is required for this endpoint', code = 'MISSING_IDEMPOTENCY_KEY') {
    super(message, 400, code);
  }
}
