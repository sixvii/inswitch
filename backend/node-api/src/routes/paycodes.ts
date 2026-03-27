import { randomInt, randomUUID } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/authMiddleware.js';
import { PaycodeModel } from '../models/Paycode.js';
import { TransactionModel } from '../models/Transaction.js';
import { UserModel } from '../models/User.js';

export const paycodesRouter = Router();

const createPaycodeSchema = z.object({
  amount: z.number().positive(),
});

const toApiPaycode = (doc: any) => ({
  id: doc._id?.toString(),
  code: doc.code,
  amount: doc.amount,
  status: doc.status,
  expiresAt: new Date(doc.expiresAt).toISOString(),
  usedAt: doc.usedAt ? new Date(doc.usedAt).toISOString() : undefined,
  cancelledAt: doc.cancelledAt ? new Date(doc.cancelledAt).toISOString() : undefined,
  createdAt: new Date(doc.createdAt).toISOString(),
});

const markExpiredPaycodes = async (ownerUserId: string) => {
  await PaycodeModel.updateMany(
    {
      ownerUserId,
      status: 'active',
      expiresAt: { $lte: new Date() },
    },
    {
      $set: { status: 'expired' },
    },
  );
};

const generateUniqueCode = async () => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = randomInt(100000, 1000000).toString();
    const existing = await PaycodeModel.findOne({ code, status: 'active' }).lean();
    if (!existing) return code;
  }

  return `${randomInt(100000, 1000000)}`;
};

paycodesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    await markExpiredPaycodes(userId);

    const paycodes = await PaycodeModel.find({ ownerUserId: userId })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ data: paycodes.map(toApiPaycode) });
  } catch (error) {
    next(error);
  }
});

paycodesRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const payload = createPaycodeSchema.parse(req.body);
    await markExpiredPaycodes(userId);

    const user = await UserModel.findById(userId).lean();
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const debited = await UserModel.findOneAndUpdate(
      {
        _id: userId,
        balance: { $gte: payload.amount },
      },
      {
        $inc: { balance: -payload.amount },
      },
      { new: true },
    ).lean();

    if (!debited) {
      res.status(400).json({ message: 'Insufficient balance' });
      return;
    }

    const code = await generateUniqueCode();
    const created = await PaycodeModel.create({
      ownerUserId: userId,
      code,
      amount: payload.amount,
      status: 'active',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    await TransactionModel.create({
      ownerUserId: userId,
      idempotencyKey: `cardless-${created._id?.toString()}-${randomUUID()}`,
      type: 'bills',
      amount: payload.amount,
      senderAccount: user.accountNumber,
      receiverAccount: 'ATM/POS',
      senderName: `${user.firstName} ${user.lastName}`,
      receiverName: 'ATM/POS',
      description: 'Cardless withdrawal',
      status: 'success',
    });

    res.status(201).json({
      data: {
        paycode: toApiPaycode(created),
        balance: debited.balance,
      },
    });
  } catch (error) {
    next(error);
  }
});

paycodesRouter.patch('/:paycodeId/cancel', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    await markExpiredPaycodes(userId);

    const cancelled = await PaycodeModel.findOneAndUpdate(
      {
        _id: req.params.paycodeId,
        ownerUserId: userId,
        status: 'active',
      },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
        },
      },
      { new: true },
    ).lean();

    if (!cancelled) {
      res.status(404).json({ message: 'Active paycode not found' });
      return;
    }

    res.status(200).json({ data: { paycode: toApiPaycode(cancelled) } });
  } catch (error) {
    next(error);
  }
});
