import express, { Express } from 'express';

export function createApp(): Express {
  const app = express();

  // Basic middleware
  app.use(express.json());

  // Boilerplate root endpoint
  app.get('/', (_req, res) => {
    res.json({ message: 'Wallet & Transfers API' });
  });

  return app;
}
