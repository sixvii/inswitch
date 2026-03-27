import { processAutoPayouts } from './autoPayoutService.js';

let jobIntervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Start the auto-payout job scheduler.
 * Runs every 30 minutes to process eligible payouts.
 */
export function startAutoPayoutScheduler() {
  if (jobIntervalHandle) {
    // eslint-disable-next-line no-console
    console.log('Auto-payout scheduler already running');
    return;
  }

  // Run immediately on startup
  void processAutoPayouts();

  // Run every 30 minutes (1800000 milliseconds)
  jobIntervalHandle = setInterval(() => {
    void processAutoPayouts();
  }, 30 * 60 * 1000);

  // eslint-disable-next-line no-console
  console.log('Auto-payout scheduler started (every 30 minutes)');
}

/**
 * Stop the auto-payout job scheduler.
 */
export function stopAutoPayoutScheduler() {
  if (jobIntervalHandle) {
    clearInterval(jobIntervalHandle);
    jobIntervalHandle = null;
    // eslint-disable-next-line no-console
    console.log('Auto-payout scheduler stopped');
  }
}
