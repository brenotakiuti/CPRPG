import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ShieldCheck, UserRoundSearch, Wallet, Package, Send } from 'lucide-react';
import { supabase } from './supabase';
import './PlayerTransfers.css';

type Recipient = { id: string; name: string };
type Entry = { id: string; item_id: string; quantity: number; equipped_slot: string | null; instance_data: Record<string, unknown> };
type Item = { id: string; name: string; category: string; rarity: string; properties: Record<string, unknown> };
type Props = {
  kind: 'money' | 'item';
  character: { id: string; name: string; balance: number };
  inventory: { entries: Entry[]; catalog: Record<string, Item>; refresh: () => Promise<void> };
  onBack: () => void;
};

const money = (value: number) => value.toLocaleString('en-US');
export default function PlayerTransfers({ kind, character, inventory, onBack }: Props) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipient, setRecipient] = useState<string | null>(null);
  const [amount, setAmount] = useState('500');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [step, setStep] = useState<'edit' | 'review' | 'done'>('edit');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true);
    void supabase.rpc('player_transfer_recipients', { p_sender_id: character.id }).then(({ data, error: loadError }) => {
      if (!active) return;
      setRecipients((data ?? []) as Recipient[]);
      setError(loadError?.message ?? '');
      setLoading(false);
    });
    return () => { active = false; };
  }, [character.id]);
  const selectedItem = inventory.entries.find(entry => entry.id === itemId);
  const catalogItem = selectedItem ? inventory.catalog[selectedItem.item_id] : undefined;
  const count = Number(quantity);
  const sum = Number(amount);
  const validMoney = /^\d+$/.test(amount) && Number.isSafeInteger(sum) && sum > 0 && sum <= character.balance;
  const validItem = !!selectedItem && /^\d+$/.test(quantity) && Number.isSafeInteger(count) && count > 0 && count <= selectedItem.quantity && (catalogItem?.category?.toLowerCase() !== 'weapon' || count === 1);
  const valid = kind === 'money' ? validMoney : validItem;
  const target = recipient === null ? 'NPC' : recipients.find(row => row.id === recipient)?.name ?? 'Unknown recipient';
  const availableItems = inventory.entries.filter(row => row.quantity > 0);
  async function confirm() {
    if (!valid || busy) return;
    setBusy(true); setError('');
    const result = kind === 'money'
      ? await supabase.rpc('player_send_money', { p_sender_id: character.id, p_recipient_id: recipient, p_amount: sum })
      : await supabase.rpc('player_send_item', { p_sender_id: character.id, p_recipient_id: recipient, p_inventory_id: itemId, p_quantity: count });
    if (result.error) { setError(result.error.message); setStep('review'); }
    else { if (kind === 'item') await inventory.refresh(); setStep('done'); }
    setBusy(false);
  }
  return <section className="transfer-page">
    <header className="transfer-heading">
      <button type="button" className="transfer-back" onClick={step === 'review' ? () => setStep('edit') : onBack} aria-label="Back"><ArrowLeft size={20} /></button>
      <div><span>NIGHT CITY FINANCIAL NETWORK</span><h2>{kind === 'money' ? 'Transfer funds' : 'Transfer items'}</h2></div>
      <ShieldCheck size={22} className="transfer-shield" aria-hidden="true" />
    </header>
    {kind === 'money' && <div className="transfer-balance"><span>AVAILABLE BALANCE</span><strong>{money(character.balance)} <em>E$</em></strong></div>}
    {step === 'edit' ? <>
      <div className="transfer-section-title">01 / RECIPIENT</div>
      {loading ? <p className="transfer-muted">Loading recipients…</p> : <div className="transfer-recipient-grid">
        {recipients.map(row => <button key={row.id} type="button" className={'transfer-recipient' + (recipient === row.id ? ' selected' : '')} onClick={() => setRecipient(row.id)}>
          <span className="transfer-avatar">{row.name.split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase()}</span>
          {recipient === row.id && <CheckCircle2 className="transfer-check" size={18} />}
          <strong>{row.name}</strong><small>CHARACTER</small>
        </button>)}
        <button type="button" className={'transfer-recipient' + (recipient === null ? ' selected' : '')} onClick={() => setRecipient(null)}>
          <span className="transfer-avatar npc"><UserRoundSearch size={23} /></span>
          {recipient === null && <CheckCircle2 className="transfer-check" size={18} />}
          <strong>NPC</strong><small>NON-PLAYER CHARACTER</small>
        </button>
      </div>}
      {kind === 'money' ? <>
        <div className="transfer-section-title">02 / TRANSFER AMOUNT</div>
        <div className="transfer-input-card"><label htmlFor="transfer-amount">EURODOLLARS</label><div className="transfer-money-input"><input id="transfer-amount" inputMode="numeric" type="text" value={amount} onChange={e => setAmount(e.target.value)} /><strong>E$</strong></div>
          <div className="transfer-presets">{[100, 500, 1000].map(n => <button type="button" key={n} onClick={() => setAmount(String(n))}>{money(n)}</button>)}<button type="button" onClick={() => setAmount(String(character.balance))}>MAX</button></div>
        </div>
      </> : <>
        <div className="transfer-section-title">02 / SELECT ITEM</div>
        <div className="transfer-item-list">{availableItems.map(entry => {
          const item = inventory.catalog[entry.item_id];
          const image = item?.properties?.image;
          return <button key={entry.id} type="button" className={'transfer-item' + (itemId === entry.id ? ' selected' : '')} onClick={() => { setItemId(entry.id); setQuantity('1'); }}>
            <span className="transfer-item-art">{typeof image === 'string' && image ? <img src={image} alt="" /> : <Package size={24} />}</span>
            <span><strong>{item?.name ?? 'Unknown item'}</strong><small>{item?.rarity ?? 'Item'} · {item?.category ?? 'Item'} · ×{entry.quantity}</small></span>
            {itemId === entry.id && <CheckCircle2 size={18} />}
          </button>;
        })}{!availableItems.length && <p className="transfer-muted">No items available to transfer.</p>}</div>
        {selectedItem && <div className="transfer-input-card"><label htmlFor="transfer-quantity">QUANTITY</label><div className="transfer-money-input"><input id="transfer-quantity" inputMode="numeric" value={quantity} onChange={e => setQuantity(e.target.value)} /><button type="button" onClick={() => setQuantity(String(catalogItem?.category?.toLowerCase() === 'weapon' ? 1 : selectedItem.quantity))}>MAX</button></div></div>}
      </>}
      <div className="transfer-summary"><div><span>Recipient</span><strong>{target}</strong></div>{kind === 'money' && <div><span>Transfer fee</span><strong className="transfer-free">FREE</strong></div>}<div className="transfer-total"><span>{kind === 'money' ? 'Total' : 'Quantity'}</span><strong>{valid ? kind === 'money' ? money(sum) + ' E$' : count + ' × ' + (catalogItem?.name ?? 'Item') : '—'}</strong></div></div>
      {error && <p className="transfer-error" role="alert">{error}</p>}
      <button type="button" className="transfer-primary" disabled={!valid || loading} onClick={() => { setError(''); setStep('review'); }}>REVIEW TRANSFER <ArrowRight size={18} /></button>
    </> : step === 'review' ? <div className="transfer-result"><ShieldCheck size={46} /><h3>Confirm transfer</h3><p>You are about to send</p><strong>{kind === 'money' ? money(sum) + ' E$' : count + ' × ' + (catalogItem?.name ?? 'Item')}</strong><p>to <b>{target}</b></p>{error && <p className="transfer-error" role="alert">{error}</p>}<button type="button" className="transfer-primary" disabled={busy} onClick={() => void confirm()}>{busy ? 'PROCESSING…' : 'CONFIRM TRANSFER'} <Send size={17} /></button><button type="button" className="transfer-secondary" disabled={busy} onClick={() => setStep('edit')}>EDIT TRANSFER</button></div>
      : <div className="transfer-result"><CheckCircle2 size={50} className="transfer-success" /><h3>Transfer complete</h3><p>{kind === 'money' ? money(sum) + ' E$' : count + ' × ' + (catalogItem?.name ?? 'Item')} sent to {target}</p><button type="button" className="transfer-primary" onClick={onBack}>BACK TO DASHBOARD <ArrowRight size={17} /></button></div>}
    <footer className="transfer-footer"><Wallet size={13} /> SECURE TRANSACTION // NIGHT CITY 2077</footer>
  </section>;
}
