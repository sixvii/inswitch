import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { escrowsRouter } from './routes/escrows.js';
import { disputesRouter } from './routes/disputes.js';
import { healthRouter } from './routes/health.js';
import { interswitchRouter } from './routes/interswitch.js';
import { paycodesRouter } from './routes/paycodes.js';
import { requestsRouter } from './routes/requests.js';
import { transactionsRouter } from './routes/transactions.js';
import { usersRouter } from './routes/users.js';
import { notificationsRouter } from './routes/notifications.js';

export const createApp = () => {
  const app = express();

  const allowedOrigins = (env.ALLOWED_ORIGINS ?? env.ALLOWED_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`CORS blocked for origin: ${origin}`));
      },
    })
  );
  app.use(express.json());

  app.use('/api/health', healthRouter);
  app.use('/api/escrows', escrowsRouter);
  app.use('/api/disputes', disputesRouter);
  app.use('/api/interswitch', interswitchRouter);
  app.use('/api/paycodes', paycodesRouter);
  app.use('/api/requests', requestsRouter);
  app.use('/api/transactions', transactionsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/notifications', notificationsRouter);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof Error) {
      const status = typeof (error as Error & { status?: unknown }).status === 'number'
        ? (error as Error & { status?: number }).status ?? 400
        : 400;
      res.status(status).json({ message: error.message });
      return;
    }

    res.status(500).json({ message: 'Unexpected error' });
  });

  return app;
};