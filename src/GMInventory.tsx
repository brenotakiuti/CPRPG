import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, CheckCircle2 } from 'lucide-react';
import { supabase } from './supabase';
import ItemCatalog from './ItemCatalog';
import './GMInventory.css';

type Character = { id: string; name: string };
type CatalogItem = { id: string; name: string; category: string; rarity: string; gm_id: string | null };
type InventoryEntry = { id: string; item_id: string; quantity: number; equipped_slot: string | null };
const WORLD = 'world';

export default function GMInventory({ campaignId }: { campaignId: string }) {
  const [tab, setTab] = useState<'catalog' | 'trading'>('catalog');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [inventory, setInventory] = useState<InventoryEntry[]>([]);
  const [sender, setSender] = useState(WORLD);
  const [recipient, setRecipient] = useState('');
  const [selectedItem, setSelectedItem] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const loadInventory = useCallback(async () => {
    if (sender === WORLD) { setInventory([]); return; }
    const { data, error: readError } = await supabase.from('character_inventory')
      .select('id,item_id,quantity,equipped_slot').eq('character_id', sender).order('created_at');
    if (readError) { setError(readError.message); return; }
    setInventory((data ?? []) as InventoryEntry[]);
  }, [sender]);

  useEffect(() => {
    let active = true;
    setCharacters([]); setCatalog([]); setSender(WORLD); setRecipient('');
    setSelectedItem(''); setInventory([]); setError(''); setSuccess(false);
    async function load() {
      setLoading(true);
      const [c, i] = await Promise.all([
        supabase.from('characters').select('id,name').eq('campaign_id', campaignId).order('name'),
        supabase.from('items').select('id,name,category,rarity,gm_id').order('name'),
      ]);
      if (!active) return;
      setLoading(false);
      if (c.error || i.error) { setError(c.error?.message ?? i.error?.message ?? 'Unable to load trading data'); return; }
      setCharacters((c.data ?? []) as Character[]);
      setCatalog((i.data ?? []) as CatalogItem[]);
    }
    void load();
    return () => { active = false; };
  }, [campaignId]);

  useEffect(() => {
    setSelectedItem(''); setQuantity('1'); setSuccess(false); setError('');
    void loadInventory();
  }, [loadInventory]);

  useEffect(() => {
    if (tab !== 'trading' || sender === WORLD) return;
    const channel = supabase.channel('gm-trading-' + campaignId + '-' + sender)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'character_inventory', filter: 'character_id=eq.' + sender },
        () => { void loadInventory(); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [campaignId, sender, tab, loadInventory]);

  const accounts = [{ id: WORLD, name: 'GM / World' }, ...characters];
  const kind = sender === WORLD ? 'Give' : recipient === WORLD ? 'Confiscate' : 'Transfer';
  const options = sender === WORLD
    ? catalog.map(item => ({ id: item.id, item, quantity: null as number | null, equipped: false }))
    : inventory.map(entry => ({ id: entry.id, item: catalog.find(item => item.id === entry.item_id), quantity: entry.quantity, equipped: entry.equipped_slot !== null }));
  const selected = options.find(option => option.id === selectedItem);
  const numericQuantity = Number(quantity);
  const quantityValid = quantity.trim() !== '' && Number.isSafeInteger(numericQuantity) && numericQuantity > 0;
  const valid = !loading && !busy && !!recipient && sender !== recipient && !!selected && !selected.equipped &&
    quantityValid && (selected.quantity === null || numericQuantity <= selected.quantity) &&
    (sender === WORLD || selected.item?.category !== 'Weapon' || numericQuantity === 1);

  async function execute() {
    if (!valid || !selected?.item) return;
    setBusy(true); setError(''); setSuccess(false);
    const { error: tradeError } = await supabase.rpc('trade_character_item', {
      p_campaign_id: campaignId,
      p_sender_id: sender === WORLD ? null : sender,
      p_recipient_id: recipient === WORLD ? null : recipient,
      p_item_id: selected.item.id,
      p_quantity: numericQuantity,
      p_inventory_id: sender === WORLD ? null : selected.id,
    });
    if (tradeError) {
      setError(tradeError.message);
    } else {
      setSuccess(true);
      setSelectedItem('');
      setQuantity('1');
      await loadInventory();
    }
    setBusy(false);
  }

  return <section className="gm-inventory">
    <div className="gm-inventory-tabs" role="tablist" aria-label="Inventory tools">
      <button type="button" role="tab" aria-selected={tab === 'catalog'} className={tab === 'catalog' ? 'active' : ''} onClick={() => setTab('catalog')}>Item Catalog</button>
      <button type="button" role="tab" aria-selected={tab === 'trading'} className={tab === 'trading' ? 'active' : ''} onClick={() => setTab('trading')}><ArrowLeftRight size={17}/> Trading</button>
    </div>
    <div style={{ display: tab === 'catalog' ? undefined : 'none' }}><ItemCatalog /></div>
    {tab === 'trading' && <div className="gm-trading">
      <header><h2>Trading</h2><p>Give, confiscate, or transfer items between campaign characters.</p></header>
      <div className="gm-trading-accounts">
        <label>FROM
          <select value={sender} disabled={busy || loading} onChange={e => { setSender(e.target.value); if (recipient === e.target.value) setRecipient(''); }}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label>TO
          <select value={recipient} disabled={busy || loading} onChange={e => { setRecipient(e.target.value); setSuccess(false); setError(''); }}>
            <option value="">Select destination</option>
            {accounts.filter(a => a.id !== sender).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      </div>
      <label>ITEM
        <select value={selectedItem} disabled={busy || loading} onChange={e => { setSelectedItem(e.target.value); setQuantity('1'); setSuccess(false); setError(''); }}>
          <option value="">Select item</option>
          {options.map(option => <option key={option.id} value={option.id} disabled={option.equipped || !option.item}>
            {option.item?.name ?? 'Unknown item'}{option.quantity !== null ? ' ×' + option.quantity : ''}{option.equipped ? ' — Equipped (unequip first)' : ''}
          </option>)}
        </select>
      </label>
      {sender !== WORLD && !loading && options.length === 0 && <p className="gm-trading-note">No inventory entries found for this character.</p>}
      <label>QUANTITY
        <input type="number" min="1" max={selected?.quantity ?? undefined} step="1" value={quantity} disabled={busy} onChange={e => { setQuantity(e.target.value); setSuccess(false); }}/>
      </label>
      {selected?.item?.category === 'Weapon' && sender !== WORLD && <p className="gm-trading-note">Weapons are individual instances. Transfer one at a time.</p>}
      <div className="gm-trading-summary">
        <strong>{kind} item</strong>
        <p>{selected?.item?.name ?? 'Select an item'} · {quantityValid ? numericQuantity : '—'} × · {accounts.find(a => a.id === sender)?.name} → {accounts.find(a => a.id === recipient)?.name ?? 'Select destination'}</p>
      </div>
      {error && <p className="gm-trading-error" role="alert">{error}</p>}
      <div className="gm-trading-actions">
        <button type="button" disabled={!valid} onClick={() => void execute()}>{busy ? 'Processing…' : 'Execute ' + kind}</button>
        {success && <span role="status" className="gm-trading-success"><CheckCircle2 size={22}/> Transaction completed</span>}
      </div>
    </div>}
  </section>;
}
