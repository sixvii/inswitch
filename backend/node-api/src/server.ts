import mongoose from 'mongoose';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { startAutoPayoutScheduler } from './services/jobScheduler.js';

const app = createApp();

async function start() {
  await mongoose.connect(env.MONGODB_URI);

  const server = app.listen(env.PORT, () => {
    // Start auto-payout scheduler only after server is ready.
    startAutoPayoutScheduler();
    // eslint-disable-next-line no-console
    console.log(`Node API running on port ${env.PORT}`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      // eslint-disable-next-line no-console
      console.error(`Port ${env.PORT} is already in use. Stop the existing process or change PORT in .env.`);
      process.exit(1);
      return;
    }

    // eslint-disable-next-line no-console
    console.error('Failed to bind server', error);
    process.exit(1);
  });
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start node-api', error);
  process.exit(1);
});
