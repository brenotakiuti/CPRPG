import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { HeartPulse, Wallet, Dices, UserRound, Backpack, Smartphone, Bell, Wifi, WifiOff, RadioTower } from 'lucide-react';
import './PlayerView.css';

type PlayerCharacter = {
  id: string;
  name: string;
  balance: number;
  current_hp: number | null;
};

type PlayerViewProps = {
  token: string | null;
};

export default function PlayerView({ token }: PlayerViewProps) {
  const [character, setCharacter] = useState<PlayerCharacter | null>(null);
  const [body, setBody] = useState<number | null>(null);
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
        const maxLength = event.category === 'text' ? 48 : 24;
        const raw = event.message.trim().replace(/\\s+/g, ' ');
        const text = raw.length > maxLength
          ? raw.slice(0, maxLength - 3).trimEnd() + '...'
          : raw;
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
          <div className="player-header-top"><span>NIGHT CITY // 2077</span><RadioTower size={16} aria-hidden="true" /></div>
          <h1>{character?.name ?? 'PLAYER TERMINAL'}</h1>
          <p>CHARACTER DASHBOARD</p>
        </header>
        {character ? (
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
                <div className="player-nav-tile"><Backpack size={24} aria-hidden="true" /><span>INVENTORY</span></div>
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
    </main>
  );
}
