import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import PinInput from '@/components/ui/PinInput';
import { Check } from 'lucide-react';
import {
  createCommittedBackendTransaction,
  createIdempotencyKey,
  fetchInterswitchQuickstartConfig,
  fetchUserByAccount,
  verifyInterswitchTransaction,
} from '@/lib/backendApi';
import TransactionSuccessAction from '@/components/ui/TransactionSuccessAction';

declare global {
  interface Window {
    webpayCheckout?: (payload: Record<string, unknown>) => void;
  }
}

type SendState = {
  receiverAccount?: string;
  receiverName?: string;
};

const SendMoneyPage = () => {
  const location = useLocation();
  const { currentUser, balance, setBalance, addTransaction, findUserByAccount } = useStore();

  const [step, setStep] = useState<'form' | 'pin' | 'checkout' | 'success'>('form');
  const [receiverAccount, setReceiverAccount] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [interswitchReference, setInterswitchReference] = useState('');
  const [interswitchPaymentUrl, setInterswitchPaymentUrl] = useState('');
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  const ensureInlineCheckoutScript = async (scriptUrl: string) => {
    const existing = document.querySelector(`script[src="${scriptUrl}"]`) as HTMLScriptElement | null;
    if (existing) return;

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptUrl;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Unable to load Interswitch checkout script'));
      document.body.appendChild(script);
    });
  };

  const launchInlineCheckoutFallback = async (amountKobo: number) => {
    const config = await fetchInterswitchQuickstartConfig();
    await ensureInlineCheckoutScript(config.inlineCheckoutScriptUrl);

    if (!window.webpayCheckout) {
      throw new Error('Interswitch inline checkout is not available right now');
    }

    const txnRef = `send-${Date.now()}`;
    setInterswitchReference(txnRef);
    setInterswitchPaymentUrl('');
    setStep('checkout');

    window.webpayCheckout({
      merchant_code: config.merchantCode,
      pay_item_id: config.payItemId,
      txn_ref: txnRef,
      amount: amountKobo,
      currency: 566,
      cust_email: currentUser?.email || 'customer@example.com',
      site_redirect_url: `${window.location.origin}/transact`,
      mode: config.mode,
      onComplete: () => {
        setError('Payment window completed. Tap "I Have Completed Payment" to verify and finish transfer.');
      },
    });
  };

  const isInterswitchVerified = (payload: Record<string, unknown>) => {
    const candidateValues = [
      payload.status,
      payload.paymentStatus,
      payload.transactionStatus,
      payload.responseCode,
      payload.respCode,
      payload.code,
      payload.ResponseCode,
      payload.responceCode,
    ]
      .filter((entry) => entry !== undefined && entry !== null)
      .map((entry) => String(entry).trim().toLowerCase());

    return candidateValues.some((value) => (
      value === '00' ||
      value === 'success' ||
      value === 'successful' ||
      value === 'approved' ||
      value === 'paid' ||
      value === 'completed'
    ));
  };

  const handleAccountLookup = useCallback(async (account: string) => {
    setReceiverAccount(account);
    if (account.length === 10) {
      const user = findUserByAccount(account);
      if (user) {
        setReceiverName(`${user.firstName} ${user.lastName}`);
      } else {
        try {
          const remote = await fetchUserByAccount(account);
          setReceiverName(`${remote.firstName} ${remote.lastName}`);
        } catch {
          setReceiverName('');
        }
      }
    } else {
      setReceiverName('');
    }
  }, [findUserByAccount]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const accountFromQuery = (params.get('account') || params.get('accountNumber') || '').trim();
    const state = (location.state as SendState | null) || null;
    const stateAccount = state?.receiverAccount || '';
    const rawAccount = accountFromQuery || stateAccount;
    if (!rawAccount) return;

    const account = rawAccount.replace(/\D/g, '').slice(0, 10);
    if (!/^\d{10}$/.test(account)) return;

    void handleAccountLookup(account);
  }, [handleAccountLookup, location.search, location.state]);

  const handleSend = () => {
    if (!receiverAccount || !amount) {
      setError('Please fill all required fields');
      return;
    }
    if (receiverAccount.length !== 10) {
      setError('Enter a valid 10-digit receiver account number');
      return;
    }
    if (!receiverName) {
      setError('Receiver account not found');
      return;
    }
    if (Number(amount) > balance) {
      setError('Insufficient balance');
      return;
    }
    if (receiverAccount === currentUser?.accountNumber) {
      setError('Cannot send to yourself');
      return;
    }
    setError('');
    setStep('pin');
  };

  const handlePinConfirm = async (pin: string) => {
    if (pin !== currentUser?.pin) {
      setError('Incorrect PIN');
      return;
    }

    try {
      const amountKobo = Math.round(Number(amount) * 100);
      await launchInlineCheckoutFallback(amountKobo);
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to open Interswitch checkout right now. Please try again.');
    }
  };

  const handleVerifyAndCompleteTransfer = async () => {
    if (!interswitchReference) {
      setError('Missing Interswitch reference. Restart payment.');
      return;
    }

    setVerifyingPayment(true);
    setError('');

    try {
      const amt = Number(amount);
      const verification = await verifyInterswitchTransaction(interswitchReference, String(Math.round(amt * 100)));

      if (!isInterswitchVerified(verification)) {
        setError('Payment has not been confirmed by Interswitch yet. Complete payment and retry verification.');
        return;
      }

      const committed = await createCommittedBackendTransaction({
        idempotencyKey: createIdempotencyKey('send'),
        type: 'send',
        amount: amt,
        senderAccount: currentUser?.accountNumber || '',
        receiverAccount,
        senderName: `${currentUser?.firstName} ${currentUser?.lastName}`,
        receiverName: receiverName || receiverAccount,
        description,
        status: 'success',
      }, balance, balance - amt);

      setBalance(committed.balance);
      addTransaction(committed.transaction);
      setTransactionId(committed.transaction.id);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to verify payment right now.');
    } finally {
      setVerifyingPayment(false);
    }
  };

  if (step === 'success') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center animate-scale-in">
        <div className="w-20 h-20 rounded-full bg-[#0E5485] flex items-center justify-center mb-6 animate-pulse-success">
          <Check className="w-6 h-6 text-success-foreground" />
        </div>
        <h2 className="text-[17px] font-bold text-foreground mb-2">Payment Successful!</h2>
        <p className="text-muted-foreground mb-2">₦{Number(amount).toLocaleString()} sent to</p>
        <p className="font-semibold text-foreground mb-8">{receiverName || receiverAccount}</p>
        <TransactionSuccessAction
          transactionId={transactionId}
          className="py-2 px-8 rounded-[10px] gradient-primary text-primary-foreground font-[500]"
          receiptLabel="Done"
        />
      </div>
    );
  }

  if (step === 'pin') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center animate-fade-in">
        <h2 className="text-xl font-bold text-foreground mb-2">Confirm Payment</h2>
        <p className="text-muted-foreground mb-2">Sending ₦{Number(amount).toLocaleString()} to</p>
        <p className="font-semibold text-foreground mb-8">{receiverName || receiverAccount}</p>
        <PinInput label="Enter your PIN" onComplete={handlePinConfirm} />
        {error && <p className="text-destructive text-sm mt-4">{error}</p>}
      </div>
    );
  }

  if (step === 'checkout') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center animate-fade-in text-center">
        <p className="text-[11px] uppercase tracking-wide text-[#0C4168] font-semibold mb-2">
          Powered by Interswitch (Inline Checkout)
        </p>
        <h2 className="text-xl font-bold text-foreground mb-2">Complete Payment on Interswitch</h2>
        <p className="text-muted-foreground mb-1">Amount: ₦{Number(amount).toLocaleString()}</p>
        <p className="text-muted-foreground mb-1">Receiver: {receiverName || receiverAccount}</p>
        <p className="text-xs text-muted-foreground mb-6">Reference: {interswitchReference}</p>

        <div className="flex flex-col gap-3 w-full max-w-sm">
          <button
            type="button"
            onClick={() => {
              if (interswitchPaymentUrl) {
                window.open(interswitchPaymentUrl, '_blank', 'noopener,noreferrer');
                return;
              }
              void launchInlineCheckoutFallback(Math.round(Number(amount) * 100));
            }}
            className="w-full py-3 rounded-[10px] gradient-primary text-primary-foreground font-semibold"
          >
            {interswitchPaymentUrl ? 'Open Interswitch Payment' : 'Open Interswitch Checkout'}
          </button>
          <button
            type="button"
            onClick={handleVerifyAndCompleteTransfer}
            disabled={verifyingPayment}
            className="w-full py-3 rounded-[10px] border border-border text-foreground font-semibold disabled:opacity-50"
          >
            {verifyingPayment ? 'Verifying...' : 'I Have Completed Payment'}
          </button>
          <button
            type="button"
            onClick={() => setStep('form')}
            className="w-full py-3 rounded-[10px] bg-[#F2F5F7] text-foreground font-semibold"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-destructive text-sm mt-4">{error}</p>}
      </div>
    );
  }

  return (
    <div className="py-4 animate-fade-in">
      <h1 className="text-[17px] font-bold text-foreground mb-6">Send Money</h1>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Receiver Account Number</label>
          <input type="text" value={receiverAccount} onChange={(e) => void handleAccountLookup(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="Enter 10-digit account number" inputMode="numeric"
            className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-border text-foreground outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Receiver Full Name</label>
          <input
            type="text"
            value={receiverName}
            readOnly
            placeholder="Receiver name will appear automatically"
            className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-border text-foreground outline-none"
          />
          {receiverAccount.length === 10 && !receiverName && (
            <p className="text-destructive text-sm mt-2 font-medium">Receiver account not found</p>
          )}
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Amount (NGN)</label>
          <input type="text" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            placeholder="Enter amount" inputMode="numeric"
            className="w-full p-4 rounded-[10px] border bg-[#F2F5F7] border-border text-foreground outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Description (Optional)</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this for?"
            className="w-full p-4 rounded-[10px] border bg-[#F2F5F7] border-border text-foreground outline-none focus:border-primary" />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <button onClick={handleSend} className="w-full md:py-4 py-3 rounded-[10px] gradient-primary text-primary-foreground font-semibold text-[15px] mt-4">
          Send
        </button>
      </div>
    </div>
  );
};

export default SendMoneyPage;
