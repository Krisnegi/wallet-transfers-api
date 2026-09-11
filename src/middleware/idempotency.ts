import { Request, Response, NextFunction } from 'express';
import { MissingIdempotencyKeyError, BadRequestError } from '../errors/AppError.js';

export interface IdempotentRequest extends Request {
  idempotencyKey?: string;
}

export function requireIdempotencyKey(
  req: IdempotentRequest,
  _res: Response,
  next: NextFunction
): void {
  const headerValue = req.headers['idempotency-key'];

  if (!headerValue) {
    return next(new MissingIdempotencyKeyError());
  }

  if (Array.isArray(headerValue)) {
    return next(new BadRequestError('Multiple Idempotency-Key headers provided', 'INVALID_HEADER'));
  }

  const trimmedKey = headerValue.trim();
  if (!trimmedKey) {
    return next(new BadRequestError('Idempotency-Key header cannot be empty', 'INVALID_HEADER'));
  }

  req.idempotencyKey = trimmedKey;
  next();
}
