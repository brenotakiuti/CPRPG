import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import './CampaignLogs.css';
import { displayLogMessage, tarotFromLog } from './tarotData';
import TarotCardViewer from './TarotCardViewer';

type CampaignEvent = {
  id: string;
  campaign_id: string;
  character_id: string | null;
  audience: string;
  category: string;
  message: string;
  created_at: string;
};

const PAGE_SIZE = 100;

export default function CampaignLogs({ campaignId, characters }: {
  campaignId: string;
  characters: { id: string; name: string }[];
}) {
  const [selectedCard, setSelectedCard] = useState<{index:number;reversed:boolean}|null>(null);
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [search, setSearch] = useState('');
  const [character, setCharacter] = useState('all');
  const [audience, setAudience] = useState('all');
  const [category, setCategory] = useState('all');
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setEvents([]);
    setLoading(true);
    setError('');
    setHasMore(false);

    async function loadInitial() {
      const { data, error: queryError } = await supabase.from('campaign_events')
        .select('id, campaign_id, character_id, audience, category, message, created_at')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);
      if (!active) return;
      if (queryError) setError(queryError.message);
      else {
        setEvents(previous => {
          const combined = new Map(previous.map(event => [event.id, event]));
          for (const event of (data ?? []) as CampaignEvent[]) combined.set(event.id, event);
          return [...combined.values()].sort(compareNewest);
        });
        setHasMore((data?.length ?? 0) === PAGE_SIZE);
      }
      setLoading(false);
    }

    const channel = supabase.channel('gm-campaign-logs-' + campaignId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'campaign_events',
        filter: 'campaign_id=eq.' + campaignId,
      }, payload => {
        if (!active) return;
        const event = payload.new as CampaignEvent;
        if (event.campaign_id !== campaignId) return;
        setEvents(previous => previous.some(row => row.id === event.id)
          ? previous
          : [event, ...previous].sort(compareNewest));
      })
      .subscribe();

    void loadInitial();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [campaignId]);

  async function loadMore() {
    if (loadingMore || !hasMore || !events.length) return;
    const oldest = events[events.length - 1];
    setLoadingMore(true);
    setError('');
    // Fetch older rows using a stable timestamp + UUID cursor.
    const cursor = `created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`;
    const { data, error: queryError } = await supabase.from('campaign_events')
      .select('id, campaign_id, character_id, audience, category, message, created_at')
      .eq('campaign_id', campaignId)
      .or(cursor)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE);
    if (queryError) setError(queryError.message);
    else {
      setEvents(previous => {
        const combined = new Map(previous.map(event => [event.id, event]));
        for (const event of (data ?? []) as CampaignEvent[]) combined.set(event.id, event);
        return [...combined.values()].sort(compareNewest);
      });
      setHasMore((data?.length ?? 0) === PAGE_SIZE);
    }
    setLoadingMore(false);
  }

  const names = useMemo(() => new Map(characters.map(c => [c.id, c.name])), [characters]);
  const visible = useMemo(() => events.filter(event => {
    const target = event.character_id ? names.get(event.character_id) ?? event.character_id : '';
    return (character === 'all' || event.character_id === character)
      && (audience === 'all' || event.audience === audience)
      && (category === 'all' || event.category === category)
      && (event.message + ' ' + target + ' ' + event.audience).toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => order === 'newest' ? compareNewest(a, b) : -compareNewest(a, b)), [events, character, audience, category, search, order, names]);

  return <section className="campaign-logs">
    <div className="campaign-logs-heading">
      <div><p>Complete event history for this campaign</p></div>
      <span>{visible.length} shown · {events.length} loaded</span>
    </div>
    <div className="campaign-logs-filters">
      <label className="campaign-logs-search">Search<input aria-label="Search logs" placeholder="Search messages or characters..." value={search} onChange={e => setSearch(e.target.value)} /></label>
      <label>Character<select value={character} onChange={e => setCharacter(e.target.value)}><option value="all">All characters</option>{characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Audience<select value={audience} onChange={e => setAudience(e.target.value)}><option value="all">All audiences</option><option value="gm">GM only</option><option value="campaign">Campaign</option><option value="character">Character</option></select></label>
      <label>Type<select value={category} onChange={e => setCategory(e.target.value)}><option value="all">All types</option><option value="system">System</option><option value="text">Text</option></select></label>
      <label>Order<select value={order} onChange={e => setOrder(e.target.value as 'newest' | 'oldest')}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
    </div>
    {error && <p className="campaign-logs-error" role="alert">{error}</p>}
    <div className="campaign-logs-table-wrap">
      <table className="campaign-logs-table">
        <thead><tr><th>Date / Time</th><th>Type</th><th>Audience</th><th>Character</th><th>Message</th></tr></thead>
        <tbody>
          {visible.map(event => <tr key={event.id} role={tarotFromLog(event.message) ? "button" : undefined} tabIndex={tarotFromLog(event.message) ? 0 : undefined} onClick={() => { const card = tarotFromLog(event.message); if (card) setSelectedCard(card); }} onKeyDown={e => { if (tarotFromLog(event.message) && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setSelectedCard(tarotFromLog(event.message)); } }} style={tarotFromLog(event.message) ? { cursor: "pointer" } : undefined}>
            <td className="campaign-logs-time">{new Date(event.created_at).toLocaleString()}</td>
            <td>{event.category}</td>
            <td>{event.audience}</td>
            <td>{event.character_id ? names.get(event.character_id) ?? event.character_id : '—'}</td>
            <td className="campaign-logs-message">{displayLogMessage(event.message)}</td>
          </tr>)}
        </tbody>
      </table>
      {loading && <p className="campaign-logs-empty">Loading events...</p>}
      {!loading && visible.length === 0 && <p className="campaign-logs-empty">{events.length ? 'No matching events.' : 'No events recorded yet.'}</p>}
    </div>
    <div className="campaign-logs-footer">
      <span>Read-only · Live updates enabled</span>
      <div>
        <button type="button" onClick={() => { setSearch(''); setCharacter('all'); setAudience('all'); setCategory('all'); setOrder('newest'); }}>Reset filters</button>
        {hasMore && <button type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Loading...' : 'Load older events'}</button>}
      </div>
    </div>
    {selectedCard && <TarotCardViewer index={selectedCard.index} onClose={() => setSelectedCard(null)} />}
  </section>;
}

function compareNewest(a: CampaignEvent, b: CampaignEvent) {
  const time = b.created_at.localeCompare(a.created_at);
  return time || b.id.localeCompare(a.id);
}
