import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError.js';
import { ZodError } from 'zod';

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response<ErrorResponse>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // 1. App errors (known domain/validation/business rule errors)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  // 2. Zod validation errors
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const message = issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid request payload';
    res.status(400).json({
      error: {
        code: 'INVALID_INPUT',
        message,
      },
    });
    return;
  }

  // 3. Fallback internal server error - NEVER leak stack trace, SQL error, or driver internals
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal server error occurred.',
    },
  });
}
