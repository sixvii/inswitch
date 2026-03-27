import mongoose, { type AnyBulkWriteOperation } from 'mongoose';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { TransactionModel } from '../models/Transaction.js';
import { UserModel } from '../models/User.js';

type MinimalTransaction = {
  _id: mongoose.Types.ObjectId;
  senderAccount?: string;
  receiverAccount?: string;
  ownerUserId?: string;
};

type UnresolvedRow = {
  transactionId: string;
  reason: 'ambiguous' | 'unmatched';
  senderAccount: string;
  receiverAccount: string;
  senderUserId: string;
  receiverUserId: string;
};

const hasApplyFlag = process.argv.includes('--apply');

const normalizeAccount = (value?: string) => (value || '').trim();

const resolveOwnerUserId = (
  tx: MinimalTransaction,
  accountToUserId: Map<string, string>,
): { ownerUserId?: string; reason: 'sender' | 'receiver' | 'both-same' | 'ambiguous' | 'unmatched' } => {
  const senderUserId = accountToUserId.get(normalizeAccount(tx.senderAccount));
  const receiverUserId = accountToUserId.get(normalizeAccount(tx.receiverAccount));

  if (senderUserId && receiverUserId) {
    if (senderUserId === receiverUserId) {
      return { ownerUserId: senderUserId, reason: 'both-same' };
    }
    return { reason: 'ambiguous' };
  }

  if (senderUserId) {
    return { ownerUserId: senderUserId, reason: 'sender' };
  }

  if (receiverUserId) {
    return { ownerUserId: receiverUserId, reason: 'receiver' };
  }

  return { reason: 'unmatched' };
};

async function run() {
  await mongoose.connect(env.MONGODB_URI);

  const users = await UserModel.find({}, { _id: 1, accountNumber: 1 }).lean();
  const accountToUserId = new Map<string, string>();

  users.forEach((user) => {
    const account = normalizeAccount(user.accountNumber);
    if (!account) return;
    accountToUserId.set(account, user._id.toString());
  });

  const missingOwnerFilter = {
    $or: [
      { ownerUserId: { $exists: false } },
      { ownerUserId: null },
      { ownerUserId: '' },
    ],
  };

  const legacyTransactions = await TransactionModel.find(
    missingOwnerFilter,
    { _id: 1, senderAccount: 1, receiverAccount: 1, ownerUserId: 1 },
  ).lean<MinimalTransaction[]>();

  let resolved = 0;
  let ambiguous = 0;
  let unmatched = 0;
  let senderResolved = 0;
  let receiverResolved = 0;
  let bothSameResolved = 0;
  const unresolvedRows: UnresolvedRow[] = [];

  const operations: AnyBulkWriteOperation<MinimalTransaction>[] = [];

  legacyTransactions.forEach((tx) => {
    const senderUserId = accountToUserId.get(normalizeAccount(tx.senderAccount)) || '';
    const receiverUserId = accountToUserId.get(normalizeAccount(tx.receiverAccount)) || '';
    const decision = resolveOwnerUserId(tx, accountToUserId);

    if (!decision.ownerUserId) {
      if (decision.reason === 'ambiguous') {
        ambiguous += 1;
        unresolvedRows.push({
          transactionId: tx._id.toString(),
          reason: 'ambiguous',
          senderAccount: normalizeAccount(tx.senderAccount),
          receiverAccount: normalizeAccount(tx.receiverAccount),
          senderUserId,
          receiverUserId,
        });
      }
      if (decision.reason === 'unmatched') {
        unmatched += 1;
        unresolvedRows.push({
          transactionId: tx._id.toString(),
          reason: 'unmatched',
          senderAccount: normalizeAccount(tx.senderAccount),
          receiverAccount: normalizeAccount(tx.receiverAccount),
          senderUserId,
          receiverUserId,
        });
      }
      return;
    }

    resolved += 1;
    if (decision.reason === 'sender') senderResolved += 1;
    if (decision.reason === 'receiver') receiverResolved += 1;
    if (decision.reason === 'both-same') bothSameResolved += 1;

    operations.push({
      updateOne: {
        filter: { _id: tx._id },
        update: { $set: { ownerUserId: decision.ownerUserId } },
      },
    });
  });

  const total = legacyTransactions.length;
  // eslint-disable-next-line no-console
  console.log('[backfill-ownerUserId] Scan summary');
  // eslint-disable-next-line no-console
  console.log(`- Legacy transactions without ownerUserId: ${total}`);
  // eslint-disable-next-line no-console
  console.log(`- Resolved: ${resolved}`);
  // eslint-disable-next-line no-console
  console.log(`  - by senderAccount: ${senderResolved}`);
  // eslint-disable-next-line no-console
  console.log(`  - by receiverAccount: ${receiverResolved}`);
  // eslint-disable-next-line no-console
  console.log(`  - where sender and receiver map to same user: ${bothSameResolved}`);
  // eslint-disable-next-line no-console
  console.log(`- Ambiguous (both accounts map to different users): ${ambiguous}`);
  // eslint-disable-next-line no-console
  console.log(`- Unmatched (no account maps): ${unmatched}`);

  if (unresolvedRows.length > 0) {
    const reportsDir = path.resolve(process.cwd(), 'migration-reports');
    await mkdir(reportsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(reportsDir, `transaction-owner-backfill-unresolved-${timestamp}.csv`);
    const header = 'transactionId,reason,senderAccount,receiverAccount,senderUserId,receiverUserId';
    const lines = unresolvedRows.map((row) => [
      row.transactionId,
      row.reason,
      row.senderAccount,
      row.receiverAccount,
      row.senderUserId,
      row.receiverUserId,
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));

    await writeFile(filePath, `${header}\n${lines.join('\n')}\n`, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`- Unresolved report written: ${filePath}`);
  }

  if (!hasApplyFlag) {
    // eslint-disable-next-line no-console
    console.log('Dry run complete. Re-run with --apply to persist resolved ownerUserId updates.');
    await mongoose.disconnect();
    return;
  }

  if (operations.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No resolvable transaction owners found. Nothing to update.');
    await mongoose.disconnect();
    return;
  }

  const result = await TransactionModel.bulkWrite(operations, { ordered: false });
  // eslint-disable-next-line no-console
  console.log(`[backfill-ownerUserId] Applied updates: ${result.modifiedCount}`);

  await mongoose.disconnect();
}

run().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error('[backfill-ownerUserId] Failed', error);
  await mongoose.disconnect();
  process.exit(1);
});
