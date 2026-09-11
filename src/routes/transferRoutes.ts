import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { TransferService } from '../services/transferService.js';
import { validateRequest, commonSchemas } from '../middleware/validate.js';
import { requireIdempotencyKey, IdempotentRequest } from '../middleware/idempotency.js';

export const transferRouter = Router();

const creditSchema = z.object({
  params: z.object({
    id: commonSchemas.uuid,
  }),
  body: z.object({
    amount: commonSchemas.amountInMinorUnits,
    reference: commonSchemas.reference,
  }),
});

const debitSchema = z.object({
  params: z.object({
    id: commonSchemas.uuid,
  }),
  body: z.object({
    amount: commonSchemas.amountInMinorUnits,
    reference: commonSchemas.reference,
  }),
});

const transferSchema = z.object({
  body: z.object({
    fromAccountId: commonSchemas.uuid,
    toAccountId: commonSchemas.uuid,
    amount: commonSchemas.amountInMinorUnits,
    reference: commonSchemas.reference,
  }),
});

// POST /accounts/:id/credit - Add money to account
transferRouter.post(
  '/accounts/:id/credit',
  requireIdempotencyKey,
  validateRequest(creditSchema),
  async (req: IdempotentRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const accountId = Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!;
      const { statusCode, data } = await TransferService.credit({
        accountId,
        amount: req.body.amount,
        reference: req.body.reference,
        idempotencyKey: req.idempotencyKey!,
        requestPath: req.originalUrl || req.path,
        requestBody: req.body,
      });
      res.status(statusCode).json(data);
    } catch (error) {
      next(error);
    }
  }
);

// POST /accounts/:id/debit - Remove money from account
transferRouter.post(
  '/accounts/:id/debit',
  requireIdempotencyKey,
  validateRequest(debitSchema),
  async (req: IdempotentRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const accountId = Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!;
      const { statusCode, data } = await TransferService.debit({
        accountId,
        amount: req.body.amount,
        reference: req.body.reference,
        idempotencyKey: req.idempotencyKey!,
        requestPath: req.originalUrl || req.path,
        requestBody: req.body,
      });
      res.status(statusCode).json(data);
    } catch (error) {
      next(error);
    }
  }
);

// POST /transfers - Move money between two accounts
transferRouter.post(
  '/transfers',
  requireIdempotencyKey,
  validateRequest(transferSchema),
  async (req: IdempotentRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { statusCode, data } = await TransferService.transfer({
        fromAccountId: req.body.fromAccountId,
        toAccountId: req.body.toAccountId,
        amount: req.body.amount,
        reference: req.body.reference,
        idempotencyKey: req.idempotencyKey!,
        requestPath: req.originalUrl || req.path,
        requestBody: req.body,
      });
      res.status(statusCode).json(data);
    } catch (error) {
      next(error);
    }
  }
);
