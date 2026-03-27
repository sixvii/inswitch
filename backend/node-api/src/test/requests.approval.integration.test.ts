import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { TransactionModel } from '../models/Transaction.js';
import { UserModel } from '../models/User.js';
import { UserRequestModel } from '../models/UserRequest.js';
import { NotificationModel } from '../models/Notification.js';

const app = createApp();

type RegisterInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  age: string;
  username: string;
  pin: string;
  password: string;
  accountNumber: string;
  walletId: string;
};

const makeUser = (seed: string): RegisterInput => ({
  firstName: `First${seed}`,
  lastName: `Last${seed}`,
  phone: `0800000${seed}`,
  email: `user${seed}@example.com`,
  age: '27',
  username: `user${seed}`,
  pin: '1234',
  password: 'pass1234',
  accountNumber: `1000000${seed}`,
  walletId: `wallet-${seed}`,
});

const registerAndGetToken = async (payload: RegisterInput) => {
  const response = await request(app)
    .post('/api/users/register')
    .send({
      ...payload,
      createdAt: new Date().toISOString(),
      faceVerified: false,
    });

  assert.equal(response.status, 201);
  return {
    token: response.body.token as string,
    userId: response.body.data.id as string,
    accountNumber: payload.accountNumber,
  };
};

test('approving a request debits responder, credits requester, and creates both transactions', async () => {
  const mongoServer = await MongoMemoryServer.create();

  try {
    await mongoose.connect(mongoServer.getUri());

    const requesterPayload = makeUser('1001');
    const responderPayload = makeUser('2002');

    const requester = await registerAndGetToken(requesterPayload);
    const responder = await registerAndGetToken(responderPayload);

    const createdRequest = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({
        type: 'money',
        requestedFromAccount: responder.accountNumber,
        amount: 1200,
        note: 'help me out',
      });

    assert.equal(createdRequest.status, 201);
    const requestId = createdRequest.body.data.id as string;

    const approveResponse = await request(app)
      .patch(`/api/requests/${requestId}/respond`)
      .set('Authorization', `Bearer ${responder.token}`)
      .send({
        action: 'approve',
      });

    assert.equal(approveResponse.status, 200);
    assert.equal(approveResponse.body.data.request.status, 'approved');
    assert.equal(approveResponse.body.data.request.respondedAmount, 1200);

    const requesterUser = await UserModel.findById(requester.userId).lean();
    const responderUser = await UserModel.findById(responder.userId).lean();

    assert.ok(requesterUser);
    assert.ok(responderUser);
    assert.equal(requesterUser.balance, 51200);
    assert.equal(responderUser.balance, 48800);

    const persistedRequest = await UserRequestModel.findById(requestId).lean();
    assert.ok(persistedRequest);
    assert.equal(persistedRequest.status, 'approved');

    const requesterTransactions = await TransactionModel.find({ ownerUserId: requester.userId }).lean();
    const responderTransactions = await TransactionModel.find({ ownerUserId: responder.userId }).lean();
    const requesterNotifications = await NotificationModel.find({ userId: requester.userId }).lean();

    assert.equal(requesterTransactions.length, 1);
    assert.equal(requesterTransactions[0].type, 'receive');
    assert.equal(requesterTransactions[0].amount, 1200);

    assert.equal(responderTransactions.length, 1);
    assert.equal(responderTransactions[0].type, 'send');
    assert.equal(responderTransactions[0].amount, 1200);

    assert.equal(requesterNotifications.length, 1);
    assert.equal(requesterNotifications[0].type, 'transaction');
    assert.equal(requesterNotifications[0].title, 'Request Approved');
    assert.equal(requesterNotifications[0].read, false);
    assert.equal(requesterNotifications[0].data?.action, 'approved');
  } finally {
    await mongoose.disconnect();
    await mongoServer.stop();
  }
});

test('declining a request notifies the requester and does not create transactions', async () => {
  const mongoServer = await MongoMemoryServer.create();

  try {
    await mongoose.connect(mongoServer.getUri());

    const requesterPayload = makeUser('9009');
    const responderPayload = makeUser('9010');

    const requester = await registerAndGetToken(requesterPayload);
    const responder = await registerAndGetToken(responderPayload);

    const createdRequest = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({
        type: 'money',
        requestedFromAccount: responder.accountNumber,
        amount: 2000,
        note: 'please assist',
      });

    assert.equal(createdRequest.status, 201);
    const requestId = createdRequest.body.data.id as string;

    const declineResponse = await request(app)
      .patch(`/api/requests/${requestId}/respond`)
      .set('Authorization', `Bearer ${responder.token}`)
      .send({ action: 'decline' });

    assert.equal(declineResponse.status, 200);
    assert.equal(declineResponse.body.data.request.status, 'declined');

    const persistedRequest = await UserRequestModel.findById(requestId).lean();
    assert.ok(persistedRequest);
    assert.equal(persistedRequest.status, 'declined');

    const requesterUser = await UserModel.findById(requester.userId).lean();
    const responderUser = await UserModel.findById(responder.userId).lean();
    assert.ok(requesterUser);
    assert.ok(responderUser);
    assert.equal(requesterUser.balance, 50000);
    assert.equal(responderUser.balance, 50000);

    const requesterTransactions = await TransactionModel.find({ ownerUserId: requester.userId }).lean();
    const responderTransactions = await TransactionModel.find({ ownerUserId: responder.userId }).lean();
    assert.equal(requesterTransactions.length, 0);
    assert.equal(responderTransactions.length, 0);

    const requesterNotifications = await NotificationModel.find({ userId: requester.userId }).lean();
    assert.equal(requesterNotifications.length, 1);
    assert.equal(requesterNotifications[0].type, 'alert');
    assert.equal(requesterNotifications[0].title, 'Request Declined');
    assert.equal(requesterNotifications[0].read, false);
    assert.equal(requesterNotifications[0].data?.action, 'declined');
  } finally {
    await mongoose.disconnect();
    await mongoServer.stop();
  }
});

test('approval fails with insufficient balance and leaves request pending', async () => {
  const mongoServer = await MongoMemoryServer.create();

  try {
    await mongoose.connect(mongoServer.getUri());

    const requesterPayload = makeUser('3003');
    const responderPayload = makeUser('4004');

    const requester = await registerAndGetToken(requesterPayload);
    const responder = await registerAndGetToken(responderPayload);

    const createdRequest = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({
        type: 'money',
        requestedFromAccount: responder.accountNumber,
        amount: 60000,
        note: 'large transfer',
      });

    assert.equal(createdRequest.status, 201);
    const requestId = createdRequest.body.data.id as string;

    const approveResponse = await request(app)
      .patch(`/api/requests/${requestId}/respond`)
      .set('Authorization', `Bearer ${responder.token}`)
      .send({
        action: 'approve',
      });

    assert.equal(approveResponse.status, 400);
    assert.equal(approveResponse.body.message, 'Insufficient balance');

    const requesterUser = await UserModel.findById(requester.userId).lean();
    const responderUser = await UserModel.findById(responder.userId).lean();

    assert.ok(requesterUser);
    assert.ok(responderUser);
    assert.equal(requesterUser.balance, 50000);
    assert.equal(responderUser.balance, 50000);

    const persistedRequest = await UserRequestModel.findById(requestId).lean();
    assert.ok(persistedRequest);
    assert.equal(persistedRequest.status, 'pending');
    assert.equal(persistedRequest.respondedAmount, undefined);

    const requesterTransactions = await TransactionModel.find({ ownerUserId: requester.userId }).lean();
    const responderTransactions = await TransactionModel.find({ ownerUserId: responder.userId }).lean();

    assert.equal(requesterTransactions.length, 0);
    assert.equal(responderTransactions.length, 0);
  } finally {
    await mongoose.disconnect();
    await mongoServer.stop();
  }
});

test('concurrent approvals on the same request allow only one success', async () => {
  const mongoServer = await MongoMemoryServer.create();

  try {
    await mongoose.connect(mongoServer.getUri());

    const requesterPayload = makeUser('5005');
    const responderPayload = makeUser('6006');

    const requester = await registerAndGetToken(requesterPayload);
    const responder = await registerAndGetToken(responderPayload);

    const createdRequest = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({
        type: 'money',
        requestedFromAccount: responder.accountNumber,
        amount: 1500,
        note: 'race-condition check',
      });

    assert.equal(createdRequest.status, 201);
    const requestId = createdRequest.body.data.id as string;

    const [attemptA, attemptB] = await Promise.all([
      request(app)
        .patch(`/api/requests/${requestId}/respond`)
        .set('Authorization', `Bearer ${responder.token}`)
        .send({ action: 'approve' }),
      request(app)
        .patch(`/api/requests/${requestId}/respond`)
        .set('Authorization', `Bearer ${responder.token}`)
        .send({ action: 'approve' }),
    ]);

    const statuses = [attemptA.status, attemptB.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [200, 409]);

    const success = attemptA.status === 200 ? attemptA : attemptB;
    const conflict = attemptA.status === 409 ? attemptA : attemptB;

    assert.equal(success.body.data.request.status, 'approved');
    assert.equal(success.body.data.request.respondedAmount, 1500);
    assert.equal(conflict.body.message, 'Request state changed. Refresh and try again.');

    const requesterUser = await UserModel.findById(requester.userId).lean();
    const responderUser = await UserModel.findById(responder.userId).lean();

    assert.ok(requesterUser);
    assert.ok(responderUser);
    assert.equal(requesterUser.balance, 51500);
    assert.equal(responderUser.balance, 48500);

    const persistedRequest = await UserRequestModel.findById(requestId).lean();
    assert.ok(persistedRequest);
    assert.equal(persistedRequest.status, 'approved');

    const requesterTransactions = await TransactionModel.find({ ownerUserId: requester.userId }).lean();
    const responderTransactions = await TransactionModel.find({ ownerUserId: responder.userId }).lean();

    assert.equal(requesterTransactions.length, 1);
    assert.equal(requesterTransactions[0].type, 'receive');
    assert.equal(requesterTransactions[0].amount, 1500);

    assert.equal(responderTransactions.length, 1);
    assert.equal(responderTransactions[0].type, 'send');
    assert.equal(responderTransactions[0].amount, 1500);
  } finally {
    await mongoose.disconnect();
    await mongoServer.stop();
  }
});

test('airtime request approval requires requester phone and fulfills without crediting requester balance', async () => {
  const mongoServer = await MongoMemoryServer.create();

  try {
    await mongoose.connect(mongoServer.getUri());

    const requesterPayload = makeUser('7007');
    const responderPayload = makeUser('8008');

    const requester = await registerAndGetToken(requesterPayload);
    const responder = await registerAndGetToken(responderPayload);

    const missingPhoneRequest = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({
        type: 'airtime',
        requestedFromAccount: responder.accountNumber,
        network: 'MTN',
        amount: 1000,
      });

    assert.equal(missingPhoneRequest.status, 400);
    assert.equal(missingPhoneRequest.body.message, 'Requester phone is required for airtime/data requests');

    const createdRequest = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({
        type: 'airtime',
        requestedFromAccount: responder.accountNumber,
        requesterPhone: '08031234567',
        network: 'MTN',
        amount: 1000,
      });

    assert.equal(createdRequest.status, 201);
    assert.equal(createdRequest.body.data.requesterPhone, '08031234567');
    const requestId = createdRequest.body.data.id as string;

    const approveResponse = await request(app)
      .patch(`/api/requests/${requestId}/respond`)
      .set('Authorization', `Bearer ${responder.token}`)
      .send({ action: 'approve' });

    assert.equal(approveResponse.status, 200);
    assert.equal(approveResponse.body.data.request.status, 'approved');

    const requesterUser = await UserModel.findById(requester.userId).lean();
    const responderUser = await UserModel.findById(responder.userId).lean();

    assert.ok(requesterUser);
    assert.ok(responderUser);
    assert.equal(requesterUser.balance, 50000);
    assert.equal(responderUser.balance, 49000);

    const requesterTransactions = await TransactionModel.find({ ownerUserId: requester.userId }).lean();
    const responderTransactions = await TransactionModel.find({ ownerUserId: responder.userId }).lean();

    assert.equal(requesterTransactions.length, 1);
    assert.equal(requesterTransactions[0].type, 'airtime');
    assert.equal(requesterTransactions[0].receiverAccount, '08031234567');

    assert.equal(responderTransactions.length, 1);
    assert.equal(responderTransactions[0].type, 'airtime');
    assert.equal(responderTransactions[0].receiverAccount, '08031234567');
  } finally {
    await mongoose.disconnect();
    await mongoServer.stop();
  }
});
