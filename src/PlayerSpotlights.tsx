import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import TarotSpotlight from './TarotSpotlight';
import FortuneCookieSpotlight from './FortuneCookieConfigured';

type Spotlight = {
  id: string;
  character_id: string;
  kind: 'tarot' | 'fortune';
  outcome: { index?: number; reversed?: boolean; message?: string; numbers?: number[] };
  created_at: string;
  revealed_at: string | null;
  closed_at: string | null;
};

function TarotTransmission({ index, children }: { index: number; children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    let active = true;
    setReady(false);
    setFailed(false);
    setElapsed(false);
    const minimum = setTimeout(() => { if (active) setElapsed(true); }, 1500);
    const paths = ['/tarot/back.webp', '/tarot/tarot' + index + '.webp'];
    let remaining = paths.length;
    const images = paths.map(src => {
      const img = new Image();
      img.onload = () => {
        if (!active) return;
        remaining--;
        if (remaining === 0) setReady(true);
      };
      img.onerror = () => { if (active) setFailed(true); };
      img.src = src;
      return img;
    });
    return () => {
      active = false;
      clearTimeout(minimum);
      images.forEach(img => { img.onload = null; img.onerror = null; });
    };
  }, [index, attempt]);

  if (ready && elapsed) return <>{children}</>;
  return <div className="tarot-overlay" role="status" aria-live="polite">
    <div style={{ width: 'min(88vw, 380px)', padding: 24, border: '1px solid #b99747', borderRadius: 10, background: '#0b1018', color: '#e8bd4a', boxShadow: '0 0 35px #d2a94422', fontFamily: 'monospace' }}>
      <div style={{ fontSize: 11, letterSpacing: 3, opacity: .8, marginBottom: 26 }}>NIGHT CITY // SECURE CHANNEL</div>
      <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>INCOMING TRANSMISSION</div>
      <div style={{ color: '#9da9b8', fontSize: 12, marginBottom: 20 }}>{failed ? 'DATA PACKET INTERRUPTED' : ready ? 'DECRYPTION COMPLETE' : 'DECRYPTING ENCRYPTED PAYLOAD...'}</div>
      <div style={{ height: 7, background: '#283241', overflow: 'hidden', borderRadius: 3 }}>
        <div style={{ width: failed ? '100%' : ready ? '100%' : '85%', height: '100%', background: failed ? '#cf6262' : '#e8bd4a', transition: 'width .4s ease', animation: ready || failed ? undefined : 'tarot-transmission-pulse 1.3s ease-in-out infinite alternate' }} />
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: '#9da9b8' }}>{failed ? 'CONNECTION ERROR' : ready ? '100% // VERIFIED' : 'RECEIVING DATA...'}</div>
      {failed && <button type="button" onClick={() => setAttempt(n => n + 1)} style={{ marginTop: 20, padding: '10px 16px', background: '#e8bd4a', border: 0, borderRadius: 5, color: '#10151d', fontWeight: 700, cursor: 'pointer' }}>RETRY TRANSMISSION</button>}
    </div>
    <style>{'@keyframes tarot-transmission-pulse { from { opacity: .25; transform: scaleX(.5); transform-origin: left; } to { opacity: 1; transform: scaleX(1); transform-origin: left; } }'}</style>
  </div>;
}

export default function PlayerSpotlights({ campaignId, characterId }: { campaignId: string; characterId: string }) {
  const [pending, setPending] = useState<Spotlight[]>([]);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const current = pending[0];

  useEffect(() => {
    let active = true;
    setPending([]);
    setError('');
    const channel = supabase.channel('player-spotlights-' + characterId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'player_spotlights',
        filter: 'character_id=eq.' + characterId,
      }, ({ new: row }) => {
        if (!active || row.character_id !== characterId || row.campaign_id !== campaignId) return;
        const incoming = row as Spotlight;
        setPending(previous => previous.some(item => item.id === incoming.id)
          ? previous : [...previous, incoming].sort((a,b) => a.created_at.localeCompare(b.created_at)));
      }).subscribe();

    void (async () => {
      const { data, error: loadError } = await supabase.from('player_spotlights')
        .select('id, character_id, kind, outcome, created_at, revealed_at, closed_at')
        .eq('campaign_id', campaignId).eq('character_id', characterId)
        .is('closed_at', null).order('created_at', { ascending: true });
      if (!active) return;
      if (loadError) setError(loadError.message);
      else setPending(previous => {
        const combined = new Map(previous.map(item => [item.id, item]));
        for (const item of (data ?? []) as Spotlight[]) combined.set(item.id, item);
        return [...combined.values()].sort((a,b) => a.created_at.localeCompare(b.created_at));
      });
    })();

    return () => { active = false; void supabase.removeChannel(channel); };
  }, [campaignId, characterId]);

  async function reveal() {
    if (!current) return;
    const { error: revealError } = await supabase.rpc('reveal_player_spotlight', { p_id: current.id });
    if (revealError) throw revealError;
    setPending(previous => previous.map(item => item.id === current.id ? { ...item, revealed_at: new Date().toISOString() } : item));
  }

  async function close() {
    if (!current || closing) return;
    setClosing(true);
    setError('');
    const { error: closeError } = await supabase.rpc('close_player_spotlight', { p_id: current.id });
    if (closeError) setError(closeError.message);
    else setPending(previous => previous.filter(item => item.id !== current.id));
    setClosing(false);
  }

  if (!current) return error ? <div role="alert" className="player-spotlight-error">{error}</div> : null;
  return <>
    {current.kind === 'tarot' && typeof current.outcome.index === 'number' && (
      <TarotTransmission key={current.id} index={current.outcome.index}>
        <TarotSpotlight forced={{ index: current.outcome.index, reversed: !!current.outcome.reversed }}
          playerMode initiallyRevealed={!!current.revealed_at} onReveal={reveal} onClose={() => void close()} />
      </TarotTransmission>
    )}
    {current.kind === 'fortune' && typeof current.outcome.message === 'string' && Array.isArray(current.outcome.numbers) && (
      <FortuneCookieSpotlight key={current.id} fixedFortune={{ message: current.outcome.message, numbers: current.outcome.numbers }}
        playerMode initiallyRevealed={!!current.revealed_at} onReveal={reveal} onClose={() => void close()} />
    )}
    {error && <div role="alert" className="player-spotlight-error">{error}</div>}
    {closing && <div className="player-spotlight-error">Closing...</div>}
  </>;
}
