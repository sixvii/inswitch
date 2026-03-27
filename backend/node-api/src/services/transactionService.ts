import { z } from 'zod';
import { isValidObjectId } from 'mongoose';
import { TransactionModel } from '../models/Transaction.js';
import { UserModel } from '../models/User.js';
import { NotificationModel } from '../models/Notification.js';
import mongoose from 'mongoose';

const transactionInputSchema = z.object({
  idempotencyKey: z.string().min(8),
  type: z.enum(['send', 'receive', 'airtime', 'data', 'bills', 'insurance', 'escrow', 'ajo', 'cross-border']),
  amount: z.number().positive(),
  senderAccount: z.string().min(3),
  receiverAccount: z.string().min(3),
  senderName: z.string().min(2),
  receiverName: z.string().min(2),
  description: z.string().optional(),
  status: z.enum(['success', 'pending', 'failed']).default('pending'),
  providerReference: z.string().optional(),
});

export type CreateTransactionInput = z.infer<typeof transactionInputSchema>;

export async function createTransaction(input: CreateTransactionInput, ownerUserId: string) {
  const payload = transactionInputSchema.parse(input);

  const existing = await TransactionModel.findOne({ idempotencyKey: payload.idempotencyKey }).lean();
  if (existing) {
    if (existing.ownerUserId !== ownerUserId) {
      throw new Error('Idempotency key collision');
    }
    return { created: false, transaction: existing };
  }

  const transaction = await TransactionModel.create({
    ...payload,
    ownerUserId,
  });
  return { created: true, transaction };
}

export async function listTransactions(ownerUserId: string, limit = 500) {
  return TransactionModel.find({ ownerUserId }).sort({ createdAt: -1 }).limit(limit).lean();
}

export async function findTransactionById(transactionId: string, ownerUserId: string) {
  if (isValidObjectId(transactionId)) {
    const byObjectId = await TransactionModel.findOne({
      _id: transactionId,
      ownerUserId,
    }).lean();
    if (byObjectId) return byObjectId;
  }

  return TransactionModel.findOne({
    idempotencyKey: transactionId,
    ownerUserId,
  }).lean();
}

export async function createTransactionWithBalanceCommit(
  input: CreateTransactionInput,
  ownerUserId: string,
  expectedBalance: number,
  nextBalance: number,
) {
  const payload = transactionInputSchema.parse(input);

  if (nextBalance < 0) {
    throw new Error('Insufficient balance');
  }

  // Check for existing transaction (idempotency)
  const existing = await TransactionModel.findOne({ idempotencyKey: payload.idempotencyKey }).lean();
  if (existing) {
    if (existing.ownerUserId !== ownerUserId) {
      throw new Error('Idempotency key collision');
    }

    const user = await UserModel.findById(ownerUserId).lean();
    return {
      created: false,
      transaction: existing,
      balance: typeof user?.balance === 'number' ? user.balance : expectedBalance,
    };
  }

  const isInternalSend = payload.type === 'send';
  const receiverUser = isInternalSend
    ? await UserModel.findOne({ accountNumber: payload.receiverAccount }).lean()
    : null;

  const shouldCreditReceiver = !!receiverUser && receiverUser._id?.toString() !== ownerUserId;
  const receiverIdempotencyKey = shouldCreditReceiver
    ? `${payload.idempotencyKey}:receive:${receiverUser._id?.toString()}`
    : null;
  const senderDisplayName = payload.senderName?.trim() || 'Sender';
  const receiverDisplayName = payload.receiverName?.trim() || 'Receiver';

  const notifyReceiver = (transactionId?: string) => {
    if (!shouldCreditReceiver || !receiverUser?._id) return;
    void NotificationModel.create({
      userId: receiverUser._id?.toString(),
      type: 'transaction',
      title: 'Funds Received',
      message: `${senderDisplayName} sent you ₦${payload.amount.toLocaleString()}`,
      data: {
        transactionId,
        amount: payload.amount,
        senderAccount: payload.senderAccount,
        senderName: payload.senderName,
      },
      read: false,
    }).catch(() => {
      // Do not block transfer completion on notification failure.
    });
  };

  const commitWithoutSession = async () => {
    const senderAfterDebit = await UserModel.findOneAndUpdate(
      {
        _id: ownerUserId,
        balance: expectedBalance,
      },
      {
        $set: { balance: nextBalance },
      },
      { new: true },
    ).lean();

    if (!senderAfterDebit) {
      throw new Error('Account balance changed. Refresh and try again.');
    }

    try {
      if (shouldCreditReceiver && receiverUser?._id) {
        const credited = await UserModel.updateOne(
          { _id: receiverUser._id },
          { $inc: { balance: payload.amount } },
        );

        if (!credited.acknowledged || credited.modifiedCount !== 1) {
          throw new Error('Unable to credit receiver balance');
        }
      }

      const transactionDocs = [
        {
          ...payload,
          ownerUserId,
          status: 'success',
        },
      ];

      if (shouldCreditReceiver && receiverIdempotencyKey) {
        transactionDocs.push({
          idempotencyKey: receiverIdempotencyKey,
          type: 'receive',
          amount: payload.amount,
          senderAccount: payload.senderAccount,
          receiverAccount: payload.receiverAccount,
          senderName: senderDisplayName,
          receiverName: receiverDisplayName,
          description: payload.description,
          status: 'success',
          providerReference: payload.providerReference,
          ownerUserId: receiverUser._id?.toString(),
        });
      }

      const [transaction] = await TransactionModel.create(transactionDocs);
      notifyReceiver(transaction._id?.toString());

      return {
        created: true,
        transaction,
        balance: senderAfterDebit.balance,
      };
    } catch (error) {
      if (shouldCreditReceiver && receiverUser?._id) {
        await UserModel.updateOne(
          { _id: receiverUser._id, balance: { $gte: payload.amount } },
          { $inc: { balance: -payload.amount } },
        );

        if (receiverIdempotencyKey) {
          await TransactionModel.deleteOne({ idempotencyKey: receiverIdempotencyKey });
        }
      }

      await TransactionModel.deleteOne({ idempotencyKey: payload.idempotencyKey });

      await UserModel.findOneAndUpdate(
        {
          _id: ownerUserId,
          balance: nextBalance,
        },
        {
          $set: { balance: expectedBalance },
        },
      );

      throw error;
    }
  };

  // Use MongoDB transaction session for atomic sender debit + receiver credit
  try {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const senderAfterDebit = await UserModel.findOneAndUpdate(
        {
          _id: ownerUserId,
          balance: expectedBalance,
        },
        {
          $set: { balance: nextBalance },
        },
        { new: true, session },
      ).lean();

      if (!senderAfterDebit) {
        throw new Error('Account balance changed. Refresh and try again.');
      }

      if (shouldCreditReceiver && receiverUser?._id) {
        const receiverAfterCredit = await UserModel.findOneAndUpdate(
          { _id: receiverUser._id },
          { $inc: { balance: payload.amount } },
          { new: true, session },
        ).lean();

        if (!receiverAfterCredit) {
          throw new Error('Unable to credit receiver balance');
        }
      }

      const transactionDocs = [
        {
          ...payload,
          ownerUserId,
          status: 'success',
        },
      ];

      if (shouldCreditReceiver && receiverIdempotencyKey) {
        transactionDocs.push({
          idempotencyKey: receiverIdempotencyKey,
          type: 'receive',
          amount: payload.amount,
          senderAccount: payload.senderAccount,
          receiverAccount: payload.receiverAccount,
          senderName: senderDisplayName,
          receiverName: receiverDisplayName,
          description: payload.description,
          status: 'success',
          providerReference: payload.providerReference,
          ownerUserId: receiverUser._id?.toString(),
        });
      }

      const [transaction] = await TransactionModel.create(transactionDocs, { session, ordered: true });
      await session.commitTransaction();
      notifyReceiver(transaction._id?.toString());

      return {
        created: true,
        transaction,
        balance: senderAfterDebit.balance,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    const transactionUnsupported = message.includes('transaction numbers are only allowed')
      || message.includes('replica set')
      || message.includes('transaction is not supported');

    if (transactionUnsupported) {
      return commitWithoutSession();
    }

    throw error;
  }
}
