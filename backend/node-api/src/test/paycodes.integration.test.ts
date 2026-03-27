import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';

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

const app = createApp();

const makeUser = (seed: string): RegisterInput => ({
  firstName: `First${seed}`,
  lastName: `Last${seed}`,
  phone: `0810000${seed}`,
  email: `paycode${seed}@example.com`,
  age: '29',
  username: `paycode${seed}`,
  pin: '1234',
  password: 'pass1234',
  accountNumber: `2000000${seed}`,
  walletId: `wallet-paycode-${seed}`,
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

test('paycodes are isolated per user and cannot be cancelled by another user', async () => {
  const mongoServer = await MongoMemoryServer.create();

  try {
    await mongoose.connect(mongoServer.getUri());

    const userA = await registerAndGetToken(makeUser('1101'));
    const userB = await registerAndGetToken(makeUser('2202'));

    const createA = await request(app)
      .post('/api/paycodes')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ amount: 1000 });

    assert.equal(createA.status, 201);
    const paycodeAId = createA.body.data.paycode.id as string;

    const createB = await request(app)
      .post('/api/paycodes')
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ amount: 1500 });

    assert.equal(createB.status, 201);

    const listA = await request(app)
      .get('/api/paycodes')
      .set('Authorization', `Bearer ${userA.token}`);

    assert.equal(listA.status, 200);
    assert.equal(listA.body.data.length, 1);
    assert.equal(listA.body.data[0].id, paycodeAId);

    const listB = await request(app)
      .get('/api/paycodes')
      .set('Authorization', `Bearer ${userB.token}`);

    assert.equal(listB.status, 200);
    assert.equal(listB.body.data.length, 1);
    assert.notEqual(listB.body.data[0].id, paycodeAId);

    const userBCancelA = await request(app)
      .patch(`/api/paycodes/${paycodeAId}/cancel`)
      .set('Authorization', `Bearer ${userB.token}`)
      .send({});

    assert.equal(userBCancelA.status, 404);

    const userACancelA = await request(app)
      .patch(`/api/paycodes/${paycodeAId}/cancel`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({});

    assert.equal(userACancelA.status, 200);
    assert.equal(userACancelA.body.data.paycode.status, 'cancelled');
  } finally {
    await mongoose.disconnect();
    await mongoServer.stop();
  }
});
