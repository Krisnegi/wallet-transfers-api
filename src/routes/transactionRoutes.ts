import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { TransactionService } from '../services/transactionService.js';
import { validateRequest, commonSchemas } from '../middleware/validate.js';

export const transactionRouter = Router();

const getTransactionsSchema = z.object({
  params: z.object({
    id: commonSchemas.uuid,
  }),
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
});

// GET /accounts/:id/transactions - Paginated transaction history for account, newest first
transactionRouter.get(
  '/accounts/:id/transactions',
  validateRequest(getTransactionsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const accountId = Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!;
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const result = await TransactionService.getAccountTransactions(accountId, {
        page,
        limit,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
);
