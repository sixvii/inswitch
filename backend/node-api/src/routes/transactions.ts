import { Router } from 'express';
import { z } from 'zod';
import { createTransaction, createTransactionWithBalanceCommit, findTransactionById, listTransactions } from '../services/transactionService.js';
import { requireAuth } from '../middleware/authMiddleware.js';

export const transactionsRouter = Router();

const createTransactionRequestSchema = z.object({
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

const commitTransactionRequestSchema = z.object({
  expectedBalance: z.number().min(0),
  nextBalance: z.number().min(0),
  transaction: createTransactionRequestSchema,
});

transactionsRouter.get('/', requireAuth, async (_req, res, next) => {
  try {
    const userId = _req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const parsedLimit = Number.parseInt(String(_req.query.limit || ''), 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 1000) : undefined;
    const transactions = await listTransactions(userId, limit);
    res.status(200).json({ data: transactions });
  } catch (error) {
    next(error);
  }
});

transactionsRouter.get('/:transactionId', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const result = await findTransactionById(req.params.transactionId, userId);
    if (!result) {
      res.status(404).json({ message: 'Transaction not found' });
      return;
    }

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
});

transactionsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const payload = createTransactionRequestSchema.parse(req.body);
    const result = await createTransaction(payload, userId);

    if (!result.created) {
      res.status(200).json({
        message: 'Transaction already exists for this idempotency key',
        data: result.transaction,
      });
      return;
    }

    res.status(201).json({
      message: 'Transaction created',
      data: result.transaction,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Idempotency key collision') {
      res.status(409).json({ message: 'Duplicate idempotency key' });
      return;
    }
    next(error);
  }
});

transactionsRouter.post('/commit', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const payload = commitTransactionRequestSchema.parse(req.body);
    const result = await createTransactionWithBalanceCommit(
      payload.transaction,
      userId,
      payload.expectedBalance,
      payload.nextBalance,
    );

    if (!result.created) {
      res.status(200).json({
        message: 'Transaction already exists for this idempotency key',
        data: {
          transaction: result.transaction,
          balance: result.balance,
        },
      });
      return;
    }

    res.status(201).json({
      message: 'Transaction committed',
      data: {
        transaction: result.transaction,
        balance: result.balance,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Idempotency key collision') {
        res.status(409).json({ message: 'Duplicate idempotency key' });
        return;
      }
      if (error.message === 'Account balance changed. Refresh and try again.') {
        res.status(409).json({ message: error.message });
        return;
      }
      if (error.message === 'Insufficient balance') {
        res.status(400).json({ message: error.message });
        return;
      }
    }
    next(error);
  }
});
