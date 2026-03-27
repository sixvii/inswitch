import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
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
  phone: `0820000${seed}`,
  email: `state${seed}@example.com`,
  age: '30',
  username: `stateuser${seed}`,
  pin: '1234',
  password: 'pass1234',
  accountNumber: `3000000${seed}`,
  walletId: `state-wallet-${seed}`,
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
  };
};

test('user state API persists and returns loans and trust score', async () => {
  const mongoServer = await MongoMemoryServer.create();

  try {
    await mongoose.connect(mongoServer.getUri());

    const user = await registerAndGetToken(makeUser('3303'));

    const nowIso = new Date().toISOString();
    const dueDateIso = new Date(Date.now() + (14 * 24 * 60 * 60 * 1000)).toISOString();

    const loansPayload = [
      {
        id: 'loan-abc-1',
        borrowerId: user.userId,
        borrowerName: 'First3303 Last3303',
        type: 'business',
        amount: 250000,
        status: 'active',
        createdAt: nowIso,
        dueDate: dueDateIso,
      },
      {
        id: 'loan-abc-2',
        borrowerId: user.userId,
        borrowerName: 'First3303 Last3303',
        type: 'student',
        amount: 50000,
        status: 'repaid',
        createdAt: nowIso,
        dueDate: dueDateIso,
        repaidAt: nowIso,
      },
    ];

    const trustScorePayload = {
      overall: 640,
      transactionVolume: 72,
      savingsDiscipline: 64,
      escrowReliability: 81,
      billPaymentConsistency: 70,
    };

    const updateResponse = await request(app)
      .put('/api/users/me/state')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        loans: loansPayload,
        trustScore: trustScorePayload,
      });

    assert.equal(updateResponse.status, 200);
    assert.deepEqual(updateResponse.body.data.loans, loansPayload);
    assert.deepEqual(updateResponse.body.data.trustScore, trustScorePayload);

    const fetchResponse = await request(app)
      .get('/api/users/me/state')
      .set('Authorization', `Bearer ${user.token}`);

    assert.equal(fetchResponse.status, 200);
    assert.deepEqual(fetchResponse.body.data.loans, loansPayload);
    assert.deepEqual(fetchResponse.body.data.trustScore, trustScorePayload);

    const persistedUser = await UserModel.findById(user.userId).lean();
    assert.ok(persistedUser);
    assert.deepEqual(persistedUser.loans, loansPayload);
    assert.deepEqual(persistedUser.trustScore, trustScorePayload);
  } finally {
    await mongoose.disconnect();
    await mongoServer.stop();
  }
});
