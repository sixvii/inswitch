import { randomUUID } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/authMiddleware.js';
import { EscrowModel } from '../models/Escrow.js';
import { TransactionModel } from '../models/Transaction.js';
import { UserModel } from '../models/User.js';

export const escrowsRouter = Router();

const createEscrowSchema = z.object({
  sellerWalletId: z.string().min(3),
  amount: z.number().positive(),
  description: z.string().min(1),
  deliveryDeadline: z.string().min(1),
});

const updateEscrowSchema = z.object({
  action: z.enum(['accept', 'decline', 'cancel', 'release', 'dispute', 'resolve-release', 'resolve-refund']),
});

const toApiEscrow = (doc: any) => ({
  id: doc._id?.toString(),
  buyerWalletId: doc.buyerWalletId,
  buyerName: doc.buyerName,
  sellerWalletId: doc.sellerWalletId,
  sellerName: doc.sellerName,
  amount: doc.amount,
  description: doc.description,
  deliveryDeadline: doc.deliveryDeadline,
  status: doc.status,
  createdAt: doc.createdAt,
  penalty: doc.penalty || 0,
  releasedAt: doc.releasedAt,
  sellerSettledAt: doc.sellerSettledAt,
});

const settleSellerEscrows = async (userId: string) => {
  const seller = await UserModel.findById(userId).lean();
  if (!seller) return;

  const releasable = await EscrowModel.find({
    sellerUserId: userId,
    status: 'released',
    sellerSettledAt: { $exists: false },
  }).lean();

  for (const escrow of releasable) {
    const settledAt = new Date().toISOString();
    const marked = await EscrowModel.findOneAndUpdate(
      {
        _id: escrow._id,
        status: 'released',
        sellerSettledAt: { $exists: false },
      },
      { $set: { sellerSettledAt: settledAt } },
      { new: true },
    ).lean();

    if (!marked) continue;

    try {
      await UserModel.updateOne({ _id: userId }, { $inc: { balance: escrow.amount } });
      await TransactionModel.create({
        ownerUserId: userId,
        idempotencyKey: `escrow-payout-${escrow._id?.toString()}-${randomUUID()}`,
        type: 'receive',
        amount: escrow.amount,
        senderAccount: escrow.buyerWalletId,
        receiverAccount: seller.accountNumber,
        senderName: escrow.buyerName,
        receiverName: `${seller.firstName} ${seller.lastName}`,
        description: `Escrow payout: ${escrow.description}`,
        status: 'success',
      });
    } catch {
      await EscrowModel.updateOne({ _id: escrow._id }, { $unset: { sellerSettledAt: '' } });
    }
  }
};

escrowsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const nowIso = new Date().toISOString();
    await EscrowModel.updateMany(
      {
        status: 'pending_delivery',
        deliveryDeadline: { $lte: nowIso },
      },
      {
        $set: {
          status: 'released',
          releasedAt: nowIso,
        },
      },
    );

    await settleSellerEscrows(userId);

    const escrows = await EscrowModel.find({
      $or: [{ buyerUserId: userId }, { sellerUserId: userId }],
    })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ data: escrows.map(toApiEscrow) });
  } catch (error) {
    next(error);
  }
});

escrowsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const payload = createEscrowSchema.parse(req.body);
    const buyer = await UserModel.findById(userId).lean();
    if (!buyer) {
      res.status(404).json({ message: 'Buyer not found' });
      return;
    }

    const seller = await UserModel.findOne({ escrowWalletId: payload.sellerWalletId.trim() }).lean();
    if (!seller) {
      res.status(404).json({ message: 'Seller wallet not found' });
      return;
    }

    if (seller._id?.toString() === userId) {
      res.status(400).json({ message: 'Cannot create escrow with yourself' });
      return;
    }

    const deadlineAt = new Date(payload.deliveryDeadline);
    if (Number.isNaN(deadlineAt.getTime())) {
      res.status(400).json({ message: 'Invalid delivery deadline' });
      return;
    }

    const debitedBuyer = await UserModel.findOneAndUpdate(
      { _id: userId, balance: { $gte: payload.amount } },
      { $inc: { balance: -payload.amount } },
      { new: true },
    ).lean();

    if (!debitedBuyer) {
      res.status(400).json({ message: 'Insufficient balance' });
      return;
    }

    const created = await EscrowModel.create({
      buyerUserId: userId,
      buyerWalletId: buyer.escrowWalletId,
      buyerName: `${buyer.firstName} ${buyer.lastName}`,
      sellerUserId: seller._id?.toString(),
      sellerWalletId: seller.escrowWalletId,
      sellerName: `${seller.firstName} ${seller.lastName}`,
      amount: payload.amount,
      description: payload.description,
      deliveryDeadline: deadlineAt.toISOString(),
      status: 'pending_acceptance',
      penalty: 0,
    });

    await TransactionModel.create({
      ownerUserId: userId,
      idempotencyKey: `escrow-lock-${created._id?.toString()}-${randomUUID()}`,
      type: 'escrow',
      amount: payload.amount,
      senderAccount: buyer.accountNumber,
      receiverAccount: seller.escrowWalletId,
      senderName: `${buyer.firstName} ${buyer.lastName}`,
      receiverName: `${seller.firstName} ${seller.lastName}`,
      description: `Escrow lock: ${payload.description}`,
      status: 'success',
    });

    res.status(201).json({
      data: {
        escrow: toApiEscrow(created),
        balance: debitedBuyer.balance,
      },
    });
  } catch (error) {
    next(error);
  }
});

escrowsRouter.patch('/:escrowId', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const { action } = updateEscrowSchema.parse(req.body);
    const escrow = await EscrowModel.findById(req.params.escrowId).lean();

    if (!escrow) {
      res.status(404).json({ message: 'Escrow not found' });
      return;
    }

    const isBuyer = escrow.buyerUserId === userId;
    const isSeller = escrow.sellerUserId === userId;
    if (!isBuyer && !isSeller) {
      res.status(403).json({ message: 'You cannot update this escrow' });
      return;
    }

    if (action === 'accept') {
      if (!isSeller || escrow.status !== 'pending_acceptance') {
        res.status(400).json({ message: 'Only seller can accept pending escrow' });
        return;
      }

      const updated = await EscrowModel.findByIdAndUpdate(
        escrow._id,
        { $set: { status: 'pending_delivery' } },
        { new: true },
      ).lean();

      res.status(200).json({ data: { escrow: toApiEscrow(updated) } });
      return;
    }

    if (action === 'decline') {
      if (!isSeller || escrow.status !== 'pending_acceptance') {
        res.status(400).json({ message: 'Only seller can decline pending escrow' });
        return;
      }

      const cancelled = await EscrowModel.findByIdAndUpdate(
        escrow._id,
        { $set: { status: 'cancelled' } },
        { new: true },
      ).lean();

      const refundedBuyer = await UserModel.findByIdAndUpdate(
        escrow.buyerUserId,
        { $inc: { balance: escrow.amount } },
        { new: true },
      ).lean();

      if (refundedBuyer) {
        await TransactionModel.create({
          ownerUserId: escrow.buyerUserId,
          idempotencyKey: `escrow-decline-refund-${escrow._id?.toString()}-${randomUUID()}`,
          type: 'receive',
          amount: escrow.amount,
          senderAccount: 'ESCROW-REFUND',
          receiverAccount: refundedBuyer.accountNumber,
          senderName: 'Escrow Refund',
          receiverName: `${refundedBuyer.firstName} ${refundedBuyer.lastName}`,
          description: `Escrow refund (seller declined): ${escrow.description}`,
          status: 'success',
        });
      }

      res.status(200).json({ data: { escrow: toApiEscrow(cancelled) } });
      return;
    }

    if (action === 'release') {
      if (!isBuyer || escrow.status !== 'pending_delivery') {
        res.status(400).json({ message: 'Only buyer can release pending delivery escrow' });
        return;
      }

      const released = await EscrowModel.findByIdAndUpdate(
        escrow._id,
        { $set: { status: 'released', releasedAt: new Date().toISOString() } },
        { new: true },
      ).lean();

      await settleSellerEscrows(escrow.sellerUserId);

      res.status(200).json({ data: { escrow: toApiEscrow(released) } });
      return;
    }

    if (action === 'cancel') {
      const isCancelableStatus = escrow.status === 'pending_acceptance' || escrow.status === 'pending_delivery';
      if (!isBuyer || !isCancelableStatus) {
        res.status(400).json({ message: 'Only buyer can cancel active escrow' });
        return;
      }

      const createdAtMs = new Date(escrow.createdAt).getTime();
      const nowMs = Date.now();
      const cancelWindowMs = 4 * 60 * 60 * 1000;
      if (!Number.isFinite(createdAtMs) || (nowMs - createdAtMs) > cancelWindowMs) {
        res.status(400).json({ message: 'Escrow can only be cancelled within 4 hours of creation' });
        return;
      }

      const cancelled = await EscrowModel.findByIdAndUpdate(
        escrow._id,
        { $set: { status: 'cancelled' } },
        { new: true },
      ).lean();

      const refundedBuyer = await UserModel.findByIdAndUpdate(
        escrow.buyerUserId,
        { $inc: { balance: escrow.amount } },
        { new: true },
      ).lean();

      if (refundedBuyer) {
        await TransactionModel.create({
          ownerUserId: escrow.buyerUserId,
          idempotencyKey: `escrow-buyer-cancel-refund-${escrow._id?.toString()}-${randomUUID()}`,
          type: 'receive',
          amount: escrow.amount,
          senderAccount: 'ESCROW-CANCEL',
          receiverAccount: refundedBuyer.accountNumber,
          senderName: 'Escrow Cancellation',
          receiverName: `${refundedBuyer.firstName} ${refundedBuyer.lastName}`,
          description: `Escrow refund (buyer cancelled): ${escrow.description}`,
          status: 'success',
        });
      }

      res.status(200).json({ data: { escrow: toApiEscrow(cancelled) } });
      return;
    }

    if (action === 'dispute') {
      if (escrow.status !== 'pending_delivery') {
        res.status(400).json({ message: 'Only pending delivery escrow can be disputed' });
        return;
      }

      const now = Date.now();
      const deadlineTime = new Date(escrow.deliveryDeadline).getTime();
      const penalty = now > deadlineTime ? Math.max(500, Math.round(escrow.amount * 0.05)) : escrow.penalty;

      const updated = await EscrowModel.findByIdAndUpdate(
        escrow._id,
        { $set: { status: 'disputed', penalty } },
        { new: true },
      ).lean();

      res.status(200).json({ data: { escrow: toApiEscrow(updated) } });
      return;
    }

    if (action === 'resolve-release') {
      if (escrow.status !== 'disputed') {
        res.status(400).json({ message: 'Only disputed escrow can be released' });
        return;
      }

      const released = await EscrowModel.findByIdAndUpdate(
        escrow._id,
        { $set: { status: 'released', releasedAt: new Date().toISOString() } },
        { new: true },
      ).lean();

      await settleSellerEscrows(escrow.sellerUserId);

      res.status(200).json({ data: { escrow: toApiEscrow(released) } });
      return;
    }

    if (action === 'resolve-refund') {
      if (escrow.status !== 'disputed') {
        res.status(400).json({ message: 'Only disputed escrow can be refunded' });
        return;
      }

      const cancelled = await EscrowModel.findByIdAndUpdate(
        escrow._id,
        { $set: { status: 'cancelled' } },
        { new: true },
      ).lean();

      const refundAmount = escrow.amount + (escrow.penalty || 0);
      const refundedBuyer = await UserModel.findByIdAndUpdate(
        escrow.buyerUserId,
        { $inc: { balance: refundAmount } },
        { new: true },
      ).lean();

      if (refundedBuyer) {
        await TransactionModel.create({
          ownerUserId: escrow.buyerUserId,
          idempotencyKey: `escrow-dispute-refund-${escrow._id?.toString()}-${randomUUID()}`,
          type: 'receive',
          amount: refundAmount,
          senderAccount: 'ESCROW-MEDIATOR',
          receiverAccount: refundedBuyer.accountNumber,
          senderName: 'Escrow Mediator',
          receiverName: `${refundedBuyer.firstName} ${refundedBuyer.lastName}`,
          description: `Dispute refund${escrow.penalty ? ' + penalty' : ''}: ${escrow.description}`,
          status: 'success',
        });
      }

      res.status(200).json({ data: { escrow: toApiEscrow(cancelled) } });
      return;
    }

    res.status(400).json({ message: 'Unsupported action' });
  } catch (error) {
    next(error);
  }
});
