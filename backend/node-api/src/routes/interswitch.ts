import { Router } from 'express';
import { z } from 'zod';
import { createPayBillLink, getCheckoutConfig, verifyTransaction } from '../services/interswitchService.js';
import { requireAuth } from '../middleware/authMiddleware.js';

export const interswitchRouter = Router();

const payBillRequestSchema = z.object({
  amount: z.string().min(1),
  redirectUrl: z.string().url(),
  customerId: z.string().min(3),
  customerEmail: z.string().email(),
  currencyCode: z.string().default('566').optional(),
});

const verifyRequestSchema = z.object({
  transactionReference: z.string().min(3),
  amount: z.string().min(1),
});

interswitchRouter.get('/config', (_req, res) => {
  res.status(200).json({ data: getCheckoutConfig() });
});

interswitchRouter.post('/pay-bill', requireAuth, async (req, res, next) => {
  try {
    const payload = payBillRequestSchema.parse(req.body);
    // @ts-ignore - payload type matches CreatePayBillInput
    const data = await createPayBillLink(payload);
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

interswitchRouter.get('/verify', requireAuth, async (req, res, next) => {
  try {
    const payload = verifyRequestSchema.parse({
      transactionReference: req.query.transactionReference,
      amount: req.query.amount,
    });

    // @ts-ignore - payload type matches VerifyTransactionInput
    const data = await verifyTransaction(payload);
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});
