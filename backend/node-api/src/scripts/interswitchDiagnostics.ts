import { config } from 'dotenv';

config();

type CheckResult = {
  name: string;
  pass: boolean;
  status: number | null;
  detail: string;
};

const readEnv = (key: string, fallback = '') => (process.env[key] || fallback).trim();

const required = (key: string): string => {
  const value = readEnv(key);
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const getBodyPreview = async (response: Response): Promise<string> => {
  const raw = await response.text().catch(() => '');
  if (!raw) return '(empty body)';
  return raw.length > 240 ? `${raw.slice(0, 240)}...` : raw;
};

const run = async () => {
  try {
    const merchantCode = required('INTERSWITCH_MERCHANT_CODE');
    const payableCode = readEnv('INTERSWITCH_PAYABLE_CODE', readEnv('INTERSWITCH_PAY_ITEM_ID'));
    const clientId = required('INTERSWITCH_CLIENT_ID');
    const secret = required('INTERSWITCH_SECRET');

    if (!payableCode) {
      throw new Error('Missing payable code. Set INTERSWITCH_PAYABLE_CODE or INTERSWITCH_PAY_ITEM_ID.');
    }

    const baseUrl = readEnv('INTERSWITCH_BASE_URL', 'https://qa.interswitchng.com');
    const inlineScriptUrl = readEnv('INTERSWITCH_INLINE_SCRIPT_URL', 'https://newwebpay.qa.interswitchng.com/inline-checkout.js');
    const redirectBaseUrl = readEnv('INTERSWITCH_REDIRECT_BASE_URL', 'https://newwebpay.qa.interswitchng.com/collections/w/pay');
    const redirectUrl = readEnv('DIAG_REDIRECT_URL', 'https://example.com/payment-response');
    const customerEmail = readEnv('DIAG_CUSTOMER_EMAIL', 'test@example.com');
    const amount = readEnv('DIAG_AMOUNT', '10000');
    const currencyCode = readEnv('DIAG_CURRENCY_CODE', '566');
    const authMode = readEnv('INTERSWITCH_AUTH_MODE', 'basic');
    const payBillMode = readEnv('INTERSWITCH_PAY_BILL_MODE', readEnv('INTERSWITCH_MODE', 'TEST') === 'TEST' ? 'mock' : 'live');

    const authHeaders: Record<string, string> = {};
    if (authMode === 'basic') {
      authHeaders.Authorization = `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`;
    } else if (authMode === 'bearer') {
      const accessToken = required('INTERSWITCH_ACCESS_TOKEN');
      authHeaders.Authorization = `Bearer ${accessToken}`;
    }

    const results: CheckResult[] = [];

    // Path A: Inline script availability (required for opening checkout widget).
    const scriptResponse = await fetch(inlineScriptUrl, { method: 'GET' });
    const scriptDetail = scriptResponse.ok
      ? 'Inline checkout script is reachable.'
      : `Inline script request failed: ${await getBodyPreview(scriptResponse)}`;

    results.push({
      name: 'Path A (inline script)',
      pass: scriptResponse.ok,
      status: scriptResponse.status,
      detail: scriptDetail,
    });

    // Path B helper: redirect endpoint reachability (informational).
    const redirectResponse = await fetch(redirectBaseUrl, { method: 'GET', redirect: 'manual' });
    results.push({
      name: 'Redirect endpoint reachability',
      pass: redirectResponse.status < 500,
      status: redirectResponse.status,
      detail: redirectResponse.status < 500
        ? 'Redirect endpoint is reachable.'
        : `Redirect endpoint failed: ${await getBodyPreview(redirectResponse)}`,
    });

    // Path C: Live API check or mock-mode check.
    if (payBillMode === 'mock') {
      results.push({
        name: 'Path C (pay-bill API)',
        pass: true,
        status: 200,
        detail: 'Mock mode enabled: checkout URL generation is local (no external pay-bill API call).',
      });
    } else {
      const payBillResponse = await fetch(`${baseUrl}/collections/api/v1/pay-bill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          merchantCode,
          payableCode,
          amount,
          redirectUrl,
          customerId: customerEmail,
          customerEmail,
          currencyCode,
        }),
      });

      const payBillPreview = await getBodyPreview(payBillResponse);
      results.push({
        name: 'Path C (pay-bill API)',
        pass: payBillResponse.ok,
        status: payBillResponse.status,
        detail: payBillResponse.ok
          ? 'Pay-bill API accepted the request.'
          : `Pay-bill API rejected request: ${payBillPreview}`,
      });
    }

    const output = {
      ok: results.every((entry) => entry.pass),
      config: {
        baseUrl,
        inlineScriptUrl,
        redirectBaseUrl,
        merchantCode,
        payableCode,
        mode: readEnv('INTERSWITCH_MODE', 'TEST'),
        authMode,
        payBillMode,
      },
      checks: results,
      hint: 'If Path C fails with unauthorized, compare credentials and merchant provisioning with a known working account.',
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ ok: false, error: message }, null, 2));
    process.exitCode = 1;
  }
};

void run();
