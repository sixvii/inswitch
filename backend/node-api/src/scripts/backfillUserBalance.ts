import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { UserModel } from '../models/User.js';

const hasApplyFlag = process.argv.includes('--apply');

async function run() {
  await mongoose.connect(env.MONGODB_URI);

  const missingBalanceFilter = {
    $or: [
      { balance: { $exists: false } },
      { balance: null },
    ],
  };

  const usersWithoutBalance = await UserModel.find(
    missingBalanceFilter,
    { _id: 1, username: 1, phone: 1, accountNumber: 1 },
  ).lean();

  // eslint-disable-next-line no-console
  console.log('[backfill-user-balance] Scan summary');
  // eslint-disable-next-line no-console
  console.log(`- Users missing balance: ${usersWithoutBalance.length}`);

  if (!hasApplyFlag) {
    // eslint-disable-next-line no-console
    console.log('Dry run complete. Re-run with --apply to set missing balances to 50000.');
    await mongoose.disconnect();
    return;
  }

  if (usersWithoutBalance.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No updates required.');
    await mongoose.disconnect();
    return;
  }

  const result = await UserModel.updateMany(missingBalanceFilter, {
    $set: { balance: 50000 },
  });

  // eslint-disable-next-line no-console
  console.log(`[backfill-user-balance] Applied updates: ${result.modifiedCount}`);

  await mongoose.disconnect();
}

run().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error('[backfill-user-balance] Failed', error);
  await mongoose.disconnect();
  process.exit(1);
});
