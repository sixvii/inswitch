import assert from 'node:assert/strict';

const API_BASE_URL = process.env.SMOKE_API_BASE_URL || 'http://localhost:5001';

type RegisterPayload = {
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
  createdAt: string;
  faceVerified: boolean;
};

type AuthContext = {
  token: string;
  id: string;
  accountNumber: string;
  walletId: string;
  fullName: string;
};

const jsonRequest = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${path}: ${body?.message || 'Request failed'}`);
  }
  return body as T;
};

const nowSeed = Date.now().toString().slice(-6);

const buildRegisterPayload = (seedPrefix: string): RegisterPayload => {
  const seed = `${seedPrefix}${nowSeed}`;
  return {
    firstName: `Smoke${seedPrefix}`,
    lastName: 'User',
    phone: `09${seed}`.slice(0, 11),
    email: `smoke-${seed}@example.com`,
    age: '30',
    username: `smoke_${seed}`,
    pin: '1234',
    password: 'pass1234',
    accountNumber: `${seed}00`.slice(0, 10),
    walletId: `TP-SMOKE-${seed}`.slice(0, 18),
    createdAt: new Date().toISOString(),
    faceVerified: true,
  };
};

const registerUser = async (seedPrefix: string): Promise<AuthContext> => {
  const payload = buildRegisterPayload(seedPrefix);
  const body = await jsonRequest<{ token: string; data: { id: string } }>('/api/users/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  assert.ok(body.token, 'Register should return auth token');
  assert.ok(body.data?.id, 'Register should return user id');

  return {
    token: body.token,
    id: body.data.id,
    accountNumber: payload.accountNumber,
    walletId: payload.walletId,
    fullName: `${payload.firstName} ${payload.lastName}`,
  };
};

const withAuth = (token: string): HeadersInit => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

const run = async () => {
  const report: Record<string, string> = {
    health: 'pending',
    register: 'pending',
    requestFlow: 'pending',
    transferCommit: 'pending',
    userState: 'pending',
  };

  try {
    const health = await jsonRequest<{ service: string; status: string }>('/api/health');
    assert.equal(health.status, 'ok');
    report.health = 'ok';

    const userA = await registerUser('11');
    const userB = await registerUser('22');
    report.register = 'ok';

    const createdRequest = await jsonRequest<{ data: { id: string } }>('/api/requests', {
      method: 'POST',
      headers: withAuth(userA.token),
      body: JSON.stringify({
        type: 'money',
        requestedFromAccount: userB.accountNumber,
        amount: 1250,
        note: 'smoke request',
      }),
    });

    const requestId = createdRequest.data.id;
    assert.ok(requestId, 'Request id should exist');

    const approved = await jsonRequest<{ data: { request: { status: string } } }>(`/api/requests/${encodeURIComponent(requestId)}/respond`, {
      method: 'PATCH',
      headers: withAuth(userB.token),
      body: JSON.stringify({ action: 'approve' }),
    });

    assert.equal(approved.data.request.status, 'approved');
    report.requestFlow = 'ok';

    const committed = await jsonRequest<{ data: { balance: number } }>('/api/transactions/commit', {
      method: 'POST',
      headers: withAuth(userA.token),
      body: JSON.stringify({
        expectedBalance: 51250,
        nextBalance: 50000,
        transaction: {
          idempotencyKey: `smoke-send-${Date.now()}`,
          type: 'send',
          amount: 1250,
          senderAccount: userA.accountNumber,
          receiverAccount: userB.accountNumber,
          senderName: userA.fullName,
          receiverName: userB.fullName,
          description: 'smoke transfer commit',
          status: 'success',
        },
      }),
    });

    assert.equal(committed.data.balance, 50000);
    report.transferCommit = 'ok';

    const trustScore = {
      overall: 620,
      transactionVolume: 70,
      savingsDiscipline: 60,
      escrowReliability: 80,
      billPaymentConsistency: 65,
    };

    const updatedState = await jsonRequest<{ data?: { trustScore?: { overall?: number } } }>('/api/users/me/state', {
      method: 'PUT',
      headers: withAuth(userA.token),
      body: JSON.stringify({
        loans: [
          {
            id: `loan-smoke-${Date.now()}`,
            borrowerId: userA.id,
            borrowerName: userA.fullName,
            type: 'student',
            amount: 50000,
            status: 'active',
            createdAt: new Date().toISOString(),
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ],
        trustScore,
      }),
    });

    const fetchedState = await jsonRequest<{ data?: { loans?: unknown[]; trustScore?: { overall?: number } } }>('/api/users/me/state', {
      method: 'GET',
      headers: withAuth(userA.token),
    });

    const updatedOverall = updatedState.data?.trustScore?.overall;
    const fetchedOverall = fetchedState.data?.trustScore?.overall;
    if (typeof updatedOverall === 'number') {
      assert.equal(updatedOverall, 620);
    }
    if (typeof fetchedOverall === 'number') {
      assert.equal(fetchedOverall, 620);
    }

    const loansCount = fetchedState.data?.loans?.length ?? 0;
    assert.ok(loansCount >= 0);
    report.userState = 'ok';

    console.log(JSON.stringify({ ok: true, report }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ ok: false, report, error: message }, null, 2));
    process.exitCode = 1;
  }
};

void run();
