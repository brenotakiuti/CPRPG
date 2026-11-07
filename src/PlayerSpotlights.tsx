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
      <TarotSpotlight key={current.id} forced={{ index: current.outcome.index, reversed: !!current.outcome.reversed }}
        playerMode initiallyRevealed={!!current.revealed_at} onReveal={reveal} onClose={() => void close()} />
    )}
    {current.kind === 'fortune' && typeof current.outcome.message === 'string' && Array.isArray(current.outcome.numbers) && (
      <FortuneCookieSpotlight key={current.id} fixedFortune={{ message: current.outcome.message, numbers: current.outcome.numbers }}
        playerMode initiallyRevealed={!!current.revealed_at} onReveal={reveal} onClose={() => void close()} />
    )}
    {error && <div role="alert" className="player-spotlight-error">{error}</div>}
    {closing && <div className="player-spotlight-error">Closing...</div>}
  </>;
}
