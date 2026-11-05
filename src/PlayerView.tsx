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
  const characterLoaded = useRef(false);
  const [message, setMessage] = useState('Connecting...');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let active = true;
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
        setMessage(error.message);
      } else if (!data) {
        setConnected(false);
        // A GM may revoke access while this browser remains signed in.
        setCharacter(null);
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
      window.removeEventListener('offline', onOffline);
    };
  }, [token]);

  const maximum = body === null ? null : 10 + 5 * body;
  const hp = character?.current_hp ?? null;
  const percentage = maximum && hp !== null ? Math.max(0, Math.min(100, hp / maximum * 100)) : null;
  const healthLevel = percentage === null ? 'unknown' : percentage <= 25 ? 'critical' : percentage <= 50 ? 'low' : percentage <= 75 ? 'moderate' : 'healthy';

  return (
    <main className="player-terminal">
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
