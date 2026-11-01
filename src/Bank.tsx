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

export default function Bank({ campaignId }: BankProps) {
  const [characters, setCharacters] = useState<Character[]>([]);

  const [senderId, setSenderId] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');

  const [grantCharacterId, setGrantCharacterId] = useState('');
  const [grantAmount, setGrantAmount] = useState('');

  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadCharacters() {
    const { data, error } = await supabase
      .from('characters')
      .select('id, name, balance')
      .eq('campaign_id', campaignId)
      .order('name');

    if (error) {
      setMessage(error.message);
    } else {
      setCharacters(data ?? []);
    }
  }

  useEffect(() => {
    setCharacters([]);
    setSenderId('');
    setRecipientId('');
    setGrantCharacterId('');
    setTransferAmount('');
    setGrantAmount('');
    setMessage('');

    loadCharacters();

    const channel = supabase
      .channel(`bank-updates-${campaignId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'characters',
          filter: `campaign_id=eq.${campaignId}`,
        },
        () => {
          loadCharacters();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campaignId]);

  function validAmount(value: string) {
    const amount = Number(value);

    return Number.isSafeInteger(amount) && amount > 0;
  }

  async function handleTransfer() {
    if (!senderId || !recipientId) {
      setMessage('Select both characters.');
      return;
    }

    if (senderId === recipientId) {
      setMessage('Sender and recipient must be different.');
      return;
    }

    if (!validAmount(transferAmount)) {
      setMessage('Enter a positive whole number.');
      return;
    }

    setBusy(true);
    setMessage('');

    const { error } = await supabase.rpc('transfer_money', {
      sender_id: senderId,
      recipient_id: recipientId,
      transfer_amount: Number(transferAmount),
    });

    if (error) {
      setMessage(`Transfer failed: ${error.message}`);
    } else {
      setMessage('Transfer completed successfully.');
      setTransferAmount('');
      await loadCharacters();
    }

    setBusy(false);
  }

  async function handleGrant() {
    if (!grantCharacterId) {
      setMessage('Select a character.');
      return;
    }

    if (!validAmount(grantAmount)) {
      setMessage('Enter a positive whole number.');
      return;
    }

    setBusy(true);
    setMessage('');

    const { error } = await supabase.rpc('grant_money', {
      character_id: grantCharacterId,
      grant_amount: Number(grantAmount),
    });

    if (error) {
      setMessage(`Grant failed: ${error.message}`);
    } else {
      setMessage('Funds granted successfully.');
      setGrantAmount('');
      await loadCharacters();
    }

    setBusy(false);
  }

  return (
    <div className="bank-content">
      <h2>Night City Bank</h2>

      <h3>Character Balances</h3>

      {characters.map((character) => (
        <p key={character.id}>
          {character.name}: {character.balance} €$
        </p>
      ))}

      <h3>Transfer Funds</h3>

      <label>Sender</label>
      <select value={senderId} onChange={(e) => setSenderId(e.target.value)}>
        <option value="">Select sender</option>
        {characters.map((character) => (
          <option key={character.id} value={character.id}>
            {character.name}
          </option>
        ))}
      </select>

      <label>Recipient</label>
      <select
        value={recipientId}
        onChange={(e) => setRecipientId(e.target.value)}
      >
        <option value="">Select recipient</option>
        {characters.map((character) => (
          <option key={character.id} value={character.id}>
            {character.name}
          </option>
        ))}
      </select>

      <label>Transfer amount</label>
      <input
        type="number"
        min="1"
        step="1"
        value={transferAmount}
        onChange={(e) => setTransferAmount(e.target.value)}
        placeholder="Amount"
      />

      <button onClick={handleTransfer} disabled={busy}>
        Transfer Funds
      </button>

      <hr />

      <h3>Give Funds</h3>

      <label>Character</label>
      <select
        value={grantCharacterId}
        onChange={(e) => setGrantCharacterId(e.target.value)}
      >
        <option value="">Select character</option>
        {characters.map((character) => (
          <option key={character.id} value={character.id}>
            {character.name}
          </option>
        ))}
      </select>

      <label>Amount to give</label>
      <input
        type="number"
        min="1"
        step="1"
        value={grantAmount}
        onChange={(e) => setGrantAmount(e.target.value)}
        placeholder="Amount"
      />

      <button onClick={handleGrant} disabled={busy}>
        Give Funds
      </button>

      <p className="transfer-message">{message}</p>
    </div>
  );
}
