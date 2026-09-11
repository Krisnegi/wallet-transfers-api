import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AccountService } from '../services/accountService.js';
import { validateRequest, commonSchemas } from '../middleware/validate.js';

export const accountRouter = Router();

const createAccountSchema = z.object({
  body: z.object({
    ownerName: commonSchemas.ownerName,
    currency: commonSchemas.currency,
  }),
});

const getAccountSchema = z.object({
  params: z.object({
    id: commonSchemas.uuid,
  }),
});

// POST /accounts - Create Account
accountRouter.post(
  '/accounts',
  validateRequest(createAccountSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const account = await AccountService.createAccount({
        ownerName: req.body.ownerName,
        currency: req.body.currency,
      });
      res.status(201).json(account);
    } catch (error) {
      next(error);
    }
  }
);

// GET /accounts/:id - Get Account details & current balance
accountRouter.get(
  '/accounts/:id',
  validateRequest(getAccountSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const account = await AccountService.getAccountById(id);
      res.status(200).json(account);
    } catch (error) {
      next(error);
    }
  }
);
