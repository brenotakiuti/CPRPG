import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { HeartPulse, Wallet, Dices, Crosshair, Swords, ArrowLeft, Utensils, BriefcaseMedical, UserRound, Backpack, Smartphone, Bell, Wifi, WifiOff, RadioTower, History } from 'lucide-react';
import './PlayerView.css';
import { ArtworkZoomButton } from './ArtworkViewer';
import PlayerLogs from './PlayerLogs';
import PlayerSpotlights from './PlayerSpotlights';

type PlayerCharacter = {
  id: string;
  name: string;
  balance: number;
  current_hp: number | null;
};


type InventoryEntry = {
  id: string;
  item_id: string;
  quantity: number;
  equipped_slot: string | null;
  instance_data: Record<string, unknown>;
};
type CatalogEntry = {
  id: string;
  name: string;
  category: string;
  rarity: string;
  description: string | null;
  properties: Record<string, unknown>;
};

const inventoryMuted: React.CSSProperties = { color: '#8996a5', fontSize: 12 };
const inventoryAction: React.CSSProperties = { flex: 1, padding: '11px 8px', background: '#e8bd4a', border: 0, borderRadius: 5, color: '#10151d', fontWeight: 700, cursor: 'pointer' };
function inventoryIcon(category: string) {
  switch (category.toLowerCase()) {
    case 'weapon': return '⌖';
    case 'armor': return '◇';
    case 'cyberware': return '◈';
    case 'quickhack': return '▣';
    case 'consumable': return '+';
    default: return '□';
  }
}
const rarityColors: Record<string, string> = { Common: '#aab4c2', Rare: '#6caeff', Epic: '#c08aff', Legendary: '#f0c55c' };
function consumableIcon(item?: CatalogEntry) {
  if (item?.category !== 'Consumable') return null;
  return item.properties?.subtype === 'food' ? Utensils : item.properties?.subtype === 'medical' ? BriefcaseMedical : null;
}
type PlayerInventoryData = { entries: InventoryEntry[]; catalog: Record<string, CatalogEntry>; loading: boolean; error: string; refresh: () => Promise<void> };

function usePlayerInventory(characterId: string | null): PlayerInventoryData {
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [catalog, setCatalog] = useState<Record<string, CatalogEntry>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const versionRef = useRef(0);
  const refresh = useCallback(async () => {
    if (!characterId) return;
    const version = ++versionRef.current;
    const { data, error: readError } = await supabase.from('character_inventory')
      .select('id, item_id, quantity, equipped_slot, instance_data').eq('character_id', characterId).order('created_at');
    if (version !== versionRef.current) return;
    if (readError) { setError(readError.message); setLoading(false); return; }
    const rows = (data ?? []) as InventoryEntry[];
    const ids = [...new Set(rows.map(row => row.item_id))];
    let nextCatalog: Record<string, CatalogEntry> = {};
    if (ids.length) {
      const { data: itemRows, error: itemError } = await supabase.from('items')
        .select('id, name, category, rarity, description, properties').in('id', ids);
      if (version !== versionRef.current) return;
      if (itemError) { setError(itemError.message); setLoading(false); return; }
      nextCatalog = Object.fromEntries(((itemRows ?? []) as CatalogEntry[]).map(item => [item.id, item]));
    }
    if (version !== versionRef.current) return;
    setEntries(rows); setCatalog(nextCatalog); setError(''); setLoading(false);
  }, [characterId]);
  useEffect(() => {
    ++versionRef.current; setEntries([]); setCatalog({}); setError(''); setLoading(true);
    if (!characterId) return;
    void refresh();
    const channel = supabase.channel('player-shared-inventory-' + characterId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'character_inventory', filter: 'character_id=eq.' + characterId }, () => { void refresh(); }).subscribe();
    return () => { ++versionRef.current; void supabase.removeChannel(channel); };
  }, [characterId, refresh]);
  return { entries, catalog, loading, error, refresh };
}

function PlayerInventory({ inventory, onBack, initialSelectedId = null, onSelect }: { inventory: PlayerInventoryData; onBack: () => void; initialSelectedId?: string | null; onSelect: (id: string | null) => void }) {
  const { entries, catalog, loading, error, refresh } = inventory;
  const [actionError, setActionError] = useState('');
  const selectedId = initialSelectedId;
  const setSelectedId = onSelect;
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!loading && selectedId && !entries.some(row => row.id === selectedId)) setSelectedId(null);
  }, [entries, loading, selectedId, setSelectedId]);
  const selected = entries.find(row => row.id === selectedId);
  const item = selected ? catalog[selected.item_id] : undefined;
  const properties = (item?.properties ?? {}) as Record<string, any>;
  const attack = properties.attack ?? {};
  const magazine = properties.magazine ?? {};
  const imagePath = typeof properties.image === 'string' ? properties.image : null;
  async function changeSlot(slot: string | null) {
    if (!selected || busy) return;
    setBusy(true);
    const { error: equipError } = await supabase.rpc('equip_character_item', { p_inventory_id: selected.id, p_slot: slot });
    if (equipError) setActionError(equipError.message);
    else { setActionError(''); await refresh(); }
    setBusy(false);
  }
  async function useConsumable() {
    if (!selected || item?.category !== 'Consumable' || busy) return;
    setBusy(true);
    setActionError('');
    const { error: useError } = await supabase.rpc('consume_character_item', { p_inventory_id: selected.id });
    if (useError) setActionError(useError.message);
    else await refresh();
    setBusy(false);
  }
  return <section style={{ background: '#10151d', color: '#f0f2f5', borderRadius: 10, padding: '16px 14px', minHeight: 300 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
      <button type="button" onClick={() => selectedId ? setSelectedId(null) : onBack()} aria-label={selectedId ? 'Back to inventory' : 'Back to dashboard'}
        style={{ background: '#202e3e', border: '1px solid #405268', borderRadius: 6, color: '#e8bd4a', cursor: 'pointer', fontSize: 13, fontWeight: 700, padding: '9px 12px', display: 'inline-flex', alignItems: 'center', gap: 7 }}><ArrowLeft size={19} strokeWidth={2} aria-hidden="true" />Back</button>
      <h2 style={{ margin: 0, fontSize: 23, fontWeight: 600 }}>{selectedId ? 'Item details' : 'Inventory'}</h2>
    </div>
    {(error || actionError) && <p role="alert" style={{ color: '#ffb3b3', fontSize: 13 }}>{actionError || error}</p>}
    {!selectedId ? <>
      <p style={{ ...inventoryMuted, margin: '0 0 12px' }}>{loading ? 'Loading inventory…' : entries.length + (entries.length === 1 ? ' item' : ' items')}</p>
      {!loading && entries.length === 0 && <p style={inventoryMuted}>No items in inventory.</p>}
      <div style={{ background: '#14202c', border: '1px solid #354556', borderRadius: 8, padding: '4px 12px' }}>
      {[...entries].sort((a, b) => {
        const itemA = catalog[a.item_id];
        const itemB = catalog[b.item_id];
        const group = (item?: CatalogEntry) => {
          if (item?.category === 'Weapon') return 0;
          if (item?.category === 'Consumable' && item.properties?.subtype === 'medical') return 1;
          if (item?.category === 'Consumable' && item.properties?.subtype === 'food') return 2;
          return 3;
        };
        const groupDifference = group(itemA) - group(itemB);
        if (groupDifference) return groupDifference;
        const categoryDifference = (itemA?.category ?? '').localeCompare(itemB?.category ?? '', undefined, { sensitivity: 'base' });
        if (group(itemA) === 3 && categoryDifference) return categoryDifference;
        return (itemA?.name ?? 'Unknown item').localeCompare(itemB?.name ?? 'Unknown item', undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);
      }).map(entry => {
        const catalogItem = catalog[entry.item_id];
        const CategoryIcon = consumableIcon(catalogItem);
        const rarityColor = rarityColors[catalogItem?.rarity ?? ''] ?? '#8996a5';
        return <button key={entry.id} type="button" onClick={() => setSelectedId(entry.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '13px 0', background: 'transparent', color: '#f0f2f5', border: 0, borderBottom: '1px solid #303a47', textAlign: 'left', cursor: 'pointer' }}>
          <span aria-hidden="true" style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 6, display: 'grid', placeItems: 'center', background: '#1b2430', color: '#e8bd4a', fontSize: 22 }}>{CategoryIcon ? <CategoryIcon size={21} strokeWidth={1.8} /> : inventoryIcon(catalogItem?.category ?? '')}</span>
          <span style={{ flex: 1, minWidth: 0 }}><strong style={{ display: 'block', fontSize: 14 }}>{catalogItem?.name ?? 'Unknown item'}</strong>
            <span style={{ ...inventoryMuted, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: rarityColor }} /><span style={{ color: rarityColor }}>{catalogItem?.rarity ?? 'Common'}</span> · {catalogItem?.category === 'Consumable' ? (catalogItem.properties?.subtype === 'food' ? 'Food' : 'Medical') : (catalogItem?.properties?.weapon_class as string ?? catalogItem?.category ?? 'Item')}{' · ×' + entry.quantity}</span></span>
          {entry.equipped_slot && <span style={{ color: '#e8bd4a', fontSize: 10 }}>EQUIPPED</span>}
          <span aria-hidden="true" style={{ color: '#8996a5' }}>›</span>
        </button>;
      })}
      </div>
    </> : selected ? <>
      <h3 style={{ margin: '0 0 4px', fontSize: 25, fontWeight: 600 }}>{item?.name ?? 'Unknown item'}</h3>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 16 }}>
        <span style={inventoryMuted}>{item?.properties?.weapon_class as string ?? (item?.category === 'Consumable' ? (properties.subtype === 'food' ? 'Food · Consumable' : 'Medical · Consumable') : item?.category ?? 'Item')} · <span style={{ color: rarityColors[item?.rarity ?? ''] ?? '#8996a5' }}>● {item?.rarity ?? ''}</span></span>
        {selected.equipped_slot && <span style={{ color: '#e8bd4a', fontSize: 12 }}>Equipped</span>}
      </div>
      {imagePath && <div style={{ background: '#151d28', borderRadius: 8, padding: 8, marginBottom: 16, display: 'grid', placeItems: 'center', minHeight: 150, position: 'relative' }}>
        <img src={imagePath} alt={item?.name ?? 'Item artwork'} style={{ width: '100%', maxHeight: 220, objectFit: 'contain' }}/>
        <ArtworkZoomButton src={imagePath} alt={item?.name ?? 'Item'} />
      </div>}
      {item?.description && <p style={{ fontSize: 13, color: '#aab4c2', lineHeight: 1.6, margin: '0 0 18px' }}>{item.description}</p>}
      {item?.category === 'Weapon' && <>
        <div style={{ borderTop: '1px solid #303a47', paddingTop: 14, marginBottom: 12, color: '#8996a5', fontSize: 11 }}>WEAPON STATS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 18 }}>
          {[
            ['ATTACK', String(attack.dice ?? properties.attack_dice ?? '—') + 'd6'],
            ['HIT', String(attack.accuracy_threshold ?? properties.accuracy_threshold ?? '—') + '+'],
            ['DAMAGE', String(attack.damage_per_success ?? properties.damage_per_success ?? '—')],
            ['MAGAZINE', String(selected.instance_data?.remaining_attacks ?? '—') + ' / ' + String(magazine.capacity ?? properties.magazine_capacity ?? '—')],
            ['ACTION COST', String(attack.action_cost ?? properties.action_cost ?? '—')],
            ['RELOAD COST', String(magazine.reload_cost ?? properties.reload_cost ?? '—')]
          ].map(([label, value]) => <div key={label}><div style={{ ...inventoryMuted, fontSize: 10, marginBottom: 4 }}>{label}</div><strong>{value}</strong></div>)}
        </div>
        <div style={{ borderTop: '1px solid #303a47', paddingTop: 16, marginBottom: 9, color: '#8996a5', fontSize: 12 }}>EQUIP TO</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['weapon_1', 'weapon_2'] as const).map((slot, index) => <button key={slot} type="button" disabled={busy || selected.equipped_slot === slot}
            onClick={() => void changeSlot(slot)} style={{ ...inventoryAction, opacity: busy || selected.equipped_slot === slot ? .5 : 1 }}>
            {selected.equipped_slot === slot ? 'Equipped ' : 'Slot '}{index + 1}
          </button>)}
        </div>
        {selected.equipped_slot && <button type="button" disabled={busy} onClick={() => void changeSlot(null)}
          style={{ background: '#241c24', border: '1px solid #b66a72', borderRadius: 6, color: '#ffb3b3', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 700, padding: '11px 12px', width: '100%', marginTop: 12 }}>⊖ Unequip weapon</button>}
      </>}
      {item?.category === 'Consumable' && <>
        {properties.subtype === 'food' && <div style={{ borderTop: '1px solid #303a47', paddingTop: 14, marginBottom: 12, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={inventoryMuted}>NOURISHMENT</span><strong>{String(properties.nourishment ?? '—')}</strong></div>}
        <div style={{ borderTop: '1px solid #303a47', paddingTop: 14, marginBottom: 14, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={inventoryMuted}>QUANTITY</span><strong>{selected.quantity}</strong></div>
        <button type="button" disabled={busy || selected.quantity < 1} onClick={() => void useConsumable()} style={{ ...inventoryAction, width: '100%', opacity: busy ? 0.6 : 1 }}>{busy ? 'Using…' : 'Use item'}</button>
      </>}
      {item?.category !== 'Weapon' && item?.category !== 'Consumable' && <p style={inventoryMuted}>Item actions for this category will be added later.</p>}
    </> : <p style={inventoryMuted}>Item no longer available. <button onClick={() => setSelectedId(null)}>Back to inventory</button></p>}
  </section>;
}


function PlayerLoadout({ inventory, onInspect, onInventory }: { inventory: PlayerInventoryData; onInspect: (inventoryId: string) => void; onInventory: () => void }) {
  const { entries, catalog } = inventory;
  const equipped = entries.filter(row => row.equipped_slot === 'weapon_1' || row.equipped_slot === 'weapon_2');
  return <section className="player-card" aria-label="Loadout" style={{ padding: 16 }}>
    <div className="player-section-heading" style={{ marginBottom: 12 }}>
      <span>LOADOUT</span><strong style={{ color: '#9baebe', fontSize: 11 }}>{equipped.length} / 2 EQUIPPED</strong>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
      {(['weapon_1', 'weapon_2'] as const).map((slot, index) => {
        const entry = equipped.find(row => row.equipped_slot === slot);
        const item = entry ? catalog[entry.item_id] : undefined;
        const properties = (item?.properties ?? {}) as Record<string, any>;
        const image = properties.image;
        const attack = properties.attack ?? {};
        const magazine = properties.magazine ?? {};
        const remaining = entry?.instance_data?.remaining_attacks;
        const ammo = typeof remaining === 'number' ? remaining : magazine.capacity;
        const stats = [
          { label: 'Attack dice', value: typeof attack.dice === 'number' ? attack.dice + 'd6' : '—', Icon: Dices },
          { label: 'Hit threshold', value: typeof attack.accuracy_threshold === 'number' ? attack.accuracy_threshold + '+' : '—', Icon: Crosshair },
          { label: 'Damage per success', value: typeof attack.damage_per_success === 'number' ? String(attack.damage_per_success) : '—', Icon: Swords },
        ];
        return <button key={slot} type="button" onClick={() => entry ? onInspect(entry.id) : onInventory()}
          aria-label={entry ? 'Inspect ' + (item?.name ?? 'equipped weapon') : 'Open inventory to equip weapon in slot ' + (index + 1)}
          style={{ background: '#101a26', border: '1px solid #354556', borderRadius: 6, color: '#e6edf5', padding: 9, cursor: 'pointer', minWidth: 0, textAlign: 'left' }}>
          <div style={{ width: '100%', aspectRatio: '4 / 3', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            {typeof image === 'string' && image ? <img src={image} alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center' }} /> :
              <span aria-hidden="true" style={{ color: '#697d91', fontSize: 30 }}>{entry ? '⌖' : '+'}</span>}
          </div>
          {entry ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 4, marginTop: 3 }}>
            {stats.map(({ label, value, Icon }) => <div key={label} title={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, minWidth: 0 }}>
              <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={18} color="#e8bd4a" strokeWidth={2} aria-hidden="true" />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, lineHeight: '15px', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
            </div>)}
            <div title="Remaining ammunition / magazine capacity" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, minWidth: 0 }}>
              <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 32 24" width="23" height="20" fill="none" stroke="#e8bd4a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {[9, 16, 23].map(x => <path key={x} d={`M${x-2.5} 9 V7 C${x-2.5} 4.8 ${x-1.4} 3.1 ${x} 3.1 C${x+1.4} 3.1 ${x+2.5} 4.8 ${x+2.5} 7 V9 M${x-2.5} 9 H${x+2.5} V21 H${x-2.5} Z M${x-2.5} 18 H${x+2.5}`} />)}
                </svg>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, lineHeight: '15px', fontVariantNumeric: 'tabular-nums' }}>{ammo ?? '—'}/{magazine.capacity ?? '—'}</span>
            </div>
          </div> : <div style={{ marginTop: 7, textAlign: 'center', color: '#9baebe', fontSize: 11 }}>Empty slot 0{index + 1}</div>}
        </button>;
      })}
    </div>
  </section>;
}

type PlayerViewProps = {
  token: string | null;
};

export default function PlayerView({ token }: PlayerViewProps) {
  const [character, setCharacter] = useState<PlayerCharacter | null>(null);
  const inventoryData = usePlayerInventory(character?.id ?? null);
  const [body, setBody] = useState<number | null>(null);
  type PlayerScreen = { inventory: boolean; selected: string | null; logs: boolean };
  const screenKey = 'player-screen:' + (token ?? 'current');
  function restoreScreen(): PlayerScreen {
    try {
      const value = JSON.parse(sessionStorage.getItem(screenKey) || 'null');
      return { inventory: value?.inventory === true, selected: typeof value?.selected === 'string' ? value.selected : null, logs: value?.logs === true };
    } catch { return { inventory: false, selected: null, logs: false }; }
  }
  const [initialScreen] = useState(restoreScreen);
  const [logsOpen, setLogsOpen] = useState(initialScreen.logs);
  const [inventoryOpen, setInventoryOpen] = useState(initialScreen.inventory);
  const [inventorySelection, setInventorySelection] = useState<string | null>(initialScreen.selected);
  const [inventoryVisited, setInventoryVisited] = useState(initialScreen.inventory);
  const [logsVisited, setLogsVisited] = useState(initialScreen.logs);
  const navRef = useRef<PlayerScreen>(initialScreen);
  const navigationKey = useRef('player-navigation:' + (token ?? 'current'));
  function navigate(next: { inventory: boolean; selected: string | null; logs: boolean }) {
    navRef.current = next;
    sessionStorage.setItem(screenKey, JSON.stringify(next));
    window.history.pushState({ ...window.history.state, playerNavigationKey: navigationKey.current, playerScreen: next }, '');
    setInventoryOpen(next.inventory);
    setInventorySelection(next.selected);
    setLogsOpen(next.logs);
    if (next.inventory) setInventoryVisited(true);
    if (next.logs) setLogsVisited(true);
  }
  function goBack() {
    if (navRef.current.logs || navRef.current.selected || navRef.current.inventory) window.history.back();
  }
  useEffect(() => {
    window.history.replaceState({ ...window.history.state, playerNavigationKey: navigationKey.current, playerScreen: navRef.current }, '');
    const onPopState = (event: PopStateEvent) => {
      const next = event.state?.playerNavigationKey === navigationKey.current
        ? event.state.playerScreen as { inventory: boolean; selected: string | null; logs: boolean }
        : { inventory: false, selected: null, logs: false };
      navRef.current = next;
      sessionStorage.setItem(screenKey, JSON.stringify(next));
      setInventoryOpen(next.inventory);
      setInventorySelection(next.selected);
      setLogsOpen(next.logs);
      if (next.inventory) setInventoryVisited(true);
      if (next.logs) setLogsVisited(true);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  function openInventory(selected: string | null = null) {
    if (selected) navigate({ inventory: true, selected, logs: false });
    else navigate({ inventory: true, selected: null, logs: false });
  }
  function selectInventoryItem(id: string | null) {
    if (id) navigate({ inventory: true, selected: id, logs: false });
    else goBack();
  }
  const [feedCampaignId, setFeedCampaignId] = useState<string | null>(null);
  const [hudMessage, setHudMessage] = useState<{ id: string; text: string; duration: number } | null>(null);
  const hudQueue = useRef<Array<{ id: string; text: string; duration: number }>>([]);
  const hudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hudActive = useRef(false);

  // The HUD consumes persisted events, independent of their producing system.
  // One message finishes its full animation before the next starts.
  function showNextHudMessage() {
    const next = hudQueue.current.shift();
    if (!next) {
      hudActive.current = false;
      setHudMessage(null);
      return;
    }
    hudActive.current = true;
    setHudMessage(next);
    hudTimer.current = setTimeout(showNextHudMessage, next.duration);
  }

  useEffect(() => {
    if (!feedCampaignId || !character) return;
    const channel = supabase.channel('campaign-events-' + feedCampaignId + '-' + character.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'campaign_events',
        filter: 'campaign_id=eq.' + feedCampaignId,
      }, ({ new: event }) => {
        if (event.audience === 'gm') return;
        if (event.audience === 'character' && event.character_id !== character.id) return;
        if (event.audience !== 'campaign' && event.audience !== 'character') return;
        if (typeof event.message !== 'string' || !event.message.trim()) return;
        if (event.category !== 'system' && event.category !== 'text') return;
        // Tarot and fortune results are already displayed in interactive spotlights.
        // Keep them in campaign logs without duplicating them in the HUD.
        if (/^(?:(?:TAROT REVEALED|TAROT CARD|FORTUNE REVEALED):|HEALTH [+-]\\d+ HP$)/i.test(event.message.trim())) return;
        const text = event.message.trim().replace(/\s+/g, ' ');
        hudQueue.current.push({
          id: typeof event.id === 'string' ? event.id : crypto.randomUUID(),
          text,
          duration: event.category === 'text' ? 2500 : 2000,
        });
        if (!hudActive.current) showNextHudMessage();
      })
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Campaign HUD] Event subscription problem:', error ?? status);
        }
      });
    return () => {
      if (hudTimer.current) clearTimeout(hudTimer.current);
      hudTimer.current = null;
      hudQueue.current = [];
      hudActive.current = false;
      setHudMessage(null);
      void supabase.removeChannel(channel);
    };
  }, [feedCampaignId, character?.id]);
  const characterLoaded = useRef(false);
  const [message, setMessage] = useState('Connecting...');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let active = true;
    let subscribedCharacterId: string | null = null;
    let characterChannel: ReturnType<typeof supabase.channel> | null = null;
    const onOffline = () => { if (active) setConnected(false); };
    window.addEventListener('offline', onOffline);

    async function connectPlayer() {
      // Reuse the existing anonymous account if possible.
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (!active) return;

      if (sessionError) {
        setMessage(sessionError.message);
        return;
      }

      let session = sessionData.session;

      if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously();

        if (!active) return;

        if (error) {
          setMessage(error.message);
          return;
        }

        session = data.session;
      }

      if (!session) {
        setMessage('Could not establish a player session.');
        return;
      }

      if (!session.user.is_anonymous) {
        setMessage(
          'This browser is signed in with a regular account. ' +
            'Open the invitation in a separate browser or private window.'
        );
        return;
      }

      if (token) {
        const { error } = await supabase.rpc('claim_character', {
          p_token: token,
        });

        if (!active) return;

        if (error) {
          setMessage(error.message);
          return;
        }

        // Remove the one-time token from the address bar.
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search + '#player'
        );
      }

      await loadCharacter();
    }

    async function loadCharacter() {
      const { data, error } = await supabase
        .from('characters')
        .select('id, name, balance')
        .eq('player_id', (await supabase.auth.getUser()).data.user?.id)
        .maybeSingle();

      if (!active) return;

      if (error) {
        setConnected(false);
        setCharacter(null);
        setFeedCampaignId(null);
        setMessage(error.message);
      } else if (!data) {
        setConnected(false);
        // A GM may revoke access while this browser remains signed in.
        setCharacter(null);
        setFeedCampaignId(null);
        setMessage('No character assigned. Ask your GM for a new invitation.');
      } else {
        // Read HP separately so older databases can still show the character.
        const { data: hpData, error: hpError } = await supabase.from('characters')
          .select('current_hp').eq('id', data.id).maybeSingle();
        if (!active) return;
        if (hpError) console.warn('[Player] HP:', hpError.message);
        setCharacter({ ...data, current_hp: hpData?.current_hp == null ? null : Number(hpData.current_hp) });

        // Use separate definition and value queries, as in the GM monitor.
        const { data: campaignRow, error: campaignError } = await supabase
          .from('characters').select('campaign_id').eq('id', data.id).maybeSingle();
        if (!active) return;
        if (campaignError) console.warn('[Player] Campaign:', campaignError.message);
        const campaignId = campaignRow?.campaign_id;
        setFeedCampaignId(campaignId ?? null);
        if (campaignId) {
          const { data: definitions, error: definitionError } = await supabase
            .from('stat_definitions').select('id, name').eq('campaign_id', campaignId);
          if (!active) return;
          if (definitionError) console.warn('[Player] Stat definitions:', definitionError.message);
          const bodyId = (definitions ?? []).find(d => d.name.trim().toLowerCase() === 'body')?.id;
          if (bodyId) {
            const { data: bodyRow, error: bodyError } = await supabase
              .from('character_stats').select('value')
              .eq('character_id', data.id).eq('stat_id', bodyId).maybeSingle();
            if (!active) return;
            if (bodyError) console.warn('[Player] BODY:', bodyError.message);
            setBody(bodyRow ? Number(bodyRow.value) : null);
          } else setBody(null);
        } else setBody(null);
        // Subscribe once per assigned character. Realtime updates arrive after the
        // GM's debounced database write, rather than waiting for the next poll.
        if (subscribedCharacterId !== data.id) {
          if (characterChannel) void supabase.removeChannel(characterChannel);
          subscribedCharacterId = data.id;
          characterChannel = supabase.channel('player-character-' + data.id)
            .on('postgres_changes', {
              event: 'UPDATE', schema: 'public', table: 'characters',
              filter: 'id=eq.' + data.id,
            }, payload => {
              if (!active) return;
              console.info('[Player Realtime] UPDATE received', {
                characterId: data.id,
                eventType: payload.eventType,
                currentHP: payload.new?.current_hp,
                balance: payload.new?.balance,
              });
              const row = payload.new as Partial<PlayerCharacter>;
              setCharacter(previous => {
                if (!previous || previous.id !== data.id) return previous;
                return {
                  ...previous,
                  ...(typeof row.name === 'string' ? { name: row.name } : {}),
                  ...(typeof row.balance === 'number' ? { balance: row.balance } : {}),
                  ...(row.current_hp !== undefined ? { current_hp: row.current_hp } : {}),
                };
              });
            })
            .subscribe((status, error) => {
              if (!active) return;
              console.info('[Player Realtime] Channel status:', status, {
                characterId: data.id,
                ...(error ? { error: error.message } : {}),
              });
              if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.warn('[Player Realtime] Subscription problem; polling remains active', error);
              }
            });
        }
        setConnected(navigator.onLine);
        setMessage('');
      }
      characterLoaded.current = true;
    }

    connectPlayer();

    // Simple balance synchronization for our prototype.
    const interval = setInterval(() => {
      if (active && characterLoaded.current) {
        loadCharacter();
      }
    }, 30000);

    return () => {
      active = false;
      clearInterval(interval);
      if (characterChannel) void supabase.removeChannel(characterChannel);
      window.removeEventListener('offline', onOffline);
    };
  }, [token]);

  const maximum = body === null ? null : 10 + 5 * body;
  const hp = character?.current_hp ?? null;
  const percentage = maximum && hp !== null ? Math.max(0, Math.min(100, hp / maximum * 100)) : null;
  const healthLevel = percentage === null ? 'unknown' : percentage <= 25 ? 'critical' : percentage <= 50 ? 'low' : percentage <= 75 ? 'moderate' : 'healthy';

  return (
    <main className="player-terminal">
      {hudMessage && <div className="player-hud-feed" role="status" key={hudMessage.id} style={{ animationDuration: `${hudMessage.duration}ms` }}>{hudMessage.text}</div>}
      <div className="player-shell">
        <header className="player-card player-header">
          <div className="player-header-top"><span>NIGHT CITY // 2077</span><div className="player-header-actions"><RadioTower size={16} aria-hidden="true" />{character && feedCampaignId && <button type="button" className="player-logs-trigger" aria-label="Open personal logs" title="Personal logs" onClick={() => navigate({ ...navRef.current, logs: true })}><History size={19} aria-hidden="true" /></button>}</div></div>
          <h1>{character?.name ?? 'PLAYER TERMINAL'}</h1>
          <p>CHARACTER DASHBOARD</p>
        </header>
        {character && inventoryVisited && <div style={{ display: inventoryOpen ? undefined : 'none' }}><PlayerInventory inventory={inventoryData} initialSelectedId={inventorySelection} onBack={goBack} onSelect={selectInventoryItem} /></div>}
        {character ? (
          <div style={{ display: inventoryOpen ? 'none' : 'flex', flexDirection: 'column', gap: 12 }}>
            <section className="player-card player-health" aria-label="Character health">
              <div className="player-section-heading"><span><HeartPulse size={19} aria-hidden="true" /> HEALTH</span><strong>{hp !== null && maximum !== null ? `${hp} / ${maximum} HP` : 'HP unavailable'}</strong></div>
              <div className="player-hp-track" role="progressbar" aria-label="HP" aria-valuemin={0} aria-valuemax={maximum ?? 100} aria-valuenow={hp ?? 0}>
                <div className={`player-hp-fill ${healthLevel}`} style={{ width: `${percentage ?? 0}%` }} />
              </div>
              <div className="player-health-meta"><span>BODY {body ?? '—'}</span><span>{percentage === null ? 'AWAITING DATA' : `${Math.round(percentage)}% REMAINING`}</span></div>
            </section>
            <div className="player-quick-grid">
              <section className="player-card player-quick-card">
                <div className="player-quick-label"><Wallet size={18} aria-hidden="true" /> BALANCE</div>
                <strong className="player-balance">{Number(character.balance).toLocaleString('en-US')} E$</strong>
              </section>
              <section className="player-card player-quick-card">
                <div className="player-quick-label"><Dices size={18} aria-hidden="true" /> DICE</div>
                <div className="player-dice-placeholder" aria-label="Dice rolling coming soon"><Dices size={17} aria-hidden="true" /> ROLL</div>
              </section>
            </div>
            <PlayerLoadout inventory={inventoryData} onInspect={id => openInventory(id)} onInventory={() => openInventory()} />
            <section className="player-card player-navigation">
              <h2>CHARACTER <span>›</span></h2>
              <div className="player-nav-grid">
                <div className="player-nav-tile"><UserRound size={24} aria-hidden="true" /><span>STATS</span></div>
                <button type="button" className="player-nav-tile" onClick={() => openInventory()} style={{ cursor: "pointer", font: "inherit" }}><Backpack size={24} aria-hidden="true" /><span>INVENTORY</span></button>
                <div className="player-nav-tile"><Smartphone size={24} aria-hidden="true" /><span>PHONE</span></div>
              </div>
            </section>
            <section className="player-card player-events">
              <h2><Bell size={18} aria-hidden="true" /> INCOMING EVENTS</h2>
              <p>No new notifications</p>
            </section>
            <footer className="player-footer"><span className={connected ? "player-online" : "player-offline"}>{connected ? <Wifi size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}{connected ? "CONNECTED" : "DISCONNECTED"}</span><span>PLAYER TERMINAL</span></footer>
          </div>
        ) : <section className="player-card player-message" role="status">{message}</section>}
      </div>
      {character && feedCampaignId && <PlayerSpotlights campaignId={feedCampaignId} characterId={character.id} />}
      {logsVisited && character && feedCampaignId && <div style={{ display: logsOpen ? undefined : 'none' }}><PlayerLogs campaignId={feedCampaignId} characterId={character.id} onClose={goBack} /></div>}
    </main>
  );
}
