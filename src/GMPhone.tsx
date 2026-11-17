import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MessageSquare, Users, VenetianMask, Phone, Settings2, Send, RefreshCw } from 'lucide-react';
import { supabase } from './supabase';
import './GMPhone.css';

type Thread = { conversation_id: string; npc_identity_id: string; npc_internal_name: string; npc_public_label: string; player_identity_id: string; player_name: string; last_message_at: string | null; last_message: string | null; unread_count: number };
type Message = { message_id: string; sender_identity_id: string; body: string; created_at: string };
type Identity = { id: string; internal_name: string; display_name: string; anonymous: boolean };
type Tab = 'messages' | 'contacts' | 'identities' | 'calls' | 'settings';
const tabs: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'contacts', label: 'Contacts & Access', icon: Users },
  { id: 'identities', label: 'NPC Identities', icon: VenetianMask },
  { id: 'calls', label: 'Call Control', icon: Phone },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];
const time = (value: string) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export default function GMPhone({ campaignId, campaignName, onRead }: { campaignId: string; campaignName: string; onRead?: () => void }) {
  const [tab, setTab] = useState<Tab>('messages');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [players, setPlayers] = useState<{id:string;name:string}[]>([]);
  const [creatingIdentity, setCreatingIdentity] = useState(false);
  const [internalName, setInternalName] = useState('The Observer');
  const [publicName, setPublicName] = useState('Unknown Number');
  const [anonymous, setAnonymous] = useState(true);
  const [identityBusy, setIdentityBusy] = useState(false);
  const [selectedIdentity, setSelectedIdentity] = useState('');
  const [selectedConversation, setSelectedConversation] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [glowingMessageIds, setGlowingMessageIds] = useState<string[]>([]);
  const glowPending = useRef(new Set<string>());
  const glowTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastGlowingConversation = useRef('');
  const historyRef = useRef<HTMLDivElement | null>(null);
  const historyPrevious = useRef({ conversation: '', lastMessage: '' });
  const scrollAnimation = useRef<number | null>(null);
  const markReadInFlight = useRef(new Set<string>());
  const clearReadGlow = useCallback(() => {
    // The glow countdown begins only when the conversation reaches the bottom.
    for (const id of glowPending.current) {
      glowPending.current.delete(id);
      const timer = setTimeout(() => {
        setGlowingMessageIds(current => current.filter(value => value !== id));
      }, 1200);
      glowTimers.current.push(timer);
    }
  }, []);
  useEffect(() => () => {
    glowTimers.current.forEach(clearTimeout);
    if (scrollAnimation.current !== null) cancelAnimationFrame(scrollAnimation.current);
  }, []);
  const selectedConversationRef = useRef('');
  const tabRef = useRef<Tab>('messages');
  selectedConversationRef.current = selectedConversation;
  tabRef.current = tab;
  const markConversationRead = useCallback(async (conversationId: string) => {
    if (!conversationId || markReadInFlight.current.has(conversationId)) return;
    markReadInFlight.current.add(conversationId);
    try {
      const marked = await supabase.rpc('phone_gm_mark_read', { p_conversation_id: conversationId });
      if (marked.error) throw marked.error;
      onRead?.();
      const updated = await supabase.rpc('phone_gm_threads', { p_campaign_id: campaignId });
      if (updated.error) throw updated.error;
      setThreads((updated.data || []) as Thread[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      markReadInFlight.current.delete(conversationId);
    }
  }, [campaignId, onRead, clearReadGlow]);
  const handleHistoryScroll = useCallback(() => {
    const node = historyRef.current;
    if (!node || !selectedConversationRef.current || tabRef.current !== 'messages') return;
    if (node.scrollHeight - node.scrollTop - node.clientHeight <= 8) {
      clearReadGlow();
      void markConversationRead(selectedConversationRef.current);
    }
  }, [markConversationRead, clearReadGlow]);
  useEffect(() => {
    if (!selectedConversation || tab !== 'messages') return;
    if (lastGlowingConversation.current !== selectedConversation) {
      lastGlowingConversation.current = selectedConversation;
      glowPending.current.clear();
      setGlowingMessageIds([]);
    }
    const thread = threads.find(t => t.conversation_id === selectedConversation);
    const unread = Number(thread?.unread_count || 0);
    if (!unread || !messages.length) return;
    const incoming = messages.filter(m => m.sender_identity_id !== thread?.npc_identity_id);
    const ids = incoming.slice(-unread).map(m => m.message_id);
    ids.forEach(id => glowPending.current.add(id));
    setGlowingMessageIds(current => {
      const merged = [...new Set([...current, ...ids])];
      return merged.length === current.length ? current : merged;
    });
  }, [selectedConversation, tab, threads, messages]);
  useLayoutEffect(() => {
    const node = historyRef.current;
    if (!node || !selectedConversation || tab !== 'messages') return;
    const lastMessage = messages[messages.length - 1]?.message_id || '';
    const previous = historyPrevious.current;
    if (previous.conversation !== selectedConversation || previous.lastMessage !== lastMessage) {
      const opening = previous.conversation !== selectedConversation;
      if (scrollAnimation.current !== null) cancelAnimationFrame(scrollAnimation.current);
      historyPrevious.current = { conversation: selectedConversation, lastMessage };
      const target = Math.max(0, node.scrollHeight - node.clientHeight);
      if (opening || !lastMessage) {
        node.scrollTop = target;
        clearReadGlow();
        if (messages.length) void markConversationRead(selectedConversation);
      } else {
        const from = node.scrollTop;
        const distance = target - from;
        if (distance <= 1) {
          node.scrollTop = target;
          clearReadGlow();
          if (messages.length) void markConversationRead(selectedConversation);
        } else {
          // Explicit timing avoids browser-dependent instant jumps on long conversations.
          const duration = Math.min(1400, Math.max(450, distance * 1.25));
          const started = performance.now();
          const step = (now: number) => {
            const t = Math.min(1, (now - started) / duration);
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            node.scrollTop = from + distance * eased;
            if (t < 1) scrollAnimation.current = requestAnimationFrame(step);
            else {
              scrollAnimation.current = null;
              node.scrollTop = target;
              clearReadGlow();
              if (messages.length) void markConversationRead(selectedConversation);
            }
          };
          scrollAnimation.current = requestAnimationFrame(step);
        }
      }
    }
  }, [selectedConversation, tab, messages, markConversationRead, clearReadGlow]);

  const refresh = useCallback(async () => {
    const [t, n, p] = await Promise.all([
      supabase.rpc('phone_gm_threads', { p_campaign_id: campaignId }),
      supabase.from('phone_identities').select('id,internal_name,display_name,anonymous').eq('campaign_id', campaignId).eq('kind', 'npc'),
      supabase.from('characters').select('id,name').eq('campaign_id', campaignId).order('name'),
    ]);
    if (t.error) throw t.error;
    // Identity listing may be restricted by RLS; conversation list still works.
    const next = (t.data || []) as Thread[];
    setThreads(next);
    if (!n.error) setIdentities((n.data || []) as Identity[]);
    if (!p.error) setPlayers((p.data || []) as {id:string;name:string}[]);
    else setError(p.error.message);
    setSelectedIdentity(current => current || next[0]?.npc_identity_id || (!n.error ? (n.data?.[0]?.id ?? '') : ''));
    setSelectedConversation(current => current && next.some(row => row.conversation_id === current) ? current : '');
  }, [campaignId]);
  const read = useCallback(async (conversationId: string) => {
    const result = await supabase.rpc('phone_read_messages', { p_conversation_id: conversationId, p_limit: 100 });
    if (result.error) throw result.error;
    setMessages(((result.data || []) as Message[]).reverse());

  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void refresh().catch(e => { if (active) setError(e.message || String(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);
  useEffect(() => {
    if (!selectedConversation || tab !== 'messages') { setMessages([]); return; }
    let active = true;
    void read(selectedConversation).catch(e => { if (active) setError(e.message || String(e)); });
    return () => { active = false; };
  }, [selectedConversation, tab, read]);
  useEffect(() => {
    const channel = supabase.channel('gm-ghost-link-' + campaignId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'phone_messages' }, () => {
        void refresh().catch(() => {});
        if (tabRef.current === 'messages' && selectedConversationRef.current) void read(selectedConversationRef.current).catch(() => {});
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [campaignId, refresh, read]);
  const selected = threads.find(t => t.conversation_id === selectedConversation);
  const allIdentities = identities.length ? identities : Array.from(new Map(threads.map(t => [t.npc_identity_id, { id: t.npc_identity_id, internal_name: t.npc_internal_name, display_name: t.npc_public_label, anonymous: t.npc_public_label === 'Unknown Number' }])).values());
  const shown = threads.filter(t => !selectedIdentity || t.npc_identity_id === selectedIdentity);
  const createIdentity = async () => {
    const internal = internalName.trim();
    const display = publicName.trim();
    if (!internal || (!anonymous && !display)) { setError('Enter the required identity names.'); return; }
    if (allIdentities.some(identity => identity.internal_name.toLowerCase() === internal.toLowerCase())) {
      setError('An NPC identity with that internal name already exists.'); return;
    }
    setIdentityBusy(true); setError('');
    try {
      const result = await supabase.rpc('phone_create_npc', {
        p_campaign_id: campaignId, p_internal_name: internal,
        p_display_name: anonymous ? 'Unknown Number' : display, p_anonymous: anonymous,
      });
      if (result.error) throw result.error;
      await refresh();
      const createdId = typeof result.data === 'string' ? result.data : result.data?.id;
      if (createdId) setSelectedIdentity(createdId);
      setSelectedConversation('');
      setCreatingIdentity(false);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setIdentityBusy(false); }
  };
  const send = async () => {
    if (!selected || !draft.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const result = await supabase.rpc('phone_send_message', { p_sender_identity_id: selected.npc_identity_id, p_recipient_identity_id: selected.player_identity_id, p_body: draft.trim() });
      if (result.error) throw result.error;
      setDraft('');
      await Promise.all([refresh(), read(selected.conversation_id)]);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <section className="gm-ghost" aria-label="Ghost Link GM communications">
    <header className="gm-ghost-header"><div className="gm-ghost-brand"><img src="/ghost-link-icon.svg" width={43} height={43} alt="Ghost Link icon"/><div><strong>GHOST//LINK</strong><small>GM COMMUNICATIONS WORKSTATION</small></div></div><div className="gm-ghost-network">● NETWORK TERMINAL <small>{campaignName}</small></div></header>
    <nav className="gm-ghost-tabs" aria-label="Ghost Link tools">{tabs.map(item => <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><item.icon size={15}/>{item.label}</button>)}</nav>
    {tab === 'messages' ? <div className="gm-ghost-workstation">
      <aside className="gm-ghost-identities"><div className="gm-ghost-section-title">NPC IDENTITIES <span>{allIdentities.length}</span></div>
        {allIdentities.map(identity => <button key={identity.id} className={'gm-ghost-entry ' + (selectedIdentity === identity.id ? 'active' : '')} onClick={() => { setSelectedIdentity(identity.id); setSelectedConversation(''); }}><span className="gm-ghost-avatar">?</span><span><strong>{identity.internal_name || identity.display_name}</strong><small>{identity.anonymous ? 'Anonymous' : identity.display_name}</small></span>{threads.filter(t => t.npc_identity_id === identity.id).reduce((n,t) => n + Number(t.unread_count || 0),0) > 0 && <b className="gm-ghost-unread">{threads.filter(t => t.npc_identity_id === identity.id).reduce((n,t) => n + Number(t.unread_count || 0),0)}</b>}</button>)}
        <button type="button" className="gm-ghost-create-trigger" onClick={() => { setCreatingIdentity(v => !v); setError(''); }}>+ New Identity</button>
        {creatingIdentity && <form className="gm-ghost-create-form" onSubmit={e => { e.preventDefault(); void createIdentity(); }}>
          <strong>CREATE NPC IDENTITY</strong>
          <label>Internal name (GM only)<input maxLength={100} value={internalName} onChange={e => setInternalName(e.target.value)}/></label>
          <label>Public display name<input maxLength={100} value={publicName} onChange={e => setPublicName(e.target.value)} disabled={anonymous}/></label>
          <label className="gm-ghost-check"><input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)}/> Anonymous — players see Unknown Number</label>
          <div className="gm-ghost-create-actions"><button type="button" onClick={() => setCreatingIdentity(false)}>Cancel</button><button type="submit" disabled={identityBusy || !internalName.trim() || (!anonymous && !publicName.trim())}>{identityBusy ? 'Creating…' : 'Create Identity'}</button></div>
        </form>}
      </aside>
      <aside className="gm-ghost-threads"><div className="gm-ghost-section-title">CONVERSATIONS <span>{shown.length}</span></div>
        {shown.map(thread => <button key={thread.conversation_id} className={'gm-ghost-entry ' + (selectedConversation === thread.conversation_id ? 'active' : '')} onClick={() => { setSelectedConversation(thread.conversation_id); setDraft(''); void read(thread.conversation_id).catch(e => setError(e instanceof Error ? e.message : String(e))); }}><span className="gm-ghost-avatar player">{thread.player_name.slice(0,1).toUpperCase()}</span><span><strong>{thread.player_name}</strong><small>{thread.npc_internal_name} → {thread.player_name}</small><small className="gm-ghost-preview">{thread.last_message || 'New conversation'}</small></span>{Number(thread.unread_count) > 0 && <b className="gm-ghost-unread">{thread.unread_count}</b>}</button>)}
        {!shown.length && <p className="gm-ghost-muted">No conversations for this identity yet.</p>}
      </aside>
      <main className="gm-ghost-chat">{selected ? <><div className="gm-ghost-chat-header"><div><strong>{selected.player_name} ↔ {selected.npc_internal_name}</strong><small>Sending as: {selected.npc_public_label}</small></div><span className="gm-ghost-tag">{selected.npc_public_label === 'Unknown Number' ? 'ANONYMOUS' : 'NPC IDENTITY'}</span></div>
        <div className="gm-ghost-history" ref={historyRef} onScroll={handleHistoryScroll}>{messages.map(message => <div key={message.message_id} className={'gm-ghost-bubble ' + (message.sender_identity_id === selected.npc_identity_id ? 'out' : 'in') + (glowingMessageIds.includes(message.message_id) ? ' gm-ghost-unread-glow' : '')}><div>{message.body}</div><small>{message.sender_identity_id === selected.npc_identity_id ? selected.npc_internal_name : selected.player_name} · {time(message.created_at)}</small></div>)}{!messages.length && <p className="gm-ghost-muted">No messages loaded.</p>}</div>
        <form className="gm-ghost-compose" onSubmit={e => { e.preventDefault(); void send(); }}><input aria-label="NPC message" maxLength={4000} value={draft} onChange={e => setDraft(e.target.value)} placeholder={'Send as ' + selected.npc_internal_name + '...'} /><button disabled={!draft.trim() || busy} type="submit"><Send size={15}/> SEND</button></form>
      </> : <div className="gm-ghost-empty">Select a conversation to begin messaging.</div>}</main>
    </div> : tab === 'contacts' ? <section className="gm-ghost-player-directory">
      <h3>PLAYER CHARACTER DIRECTORY <span>{players.length}</span></h3>
      <p>All characters in this campaign. NPC identities are managed separately.</p>
      <div className="gm-ghost-player-list">{players.map(player => <div key={player.id} className="gm-ghost-player-row"><span className="gm-ghost-avatar player">{player.name.slice(0,1).toUpperCase()}</span><span><strong>{player.name}</strong><small>Player character</small></span></div>)}</div>
      {!players.length && <p>No player characters found in this campaign.</p>}
    </section> : <div className="gm-ghost-future"><h3>{tabs.find(t => t.id === tab)?.label}</h3><div className="gm-ghost-feature-grid">{(tab === 'contacts' ? ['Player Directory', 'Grant NPC Contact', 'Revoke NPC Contact'] : tab === 'identities' ? ['Existing NPC Identities', 'Create NPC Identity', 'Reveal Anonymous Identity'] : tab === 'calls' ? ['Place Call', 'Incoming Calls', 'Active Call'] : ['Campaign Network', 'Notification Controls', 'Connection Diagnostics']).map(label => <div key={label} className="gm-ghost-feature"><strong>{label}</strong><small>COMING LATER</small></div>)}</div></div>}
    {loading && <p className="gm-ghost-muted">Connecting to Ghost//Link...</p>}
    {error && <p className="gm-ghost-error" role="alert">{error} <button onClick={() => { setError(''); void refresh().catch(e => setError(String(e))); }}><RefreshCw size={14}/> Retry</button></p>}
    <footer className="gm-ghost-footer">● GHOST//LINK NETWORK <span>DESKTOP / TABLET TERMINAL</span></footer>
  </section>;
}
