import { randomUUID } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/authMiddleware.js';
import { UserRequestModel } from '../models/UserRequest.js';
import { UserModel } from '../models/User.js';
import { TransactionModel } from '../models/Transaction.js';
import { NotificationModel } from '../models/Notification.js';

export const requestsRouter = Router();

const createRequestSchema = z.object({
  type: z.enum(['airtime', 'data', 'money']),
  requestedFromAccount: z.string().min(10),
  requesterPhone: z.string().optional(),
  network: z.string().optional(),
  amount: z.number().positive(),
  note: z.string().optional(),
});

const respondRequestSchema = z.object({
  action: z.enum(['approve', 'decline']),
  amount: z.number().positive().optional(),
});

const toApiRequest = (doc: any) => ({
  id: doc._id?.toString(),
  requesterId: doc.requesterUserId,
  requesterName: doc.requesterName,
  requesterAccount: doc.requesterAccount,
  requesterPhone: doc.requesterPhone,
  requestedFromAccount: doc.requestedFromAccount,
  requestedFromName: doc.requestedFromName,
  type: doc.type,
  network: doc.network,
  amount: doc.amount,
  respondedAmount: doc.respondedAmount,
  responderName: doc.responderName,
  respondedAt: doc.respondedAt,
  note: doc.note,
  status: doc.status,
  createdAt: doc.createdAt,
});

requestsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const requests = await UserRequestModel.find({
      $or: [{ requesterUserId: userId }, { requestedFromUserId: userId }],
    })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ data: requests.map(toApiRequest) });
  } catch (error) {
    next(error);
  }
});

requestsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const payload = createRequestSchema.parse(req.body);
    const requester = await UserModel.findById(userId).lean();
    if (!requester) {
      res.status(404).json({ message: 'Requester not found' });
      return;
    }

    const requestedFromUser = await UserModel.findOne({ accountNumber: payload.requestedFromAccount }).lean();
    if (!requestedFromUser) {
      res.status(404).json({ message: 'Account not found' });
      return;
    }

    if (requestedFromUser._id?.toString() === userId) {
      res.status(400).json({ message: 'You cannot request from your own account' });
      return;
    }

    const normalizedRequesterPhone = payload.requesterPhone?.trim();

    if ((payload.type === 'airtime' || payload.type === 'data') && !payload.network?.trim()) {
      res.status(400).json({ message: 'Select a network provider' });
      return;
    }

    if (payload.type === 'airtime' || payload.type === 'data') {
      if (!normalizedRequesterPhone) {
        res.status(400).json({ message: 'Requester phone is required for airtime/data requests' });
        return;
      }
      if (!/^\d{10,15}$/.test(normalizedRequesterPhone)) {
        res.status(400).json({ message: 'Enter a valid requester phone number' });
        return;
      }
    }

    const created = await UserRequestModel.create({
      requesterUserId: userId,
      requesterName: `${requester.firstName} ${requester.lastName}`,
      requesterAccount: requester.accountNumber,
      requesterPhone: normalizedRequesterPhone,
      requestedFromUserId: requestedFromUser._id?.toString(),
      requestedFromAccount: requestedFromUser.accountNumber,
      requestedFromName: `${requestedFromUser.firstName} ${requestedFromUser.lastName}`,
      type: payload.type,
      network: payload.network,
      amount: payload.amount,
      note: payload.note,
      status: 'pending',
    });

    res.status(201).json({ data: toApiRequest(created) });
  } catch (error) {
    next(error);
  }
});

requestsRouter.patch('/:requestId/respond', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authUser?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const payload = respondRequestSchema.parse(req.body);
    const request = await UserRequestModel.findById(req.params.requestId).lean();

    if (!request) {
      res.status(404).json({ message: 'Request not found' });
      return;
    }

    if (request.requestedFromUserId !== userId) {
      res.status(403).json({ message: 'You can only respond to requests sent to your account' });
      return;
    }

    if (request.status !== 'pending') {
      res.status(400).json({ message: 'This request has already been handled' });
      return;
    }

    const responder = await UserModel.findById(userId).lean();
    if (!responder) {
      res.status(404).json({ message: 'Responder not found' });
      return;
    }

    const requester = await UserModel.findById(request.requesterUserId).lean();
    if (!requester) {
      res.status(404).json({ message: 'Requester not found' });
      return;
    }

    const nowIso = new Date().toISOString();

    if (payload.action === 'decline') {
      const declined = await UserRequestModel.findOneAndUpdate(
        { _id: request._id, status: 'pending' },
        {
          $set: {
            status: 'declined',
            responderName: `${responder.firstName} ${responder.lastName}`,
            respondedAt: nowIso,
          },
        },
        { new: true },
      ).lean();

      if (!declined) {
        res.status(409).json({ message: 'Request state changed. Refresh and try again.' });
        return;
      }

      try {
        await NotificationModel.create({
          userId: request.requesterUserId,
          type: 'alert',
          title: 'Request Declined',
          message: `${responder.firstName} ${responder.lastName} declined your ${request.type} request of ₦${request.amount.toLocaleString()}`,
          data: {
            requestId: request._id?.toString(),
            action: 'declined',
            requestType: request.type,
            requestedAmount: request.amount,
            requestedFromAccount: request.requestedFromAccount,
            requestedFromName: `${responder.firstName} ${responder.lastName}`,
          },
          read: false,
        });
      } catch {
        // Do not block request response on notification failure.
      }

      res.status(200).json({ data: { request: toApiRequest(declined), balance: responder.balance } });
      return;
    }

    const responseAmount = payload.amount ?? request.amount;
    if (!Number.isFinite(responseAmount) || responseAmount <= 0) {
      res.status(400).json({ message: 'Enter a valid amount to send' });
      return;
    }

    const debitedResponder = await UserModel.findOneAndUpdate(
      {
        _id: userId,
        balance: { $gte: responseAmount },
      },
      {
        $inc: { balance: -responseAmount },
      },
      { new: true },
    ).lean();

    if (!debitedResponder) {
      res.status(400).json({ message: 'Insufficient balance' });
      return;
    }

    const approved = await UserRequestModel.findOneAndUpdate(
      { _id: request._id, status: 'pending' },
      {
        $set: {
          status: 'approved',
          respondedAmount: responseAmount,
          responderName: `${responder.firstName} ${responder.lastName}`,
          respondedAt: nowIso,
        },
      },
      { new: true },
    ).lean();

    if (!approved) {
      await UserModel.updateOne({ _id: userId }, { $inc: { balance: responseAmount } });
      res.status(409).json({ message: 'Request state changed. Refresh and try again.' });
      return;
    }

    const isMoneyRequest = request.type === 'money';

    const creditedRequester = isMoneyRequest
      ? await UserModel.findOneAndUpdate(
        { _id: request.requesterUserId },
        { $inc: { balance: responseAmount } },
        { new: true },
      ).lean()
      : requester;

    if (!creditedRequester) {
      await UserModel.updateOne({ _id: userId }, { $inc: { balance: responseAmount } });
      await UserRequestModel.updateOne(
        { _id: request._id, status: 'approved' },
        {
          $set: { status: 'pending' },
          $unset: { respondedAmount: '', responderName: '', respondedAt: '' },
        },
      );
      res.status(500).json({ message: 'Unable to complete transfer for requester. Please try again.' });
      return;
    }

    const deliveryTarget = (request.type === 'airtime' || request.type === 'data')
      ? (request.requesterPhone || request.requesterAccount)
      : request.requesterAccount;

    const responderType = request.type === 'money' ? 'send' : request.type;
    const requesterType = request.type === 'money' ? 'receive' : request.type;

    await TransactionModel.create([
      {
        ownerUserId: userId,
        idempotencyKey: `request-${request._id?.toString()}-send-${randomUUID()}`,
        type: responderType,
        amount: responseAmount,
        senderAccount: debitedResponder.accountNumber,
        receiverAccount: deliveryTarget,
        senderName: `${responder.firstName} ${responder.lastName}`,
        receiverName: request.requesterName,
        description: `Response to ${request.type} request${request.network ? ` (${request.network})` : ''}`,
        status: 'success',
      },
      {
        ownerUserId: request.requesterUserId,
        idempotencyKey: `request-${request._id?.toString()}-receive-${randomUUID()}`,
        type: requesterType,
        amount: responseAmount,
        senderAccount: debitedResponder.accountNumber,
        receiverAccount: deliveryTarget,
        senderName: `${responder.firstName} ${responder.lastName}`,
        receiverName: `${creditedRequester.firstName} ${creditedRequester.lastName}`,
        description: request.type === 'money'
          ? `Received from request approval${request.network ? ` (${request.network})` : ''}`
          : `${request.type} request fulfilled${request.network ? ` (${request.network})` : ''}`,
        status: 'success',
      },
    ]);

    try {
      await NotificationModel.create({
        userId: request.requesterUserId,
        type: 'transaction',
        title: 'Request Approved',
        message: `${responder.firstName} ${responder.lastName} approved your ${request.type} request${request.type === 'money' ? ` and sent ₦${responseAmount.toLocaleString()}` : ''}`,
        data: {
          requestId: request._id?.toString(),
          action: 'approved',
          requestType: request.type,
          requestedAmount: request.amount,
          respondedAmount: responseAmount,
          requestedFromAccount: request.requestedFromAccount,
          requestedFromName: `${responder.firstName} ${responder.lastName}`,
        },
        read: false,
      });
    } catch {
      // Do not block request completion on notification failure.
    }

    res.status(200).json({ data: { request: toApiRequest(approved), balance: debitedResponder.balance } });
  } catch (error) {
    next(error);
  }
});
