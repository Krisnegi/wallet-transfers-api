import express, { Express } from 'express';
import { healthRouter } from './routes/healthRoutes.js';
import { accountRouter } from './routes/accountRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(express.json());

  // Mount API routers
  app.use(healthRouter);
  app.use(accountRouter);

  // Root endpoint
  app.get('/', (_req, res) => {
    res.json({ message: 'Wallet & Transfers API' });
  });

  // Global Error Handler Middleware (must be registered last)
  app.use(errorHandler);

  return app;
}
