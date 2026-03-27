import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { TransactionModel } from '../models/Transaction.js';
import { UserModel } from '../models/User.js';

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
  phone: `0810000${seed}`,
  email: `tx${seed}@example.com`,
  age: '31',
  username: `txuser${seed}`,
  pin: '1234',
  password: 'pass1234',
  accountNumber: `2000000${seed}`,
  walletId: `tx-wallet-${seed}`,
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
    fullName: `${payload.firstName} ${payload.lastName}`,
  };
};

test('committed internal send credits receiver and creates receive transaction', async () => {
  const mongoServer = await MongoMemoryServer.create();

  try {
    await mongoose.connect(mongoServer.getUri());

    const sender = await registerAndGetToken(makeUser('7007'));
    const receiver = await registerAndGetToken(makeUser('8008'));

    const commitResponse = await request(app)
      .post('/api/transactions/commit')
      .set('Authorization', `Bearer ${sender.token}`)
      .send({
        expectedBalance: 50000,
        nextBalance: 48500,
        transaction: {
          idempotencyKey: `send-${Date.now()}-integration`,
          type: 'send',
          amount: 1500,
          senderAccount: sender.accountNumber,
          receiverAccount: receiver.accountNumber,
          senderName: sender.fullName,
          receiverName: receiver.fullName,
          description: 'integration transfer',
          status: 'success',
        },
      });

    assert.equal(commitResponse.status, 201);
    assert.equal(commitResponse.body.data.balance, 48500);

    const senderUser = await UserModel.findById(sender.userId).lean();
    const receiverUser = await UserModel.findById(receiver.userId).lean();

    assert.ok(senderUser);
    assert.ok(receiverUser);
    assert.equal(senderUser.balance, 48500);
    assert.equal(receiverUser.balance, 51500);

    const senderTransactions = await TransactionModel.find({ ownerUserId: sender.userId }).lean();
    const receiverTransactions = await TransactionModel.find({ ownerUserId: receiver.userId }).lean();

    assert.equal(senderTransactions.length, 1);
    assert.equal(senderTransactions[0].type, 'send');
    assert.equal(senderTransactions[0].amount, 1500);

    assert.equal(receiverTransactions.length, 1);
    assert.equal(receiverTransactions[0].type, 'receive');
    assert.equal(receiverTransactions[0].amount, 1500);
    assert.equal(receiverTransactions[0].receiverAccount, receiver.accountNumber);
  } finally {
    await mongoose.disconnect();
    await mongoServer.stop();
  }
});
