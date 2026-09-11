import { Router, Request, Response } from 'express';
import { sql } from 'kysely';
import { db } from '../db/index.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Perform quick lightweight DB ping
    await sql`SELECT 1`.execute(db);
    res.status(200).json({
      status: 'ok',
      db: 'healthy',
    });
  } catch (error) {
    console.error('Health check DB failure:', error);
    res.status(503).json({
      status: 'error',
      db: 'unreachable',
    });
  }
});
