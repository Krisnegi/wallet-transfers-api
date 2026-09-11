import express, { Express } from 'express';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp(): Express {
  const app = express();

  // Basic middleware
  app.use(express.json());

  // Boilerplate root endpoint
  app.get('/', (_req, res) => {
    res.json({ message: 'Wallet & Transfers API' });
  });

  // Global Error Handler Middleware
  app.use(errorHandler);

  return app;
}
