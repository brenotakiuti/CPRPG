import { useEffect, useState } from 'react';
import { supabase } from './supabase';

type Character = {
  id: string;
  name: string;
  balance: number;
};

type BankProps = {
  campaignId: string;
};

const GM_ACCOUNT = 'gm';

export default function Bank({ campaignId }: BankProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [senderId, setSenderId] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [amount, setAmount] = useState('500');
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setCharacters([]);
    setSenderId('');
    setRecipientId('');
    setAmount('500');
    setSuccess(false);
    setMessage('');

    async function loadCharacters() {
      const { data, error } = await supabase
        .from('characters')
        .select('id, name, balance')
        .eq('campaign_id', campaignId)
        .order('name');

      if (!active) return;
      if (error) {
        setMessage(error.message);
      } else {
        const next = data ?? [];
        setCharacters(next);
        setRecipientId((current) =>
          current && (current === GM_ACCOUNT || next.some((c) => c.id === current))
            ? current : ''
        );
      }
    }

    const channel = supabase
      .channel(`bank-updates-${campaignId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'characters',
        filter: `campaign_id=eq.${campaignId}`,
      }, () => { void loadCharacters(); })
      .subscribe();

    void loadCharacters();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [campaignId]);

  const accounts = [
    { id: GM_ACCOUNT, name: 'GM / Bank', balance: null as number | null },
    ...characters.map((c) => ({ id: c.id, name: c.name, balance: c.balance })),
  ];
  const sender = accounts.find((a) => a.id === senderId);
  const recipient = accounts.find((a) => a.id === recipientId);
  const numericAmount = Number(amount);
  const amountValid = amount.trim() !== '' && Number.isSafeInteger(numericAmount) && numericAmount > 0;
  const insufficient = senderId !== GM_ACCOUNT && sender !== undefined &&
    sender.balance !== null && amountValid && numericAmount > sender.balance;
  const valid = !!sender && !!recipient && senderId !== recipientId && amountValid && !insufficient;
  const kind = senderId === GM_ACCOUNT ? 'deposit' : recipientId === GM_ACCOUNT ? 'withdrawal' : 'transfer';

  const format = (value: number) => value.toLocaleString('en-US');

  async function executeTransfer() {
    if (busy || !valid) return;
    setBusy(true);
    setSuccess(false);
    setMessage('');

    try {
      let error: { message: string } | null = null;

      if (senderId === GM_ACCOUNT) {
        const result = await supabase.rpc('grant_money', {
          character_id: recipientId,
          grant_amount: numericAmount,
        });
        error = result.error;
      } else if (recipientId === GM_ACCOUNT) {
        const result = await supabase.rpc('withdraw_money', {
          p_character_id: senderId,
          p_amount: numericAmount,
        });
        error = result.error;
      } else {
        const result = await supabase.rpc('transfer_money', {
          sender_id: senderId,
          recipient_id: recipientId,
          transfer_amount: numericAmount,
        });
        error = result.error;
      }

      if (error) {
        setMessage(error.message);
        return;
      }

      const { data, error: refreshError } = await supabase
        .from('characters')
        .select('id, name, balance')
        .eq('campaign_id', campaignId)
        .order('name');

      if (!refreshError && data) setCharacters(data);
      setSuccess(true);
      if (refreshError) setMessage('Transaction succeeded, but balances could not be refreshed.');
    } catch {
      setMessage('Transaction could not be completed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const explanation = kind === 'deposit'
    ? `Create ${format(numericAmount || 0)} E$ in ${recipient?.name ?? 'the recipient'}'s account.`
    : kind === 'withdrawal'
      ? `Remove ${format(numericAmount || 0)} E$ from ${sender?.name ?? 'the sender'}'s account.`
      : `Move ${format(numericAmount || 0)} E$ from ${sender?.name ?? 'the sender'} to ${recipient?.name ?? 'the recipient'}.`;

  return (
    <section className="gm-bank" aria-label="Bank Transfer">
      <div className="gm-bank-heading">
        <span className="gm-bank-context">Transfer funds between campaign accounts</span>
        <span className="gm-bank-badge">GM Control</span>
      </div>
      <div className="gm-bank-accounts">
        <div className="gm-bank-field">
          <label htmlFor="bank-from">FROM</label>
          <select id="bank-from" value={senderId} disabled={busy}
            onChange={(event) => { const next = event.target.value; setSenderId(next); if (recipientId === next) setRecipientId(''); setSuccess(false); setMessage(''); }}>
            <option value="" disabled>Select character</option>
            {accounts.map((a) =>
              <option key={a.id} value={a.id}>{a.name}</option>
            )}
          </select>
          <small>{sender?.balance === null ? 'Unlimited funds' : sender ? `Balance: ${format(sender.balance!)} E$` : ''}</small>
        </div>
        <div className="gm-bank-field">
          <label htmlFor="bank-to">TO</label>
          <select id="bank-to" value={recipientId} disabled={busy || !senderId}
            onChange={(event) => { setRecipientId(event.target.value); setSuccess(false); setMessage(''); }}>
            <option value="" disabled>Select character</option>
            {accounts.filter((a) => a.id !== senderId).map((a) =>
              <option key={a.id} value={a.id}>{a.name}</option>
            )}
          </select>
          <small>{recipient?.balance === null ? 'Unlimited funds' : recipient ? `Balance: ${format(recipient.balance!)} E$` : ''}</small>
        </div>
      </div>
      <div className="gm-bank-field">
        <label htmlFor="bank-amount">AMOUNT (E$)</label>
        <input id="bank-amount" type="number" min="1" step="1" value={amount}
          disabled={busy} onChange={(event) => { setAmount(event.target.value); setSuccess(false); setMessage(''); }}
          placeholder="Enter amount" />
      </div>
      <div className="gm-bank-description">
        <strong>{kind === 'deposit' ? '↓ Deposit funds' : kind === 'withdrawal' ? '↑ Withdraw funds' : '↔ Transfer between characters'}</strong>
        <p>{explanation}</p>
      </div>
      {insufficient && <p className="gm-bank-error" role="alert">Insufficient funds in the sender's account.</p>}
      {message && <p className="gm-bank-error" role="alert">{message}</p>}
      <div className="gm-bank-submit">
        <button type="button" disabled={!valid || busy} onClick={() => void executeTransfer()}>
          {busy ? 'Processing...' : 'Execute Transfer →'}
        </button>
        {success && <span className="gm-bank-success" role="status" aria-label="Transaction successful" title="Transaction successful">
          <svg width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><path d="m7.5 12 3 3 6-6" />
          </svg>
        </span>}
      </div>
    </section>
  );
}
