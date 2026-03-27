import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/authMiddleware.js';
import { DisputeModel } from '../models/Dispute.js';
import { findTransactionById } from '../services/transactionService.js';

export const disputesRouter = Router();

const createDisputeSchema = z.object({
  transactionId: z.string().min(1),
  issue: z.string().min(5),
});

disputesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const disputes = await DisputeModel.find({ ownerUserId: userId }).sort({ createdAt: -1 }).lean();
    res.status(200).json({
      data: disputes.map((entry) => ({
        id: entry._id?.toString(),
        transactionId: entry.transactionId,
        issue: entry.issue,
        status: entry.status,
        createdAt: entry.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

disputesRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const payload = createDisputeSchema.parse(req.body);
    const tx = await findTransactionById(payload.transactionId, userId);

    if (!tx) {
      res.status(404).json({ message: 'Transaction not found for this user' });
      return;
    }

    const created = await DisputeModel.create({
      ownerUserId: userId,
      transactionId: payload.transactionId,
      issue: payload.issue.trim(),
      status: 'open',
    });

    res.status(201).json({
      data: {
        id: created._id?.toString(),
        transactionId: created.transactionId,
        issue: created.issue,
        status: created.status,
        createdAt: created.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});
