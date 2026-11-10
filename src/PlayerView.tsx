import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { HeartPulse, Wallet, Dices, UserRound, Backpack, Smartphone, Bell, Wifi, WifiOff, RadioTower, History } from 'lucide-react';
import './PlayerView.css';
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
const inventoryPanel: React.CSSProperties = { background: '#172331', border: '1px solid #3c4c5c', borderRadius: 8, padding: 16 };
const inventoryMuted: React.CSSProperties = { color: '#9baebe', fontSize: 12 };
const inventoryRow: React.CSSProperties = { background: '#202e3e', border: '1px solid #405268', color: '#e6edf5', borderRadius: 6, padding: 12, width: '100%', textAlign: 'left', cursor: 'pointer' };
function PlayerInventory({ characterId, onBack }: { characterId: string; onBack: () => void }) {
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [catalog, setCatalog] = useState<Record<string, CatalogEntry>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function refresh() {
    const { data, error: readError } = await supabase.from('character_inventory')
      .select('id, item_id, quantity, equipped_slot, instance_data')
      .eq('character_id', characterId).order('created_at');
    if (readError) { setError(readError.message); setLoading(false); return; }
    const rows = (data ?? []) as InventoryEntry[];
    const ids = [...new Set(rows.map(row => row.item_id))];
    if (ids.length) {
      const { data: itemRows, error: itemError } = await supabase.from('items')
        .select('id, name, category, rarity, description, properties').in('id', ids);
      if (itemError) { setError(itemError.message); setLoading(false); return; }
      setCatalog(Object.fromEntries(((itemRows ?? []) as CatalogEntry[]).map(item => [item.id, item])));
    } else setCatalog({});
    setEntries(rows);
    setSelectedId(previous => rows.some(row => row.id === previous) ? previous : (rows.find(row => !row.equipped_slot)?.id ?? rows[0]?.id ?? null));
    setError('');
    setLoading(false);
  }
  useEffect(() => {
    void refresh();
    const channel = supabase.channel('player-inventory-' + characterId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'character_inventory', filter: 'character_id=eq.' + characterId }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [characterId]);
  const selected = entries.find(row => row.id === selectedId);
  const item = selected ? catalog[selected.item_id] : undefined;
  const properties = (item?.properties ?? {}) as Record<string, any>;
  const attack = properties.attack ?? {};
  const magazine = properties.magazine ?? {};
  const actionButton: React.CSSProperties = { background: '#e8bd4a', border: 0, borderRadius: 5, color: '#111922', padding: '10px 12px', fontWeight: 800, cursor: 'pointer', flex: 1 };
  async function changeSlot(slot: string | null) {
    if (!selected || busy) return;
    setBusy(true);
    const { error: equipError } = await supabase.rpc('equip_character_item', { p_inventory_id: selected.id, p_slot: slot });
    if (equipError) setError(equipError.message);
    else await refresh();
    setBusy(false);
  }
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <button type="button" onClick={onBack} style={{ alignSelf: 'flex-start', background: 'transparent', border: 0, color: '#e8bd4a', padding: '6px 0', cursor: 'pointer' }}>← Dashboard</button>
    <section style={inventoryPanel}>
      <h2 style={{ margin: '0 0 12px', color: '#e8bd4a', fontSize: 13 }}>EQUIPPED WEAPONS <span style={{ float: 'right', color: '#9baebe' }}>{entries.filter(x => x.equipped_slot === 'weapon_1' || x.equipped_slot === 'weapon_2').length} / 2</span></h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(['weapon_1', 'weapon_2'] as const).map((slot, index) => {
          const entry = entries.find(x => x.equipped_slot === slot);
          return <button key={slot} type="button" onClick={() => entry && setSelectedId(entry.id)}
            style={{ ...inventoryRow, minHeight: 105, textAlign: 'center', borderColor: entry?.id === selectedId ? '#e8bd4a' : '#405268' }}>
            <div style={inventoryMuted}>SLOT {index + 1}</div>
            <div style={{ fontSize: 21, color: '#e8bd4a', margin: '7px 0' }}>{entry ? '⌖' : '+'}</div>
            <strong>{entry ? (catalog[entry.item_id]?.name ?? 'Item') : 'Empty'}</strong>
            <div style={inventoryMuted}>{entry ? (catalog[entry.item_id]?.properties?.weapon_class as string ?? 'Weapon') : 'Weapon slot'}</div>
          </button>;
        })}
      </div>
    </section>
    <section style={inventoryPanel}>
      <h2 style={{ margin: '0 0 12px', color: '#e8bd4a', fontSize: 13 }}>CARRIED ITEMS <span style={{ float: 'right', color: '#9baebe' }}>{entries.filter(x => !x.equipped_slot).length}</span></h2>
      {loading && <p style={inventoryMuted}>Loading inventory…</p>}
      {!loading && !entries.some(x => !x.equipped_slot) && <p style={inventoryMuted}>No carried items.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.filter(x => !x.equipped_slot).map(entry => <button key={entry.id} type="button" onClick={() => setSelectedId(entry.id)}
          style={{ ...inventoryRow, borderColor: selectedId === entry.id ? '#e8bd4a' : '#405268', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span><strong>{catalog[entry.item_id]?.name ?? 'Unknown item'}</strong><br/><span style={inventoryMuted}>{catalog[entry.item_id]?.category ?? 'Item'} · {catalog[entry.item_id]?.rarity ?? ''}</span></span>
          <span style={inventoryMuted}>×{entry.quantity} ›</span>
        </button>)}
      </div>
    </section>
    {selected && <section style={{ ...inventoryPanel, borderColor: '#e8bd4a' }}>
      <div style={{ color: '#e8bd4a', fontSize: 12, fontWeight: 800 }}>ITEM DETAILS</div>
      <h2 style={{ margin: '8px 0 4px', fontSize: 21 }}>{item?.name ?? 'Unknown item'}</h2>
      <p style={{ ...inventoryMuted, margin: '0 0 14px' }}>{item?.category ?? 'Item'} · {item?.rarity ?? ''}</p>
      {item?.description && <p style={{ ...inventoryMuted, lineHeight: 1.5 }}>{item.description}</p>}
      {item?.category === 'Weapon' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        {[
          ['ATTACK', String(attack.dice ?? properties.attack_dice ?? '—') + 'd6'],
          ['ACCURACY', String(attack.accuracy_threshold ?? properties.accuracy_threshold ?? '—') + '+'],
          ['DAMAGE', String(attack.damage_per_success ?? properties.damage_per_success ?? '—') + '/success'],
          ['MAGAZINE', String(selected.instance_data?.remaining_attacks ?? '—') + ' / ' + String(magazine.capacity ?? properties.magazine_capacity ?? '—')],
          ['ACTION COST', String(attack.action_cost ?? properties.action_cost ?? '—')],
          ['RELOAD COST', String(magazine.reload_cost ?? properties.reload_cost ?? '—')]
        ].map(([label, value]) => <div key={label} style={{ background: '#101a26', borderRadius: 5, padding: 9 }}><div style={{ ...inventoryMuted, fontSize: 10 }}>{label}</div><strong>{value}</strong></div>)}
      </div>}
      {item?.category === 'Weapon' && <>
        <div style={{ ...inventoryMuted, marginBottom: 8 }}>EQUIP IN SLOT</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['weapon_1', 'weapon_2'] as const).map((slot, index) => <button key={slot} type="button" disabled={busy || selected.equipped_slot === slot}
            onClick={() => void changeSlot(slot)} style={{ ...actionButton, opacity: busy || selected.equipped_slot === slot ? .5 : 1 }}>
            {selected.equipped_slot === slot ? '✓ ' : ''}Slot {index + 1}
          </button>)}
        </div>
        {selected.equipped_slot && <button type="button" disabled={busy} onClick={() => void changeSlot(null)}
          style={{ ...actionButton, marginTop: 8, width: '100%', background: '#202e3e', color: '#e6edf5', border: '1px solid #405268' }}>Unequip</button>}
        <p style={{ ...inventoryMuted, marginBottom: 0 }}>Equipping into an occupied slot moves the previous weapon to carried items.</p>
      </>}
      {item?.category !== 'Weapon' && <p style={inventoryMuted}>Equipment controls for this item category will be added in a later phase.</p>}
    </section>}
    {error && <div role="alert" style={{ color: '#ffb3b3', background: '#401e24', padding: 10, borderRadius: 6 }}>{error}</div>}
  </div>;
}

type PlayerViewProps = {
  token: string | null;
};

export default function PlayerView({ token }: PlayerViewProps) {
  const [character, setCharacter] = useState<PlayerCharacter | null>(null);
  const [body, setBody] = useState<number | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
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
    }, 5000);

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
          <div className="player-header-top"><span>NIGHT CITY // 2077</span><div className="player-header-actions"><RadioTower size={16} aria-hidden="true" />{character && feedCampaignId && <button type="button" className="player-logs-trigger" aria-label="Open personal logs" title="Personal logs" onClick={() => setLogsOpen(true)}><History size={19} aria-hidden="true" /></button>}</div></div>
          <h1>{character?.name ?? 'PLAYER TERMINAL'}</h1>
          <p>CHARACTER DASHBOARD</p>
        </header>
        {character && inventoryOpen ? <PlayerInventory characterId={character.id} onBack={() => setInventoryOpen(false)} /> : character ? (
          <>
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
            <section className="player-card player-navigation">
              <h2>CHARACTER <span>›</span></h2>
              <div className="player-nav-grid">
                <div className="player-nav-tile"><UserRound size={24} aria-hidden="true" /><span>STATS</span></div>
                <button type="button" className="player-nav-tile" onClick={() => setInventoryOpen(true)} style={{ cursor: "pointer", font: "inherit" }}><Backpack size={24} aria-hidden="true" /><span>INVENTORY</span></button>
                <div className="player-nav-tile"><Smartphone size={24} aria-hidden="true" /><span>PHONE</span></div>
              </div>
            </section>
            <section className="player-card player-events">
              <h2><Bell size={18} aria-hidden="true" /> INCOMING EVENTS</h2>
              <p>No new notifications</p>
            </section>
            <footer className="player-footer"><span className={connected ? "player-online" : "player-offline"}>{connected ? <Wifi size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}{connected ? "CONNECTED" : "DISCONNECTED"}</span><span>PLAYER TERMINAL</span></footer>
          </>
        ) : <section className="player-card player-message" role="status">{message}</section>}
      </div>
      {character && feedCampaignId && <PlayerSpotlights campaignId={feedCampaignId} characterId={character.id} />}
      {logsOpen && character && feedCampaignId && <PlayerLogs campaignId={feedCampaignId} characterId={character.id} onClose={() => setLogsOpen(false)} />}
    </main>
  );
}
