import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError, z } from 'zod';
import { BadRequestError } from '../errors/AppError.js';

export function validateRequest(schema: AnyZodObject) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
        headers: req.headers,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const firstIssue = error.issues[0];
        const field = firstIssue.path.filter((p) => p !== 'body' && p !== 'params' && p !== 'query').join('.');
        const msg = field ? `${field}: ${firstIssue.message}` : firstIssue.message;
        next(new BadRequestError(msg, 'INVALID_INPUT'));
      } else {
        next(error);
      }
    }
  };
}

// Reusable Zod field schemas for strict domain validation
export const commonSchemas = {
  // Minor units: Integer > 0 (reject 0, negative numbers, floats/decimals)
  amountInMinorUnits: z
    .number({
      required_error: 'Amount is required',
      invalid_type_error: 'Amount must be an integer number in minor units',
    })
    .int('Amount must be an integer in minor units (no decimals)')
    .positive('Amount must be greater than zero'),

  // Non-empty string reference
  reference: z
    .string({
      required_error: 'Reference is required',
    })
    .trim()
    .min(1, 'Reference cannot be empty'),

  // Non-empty owner name
  ownerName: z
    .string({
      required_error: 'ownerName is required',
    })
    .trim()
    .min(1, 'ownerName cannot be empty'),

  // 3-letter currency code (e.g. INR, USD, EUR)
  currency: z
    .string({
      required_error: 'currency is required',
    })
    .trim()
    .toUpperCase()
    .length(3, 'Currency must be a 3-letter ISO code (e.g. INR)'),

  // Valid UUID v4 ID
  uuid: z.string().uuid('Invalid account ID format (must be a valid UUID)'),
};
