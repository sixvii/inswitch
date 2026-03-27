import { env } from '../config/env.js';

class UpstreamHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface CreatePayBillInput {
  amount: string;
  redirectUrl: string;
  customerId: string;
  customerEmail: string;
  currencyCode?: string;
}

interface VerifyTransactionInput {
  transactionReference: string;
  amount: string;
}

let cachedAccessToken = '';
let cachedAccessTokenExpiry = 0;
let inflightAccessTokenPromise: Promise<string> | null = null;

const safeParseJson = async (response: Response) => {
  const raw = await response.text();
  if (!raw) return {};

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { message: raw };
  }
};

const getAccessTokenFromGateway = async (): Promise<string> => {
  if (env.INTERSWITCH_ACCESS_TOKEN) {
    return env.INTERSWITCH_ACCESS_TOKEN;
  }

  const now = Date.now();
  if (cachedAccessToken && cachedAccessTokenExpiry > now) {
    return cachedAccessToken;
  }

  if (inflightAccessTokenPromise) {
    return inflightAccessTokenPromise;
  }

  const tokenUrl = env.INTERSWITCH_TOKEN_URL || `${env.INTERSWITCH_BASE_URL}/passport/oauth/token`;

  inflightAccessTokenPromise = (async () => {
    const credentials = `${env.INTERSWITCH_CLIENT_ID}:${env.INTERSWITCH_SECRET}`;
    const encoded = Buffer.from(credentials).toString('base64');

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${encoded}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
    });

    const body = await safeParseJson(response);
    const token = String(body?.access_token || '').trim();
    const expiresIn = Number(body?.expires_in || 3600);

    if (!response.ok || !token) {
      const detail = String(body?.error_description || body?.error || body?.message || 'Unable to obtain Interswitch access token');
      throw new UpstreamHttpError(502, `Interswitch token request failed: ${detail}`);
    }

    const ttlMs = Number.isFinite(expiresIn) && expiresIn > 0 ? Math.max((expiresIn - 30) * 1000, 30_000) : 3_600_000;
    cachedAccessToken = token;
    cachedAccessTokenExpiry = Date.now() + ttlMs;
    return token;
  })();

  try {
    return await inflightAccessTokenPromise;
  } finally {
    inflightAccessTokenPromise = null;
  }
};

const buildAuthHeaders = async (): Promise<Record<string, string>> => {
  if (env.INTERSWITCH_AUTH_MODE === 'none') {
    return {};
  }

  if (env.INTERSWITCH_AUTH_MODE === 'bearer') {
    const token = await getAccessTokenFromGateway();
    return { Authorization: `Bearer ${token}` };
  }

  const credentials = `${env.INTERSWITCH_CLIENT_ID}:${env.INTERSWITCH_SECRET}`;
  const encoded = Buffer.from(credentials).toString('base64');
  return { Authorization: `Basic ${encoded}` };
};

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);
  const body = await safeParseJson(response);

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new UpstreamHttpError(502, 'Interswitch gateway authorization failed');
    }
    if (response.status === 404 || response.status === 405) {
      throw new UpstreamHttpError(
        502,
        'Interswitch pay-bill endpoint contract mismatch for this merchant profile. Contact Interswitch support for the enabled route/method.',
      );
    }
    const message = String(body?.message || body?.error || 'Interswitch request failed');
    throw new UpstreamHttpError(response.status, message);
  }

  return body as T;
};

export const getCheckoutConfig = () => ({
  merchantCode: env.INTERSWITCH_MERCHANT_CODE,
  payItemId: env.INTERSWITCH_PAY_ITEM_ID,
  mode: env.INTERSWITCH_MODE,
  inlineCheckoutScriptUrl: env.INTERSWITCH_INLINE_SCRIPT_URL,
  redirectCheckoutUrl: env.INTERSWITCH_REDIRECT_BASE_URL,
});

export const createPayBillLink = async (input: CreatePayBillInput) => {
  const payBillMode = env.INTERSWITCH_PAY_BILL_MODE || (env.INTERSWITCH_MODE === 'TEST' ? 'mock' : 'live');

  if (payBillMode === 'mock') {
    const transactionReference = `ISW-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const checkoutUrl = new URL(env.INTERSWITCH_REDIRECT_BASE_URL);
    checkoutUrl.searchParams.set('txnref', transactionReference);
    checkoutUrl.searchParams.set('merchant_code', env.INTERSWITCH_MERCHANT_CODE);
    checkoutUrl.searchParams.set('pay_item_id', env.INTERSWITCH_PAY_ITEM_ID);

    return {
      transactionReference,
      merchantCode: env.INTERSWITCH_MERCHANT_CODE,
      payItemId: env.INTERSWITCH_PAY_ITEM_ID,
      payableCode: env.INTERSWITCH_PAY_ITEM_ID,
      amount: Number(input.amount),
      redirectUrl: input.redirectUrl,
      customerId: input.customerId,
      customerEmail: input.customerEmail,
      currencyCode: input.currencyCode || '566',
      checkoutUrl: checkoutUrl.toString(),
      paymentUrl: checkoutUrl.toString(),
      mode: 'mock',
    };
  }

  const payload = {
    merchantCode: env.INTERSWITCH_MERCHANT_CODE,
    payableCode: env.INTERSWITCH_PAY_ITEM_ID,
    amount: input.amount,
    redirectUrl: input.redirectUrl,
    customerId: input.customerId,
    currencyCode: input.currencyCode || '566',
    customerEmail: input.customerEmail,
  };

  const url = `${env.INTERSWITCH_BASE_URL}/collections/api/v1/pay-bill`;
  const authHeaders = await buildAuthHeaders();
  return requestJson<Record<string, unknown>>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(payload),
  });
};

export const verifyTransaction = async (input: VerifyTransactionInput) => {
  const params = new URLSearchParams({
    merchantcode: env.INTERSWITCH_MERCHANT_CODE,
    transactionreference: input.transactionReference,
    amount: input.amount,
  });

  const url = `${env.INTERSWITCH_BASE_URL}/collections/api/v1/gettransaction.json?${params.toString()}`;
  const authHeaders = await buildAuthHeaders();
  return requestJson<Record<string, unknown>>(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
  });
};
