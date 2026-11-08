import { useEffect, useState } from 'react';
import { ArrowDownLeft, Clock3, Cookie, Dices, Heart, History, MessageSquare, Minus, Plus, SunMoon, Wallet, X } from 'lucide-react';
import { supabase } from './supabase';
import './PlayerLogs.css';
import { displayLogMessage, tarotFromLog } from './tarotData';
import TarotCardViewer from './TarotCardViewer';

type LogEvent = {
  id: string;
  character_id: string | null;
  audience: string;
  category: string;
  message: string;
  created_at: string;
};

const PAGE_SIZE = 50;
const newestFirst = (a: LogEvent, b: LogEvent) =>
  b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);

function EventIcon({ message }: { message: string }) {
  if (/^HEALTH \+\d+ HP$/i.test(message)) return <span style={{ display: 'inline-flex', alignItems: 'center' }}><Heart size={15} aria-hidden="true" /><Plus size={11} aria-hidden="true" /></span>;
  if (/^HEALTH -\d+ HP$/i.test(message)) return <span style={{ display: 'inline-flex', alignItems: 'center' }}><Heart size={15} aria-hidden="true" /><Minus size={11} aria-hidden="true" /></span>;
  if (/^(?:TAROT REVEALED|TAROT CARD):/i.test(message)) return <SunMoon size={18} aria-hidden="true" />;
  if (/^FORTUNE REVEALED:/i.test(message)) return <Cookie size={18} aria-hidden="true" />;
  if (/\bROLLED D\d+/i.test(message)) return <Dices size={18} aria-hidden="true" />;
  if (/\bRECEIVED\b/i.test(message)) return <ArrowDownLeft size={18} aria-hidden="true" />;
  if (/\b(?:E\$|DEDUCTED|SENT)\b/i.test(message) || message.includes('E$')) return <Wallet size={18} aria-hidden="true" />;
  if (message) return <MessageSquare size={18} aria-hidden="true" />;
  return <Clock3 size={18} aria-hidden="true" />;
}

export default function PlayerLogs({ campaignId, characterId, onClose }: {
  campaignId: string;
  characterId: string;
  onClose: () => void;
}) {
  const [selectedCard, setSelectedCard] = useState<{index:number;reversed:boolean}|null>(null);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [filter, setFilter] = useState<'all' | 'personal' | 'campaign'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setEvents([]);
    setLoading(true);
    setHasMore(false);
    setError('');
    // Player RLS limits these reads to campaign-wide and own-character events.
    const query = () => supabase.from('campaign_events')
      .select('id, character_id, audience, category, message, created_at')
      .eq('campaign_id', campaignId)
      .or(`audience.eq.campaign,and(audience.eq.character,character_id.eq.${characterId})`);

    const channel = supabase.channel(`player-log-history-${campaignId}-${characterId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'campaign_events',
        filter: `campaign_id=eq.${campaignId}`,
      }, ({ new: row }) => {
        if (!active) return;
        const event = row as LogEvent;
        if (event.audience !== 'campaign' && !(event.audience === 'character' && event.character_id === characterId)) return;
        setEvents(previous => previous.some(existing => existing.id === event.id) ? previous : [event, ...previous].sort(newestFirst));
      }).subscribe();

    void (async () => {
      const { data, error: loadError } = await query()
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);
      if (!active) return;
      if (loadError) setError(loadError.message);
      else {
        setEvents(previous => {
          const combined = new Map(previous.map(row => [row.id, row]));
          for (const row of (data ?? []) as LogEvent[]) combined.set(row.id, row);
          return [...combined.values()].sort(newestFirst);
        });
        setHasMore((data?.length ?? 0) === PAGE_SIZE);
      }
      setLoading(false);
    })();

    return () => { active = false; void supabase.removeChannel(channel); };
  }, [campaignId, characterId]);

  async function loadMore() {
    if (loadingMore || !hasMore || events.length === 0) return;
    setLoadingMore(true);
    setError('');
    const oldest = events[events.length - 1];
    const cursor = `created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`;
    const { data, error: loadError } = await supabase.from('campaign_events')
      .select('id, character_id, audience, category, message, created_at')
      .eq('campaign_id', campaignId)
      .or(`audience.eq.campaign,and(audience.eq.character,character_id.eq.${characterId})`)
      .or(cursor)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE);
    if (loadError) setError(loadError.message);
    else {
      setEvents(previous => {
        const combined = new Map(previous.map(row => [row.id, row]));
        for (const row of (data ?? []) as LogEvent[]) combined.set(row.id, row);
        return [...combined.values()].sort(newestFirst);
      });
      setHasMore((data?.length ?? 0) === PAGE_SIZE);
    }
    setLoadingMore(false);
  }

  const visible = events.filter(event =>
    (filter === 'all' || (filter === 'personal' ? event.audience === 'character' : event.audience === 'campaign'))
    && event.message.toLowerCase().includes(search.toLowerCase()));

  return <div className="player-logs-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="player-logs-dialog" role="dialog" aria-modal="true" aria-label="Personal logs">
      <header className="player-logs-heading">
        <div><h2><History size={20} aria-hidden="true" /> PERSONAL LOGS</h2><p>Your recorded notifications</p></div>
        <button type="button" className="player-logs-x" aria-label="Close logs" onClick={onClose}><X size={20} /></button>
      </header>
      <input className="player-logs-search" aria-label="Search personal logs" placeholder="Search your logs..." value={search} onChange={event => setSearch(event.target.value)} />
      <div className="player-logs-tabs" role="group" aria-label="Log audience">
        {(['all', 'personal', 'campaign'] as const).map(tab =>
          <button type="button" key={tab} className={filter === tab ? 'selected' : ''} aria-pressed={filter === tab} onClick={() => setFilter(tab)}>
            {tab === 'all' ? 'All' : tab === 'personal' ? 'Personal' : 'Campaign'}
          </button>)}
      </div>
      <div className="player-logs-list">
        {visible.map(event => <article className="player-logs-entry" key={event.id} role={tarotFromLog(event.message) ? "button" : undefined} tabIndex={tarotFromLog(event.message) ? 0 : undefined} aria-label={tarotFromLog(event.message) ? `View artwork: ${displayLogMessage(event.message)}` : undefined} onClick={() => { const card = tarotFromLog(event.message); if (card) setSelectedCard(card); }} onKeyDown={e => { if (tarotFromLog(event.message) && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setSelectedCard(tarotFromLog(event.message)); } }} style={tarotFromLog(event.message) ? { cursor: "pointer" } : undefined}>
          <span className={event.audience === 'character' ? 'player-logs-icon personal' : 'player-logs-icon campaign'}>
            <EventIcon message={event.message} />
          </span>
          <div className="player-logs-entry-body">
            <p>{displayLogMessage(event.message)}</p>
            <span>{event.audience === 'character' ? 'Personal' : 'Campaign-wide'}</span>
          </div>
          <time dateTime={event.created_at} title={new Date(event.created_at).toLocaleString()}>
            {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time>
        </article>)}
        {loading && <p className="player-logs-empty">Loading your logs...</p>}
        {!loading && visible.length === 0 && <p className="player-logs-empty">{events.length ? 'No matching logs.' : 'No recorded notifications yet.'}</p>}
        {error && <p className="player-logs-error" role="alert">{error}</p>}
        {hasMore && <button type="button" className="player-logs-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Loading...' : 'Load older logs'}</button>}
      </div>
      <footer className="player-logs-footer"><span>{visible.length} events shown</span><button type="button" onClick={onClose}>Close</button></footer>
    </section>
    {selectedCard && <TarotCardViewer index={selectedCard.index} onClose={() => setSelectedCard(null)} />}
  </div>;
}
