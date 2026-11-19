import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MessageSquare, Users, Phone, Settings2, Send, RefreshCw, Eye } from 'lucide-react';
import { supabase } from './supabase';
import './GMPhone.css';
import GMCallControl from './GMCallControl';

type Thread = { conversation_id: string; npc_identity_id: string; npc_internal_name: string; npc_public_label: string; player_identity_id: string; player_name: string; last_message_at: string | null; last_message: string | null; unread_count: number };
type Message = { message_id: string; sender_identity_id: string; body: string; created_at: string };
const REVEAL_EVENT_PREFIX = '[GHOST//LINK IDENTITY REVEALED] ';
type Identity = { id: string; internal_name: string; display_name: string; anonymous: boolean };
type Tab = 'messages' | 'contacts' | 'calls' | 'settings';
const tabs: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'contacts', label: 'Identities & Contacts', icon: Users },
  { id: 'calls', label: 'Calls', icon: Phone },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];
const time = (value: string) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
// Preserve Supabase/PostgREST error details instead of rendering "[object Object]".
const describePhoneError = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    const fields = [
      value.code ? `Code: ${String(value.code)}` : '',
      value.message ? `Message: ${String(value.message)}` : '',
      value.details ? `Details: ${String(value.details)}` : '',
      value.hint ? `Hint: ${String(value.hint)}` : '',
    ].filter(Boolean);
    if (fields.length) return fields.join(' | ');
    try { return JSON.stringify(error); } catch { /* Fall back to string conversion. */ }
  }
  return String(error);
};
export default function GMPhone({ campaignId, campaignName, onRead }: { campaignId: string; campaignName: string; onRead?: () => void }) {
  const [tab, setTab] = useState<Tab>('messages');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [revealedConversations, setRevealedConversations] = useState<string[]>([]);
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [players, setPlayers] = useState<{id:string;name:string}[]>([]);
  const [contactNpcId, setContactNpcId] = useState('');
  const [contactGrants, setContactGrants] = useState<{npc_identity_id:string;character_id:string}[]>([]);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactRecipients, setContactRecipients] = useState<string[]>([]);
  const [contactReview, setContactReview] = useState(false);
  const [contactResult, setContactResult] = useState('');
  const [creatingIdentity, setCreatingIdentity] = useState(false);
  const [internalName, setInternalName] = useState('The Observer');
  const [publicName, setPublicName] = useState('Unknown Number');
  const [anonymous, setAnonymous] = useState(true);
  const [identityBusy, setIdentityBusy] = useState(false);
  const [selectedIdentity, setSelectedIdentity] = useState('');
  const [selectedConversation, setSelectedConversation] = useState('');
  const [newChat, setNewChat] = useState(false);
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [newChatRecipient, setNewChatRecipient] = useState('');
  const [playerIdentities, setPlayerIdentities] = useState<{ identity_id: string; character_id: string; player_name: string }[]>([]);
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
    const [t, n, p, reveals] = await Promise.all([
      supabase.rpc('phone_gm_threads', { p_campaign_id: campaignId }),
      supabase.rpc('phone_gm_identities', { p_campaign_id: campaignId }),
      supabase.from('characters').select('id,name').eq('campaign_id', campaignId).order('name'),
      supabase.rpc('phone_gm_reveals', { p_campaign_id: campaignId }),
    ]);
    if (t.error) throw t.error;
    // The GM-only RPC returns identities even when they have no conversations.
    const next = (t.data || []) as Thread[];
    setThreads(next);
    if (reveals.error) throw reveals.error;
    setRevealedConversations(((reveals.data || []) as {conversation_id:string}[]).map(r => r.conversation_id));
    if (n.error) throw n.error;
    setIdentities((n.data || []) as Identity[]);
    if (!p.error) setPlayers((p.data || []) as {id:string;name:string}[]);
    else setError(p.error.message);
    setSelectedIdentity(current => current || next[0]?.npc_identity_id || (n.data?.[0]?.id ?? ''));
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
  const selectedRevealed = !!selected && revealedConversations.includes(selected.conversation_id);
  const selectedAnonymous = !!selected && identities.some(i => i.id === selected.npc_identity_id && i.anonymous);
  const selectedPublicLabel = selectedRevealed ? selected?.npc_internal_name : selected?.npc_public_label;
  const revealIdentity = async () => {
    if (!selected || !selectedAnonymous || selectedRevealed || revealing) return;
    setRevealing(true); setError('');
    try {
      const result = await supabase.rpc('phone_reveal_conversation_identity', { p_conversation_id: selected.conversation_id });
      if (result.error) throw result.error;
      await Promise.all([refresh(), read(selected.conversation_id)]);
      setConfirmReveal(false);
    } catch (e) { setError(describePhoneError(e)); }
    finally { setRevealing(false); }
  };
  const loadContactGrants = useCallback(async () => {
    const result = await supabase.rpc('phone_gm_contact_grants', { p_campaign_id: campaignId });
    if (result.error) throw result.error;
    setContactGrants((result.data || []) as {npc_identity_id:string;character_id:string}[]);
  }, [campaignId]);
  useEffect(() => {
    if (tab !== 'contacts') return;
    void loadContactGrants().catch(e => setError(describePhoneError(e)));
  }, [tab, loadContactGrants]);
  const sendContacts = async () => {
    if (!contactNpcId || !contactRecipients.length || contactBusy) return;
    setContactBusy(true); setError('');
    try {
      const result = await supabase.rpc('phone_gm_distribute_contact', {
        p_campaign_id: campaignId, p_npc_identity_id: contactNpcId,
        p_character_ids: contactRecipients,
      });
      if (result.error) throw result.error;
      await loadContactGrants();
      setContactResult('Contact delivered to ' + String(result.data ?? 0) + ' new recipient(s).');
      setContactRecipients([]); setContactReview(false);
    } catch (e) { setError(describePhoneError(e)); }
    finally { setContactBusy(false); }
  };
  const setContactAccess = async (characterId: string, allowed: boolean) => {
    if (!contactNpcId || contactBusy) return;
    setContactBusy(true); setError('');
    try {
      const result = await supabase.rpc('phone_gm_set_contact_access', {
        p_campaign_id: campaignId, p_npc_identity_id: contactNpcId,
        p_character_id: characterId, p_allowed: allowed,
      });
      if (result.error) throw result.error;
      await loadContactGrants();
    } catch (e) { setError(describePhoneError(e)); }
    finally { setContactBusy(false); }
  };
  const allIdentities = identities.length ? identities : Array.from(new Map(threads.map(t => [t.npc_identity_id, { id: t.npc_identity_id, internal_name: t.npc_internal_name, display_name: t.npc_public_label, anonymous: t.npc_public_label === 'Unknown Number' }])).values());
  const shown = threads.filter(t => !selectedIdentity || t.npc_identity_id === selectedIdentity);
  const createIdentity = async () => {
    const internal = internalName.trim();
    const display = publicName.trim();
    if (!internal || !display) { setError('Enter an internal name and a public contact name or alias.'); return; }
    if (allIdentities.some(identity => identity.internal_name.toLowerCase() === internal.toLowerCase())) {
      setError('An NPC identity with that internal name already exists.'); return;
    }
    setIdentityBusy(true); setError('');
    try {
      const result = await supabase.rpc('phone_create_npc', {
        p_campaign_id: campaignId, p_internal_name: internal,
        p_display_name: display, p_anonymous: anonymous,
      });
      if (result.error) throw result.error;
      await refresh();
      const createdId = typeof result.data === 'string' ? result.data : result.data?.id;
      if (createdId) { setSelectedIdentity(createdId); setContactNpcId(createdId); }
      setContactRecipients([]); setContactReview(false); setContactResult('');
      setSelectedConversation('');
      setCreatingIdentity(false);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setIdentityBusy(false); }
  };
  const startNewChat = async () => {
    if (!selectedIdentity) return;
    setBusy(true); setError('');
    try {
      const sync = await supabase.rpc('phone_sync_players', { p_campaign_id: campaignId });
      if (sync.error) throw sync.error;
      const result = await supabase.rpc('phone_gm_player_identities', { p_campaign_id: campaignId });
      if (result.error) throw result.error;
      setPlayerIdentities((result.data || []) as { identity_id: string; character_id: string; player_name: string }[]);
      setNewChatRecipient(''); setRecipientPickerOpen(true);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const send = async () => {
    const recipient = newChat ? playerIdentities.find(p => p.identity_id === newChatRecipient) : null;
    const senderId = newChat ? selectedIdentity : selected?.npc_identity_id;
    const recipientId = newChat ? recipient?.identity_id : selected?.player_identity_id;
    if (!senderId || !recipientId || !draft.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const result = await supabase.rpc('phone_send_message', { p_sender_identity_id: senderId, p_recipient_identity_id: recipientId, p_body: draft.trim() });
      if (result.error) throw result.error;
      setDraft('');
      if (newChat) {
        const updated = await supabase.rpc('phone_gm_threads', { p_campaign_id: campaignId });
        if (updated.error) throw updated.error;
        const next = (updated.data || []) as Thread[];
        setThreads(next);
        const opened = next.find(t => t.npc_identity_id === senderId && t.player_identity_id === recipientId);
        if (!opened) throw new Error('Message sent, but conversation could not be opened. Refresh to find it.');
        setNewChat(false);
        setRecipientPickerOpen(false);
        setSelectedConversation(opened.conversation_id);
        await read(opened.conversation_id);
      } else if (selected) {
        await Promise.all([refresh(), read(selected.conversation_id)]);
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <section className="gm-ghost" aria-label="Ghost Link GM communications">
    <header className="gm-ghost-header"><div className="gm-ghost-brand"><img src="/ghost-link-icon.svg" width={43} height={43} alt="Ghost Link icon"/><div><strong>GHOST//LINK</strong><small>GM COMMUNICATIONS WORKSTATION</small></div></div><div className="gm-ghost-network">● NETWORK TERMINAL <small>{campaignName}</small></div></header>
    <nav className="gm-ghost-tabs" aria-label="Ghost Link tools">{tabs.map(item => <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><item.icon size={15}/>{item.label}</button>)}</nav>
    {tab === 'messages' ? <div className="gm-ghost-workstation">
      <aside className="gm-ghost-identities"><div className="gm-ghost-section-title">NPC IDENTITIES <span>{allIdentities.length}</span></div>
        {allIdentities.map(identity => <button key={identity.id} className={'gm-ghost-entry ' + (selectedIdentity === identity.id ? 'active' : '')} onClick={() => { setSelectedIdentity(identity.id); setConfirmReveal(false); setSelectedConversation(''); setNewChat(false); setRecipientPickerOpen(false); setNewChatRecipient(''); }}><span className="gm-ghost-avatar">?</span><span><strong>{identity.internal_name || identity.display_name}</strong><small>{identity.anonymous ? 'Anonymous · ' + identity.display_name : identity.display_name}</small></span>{threads.filter(t => t.npc_identity_id === identity.id).reduce((n,t) => n + Number(t.unread_count || 0),0) > 0 && <b className="gm-ghost-unread">{threads.filter(t => t.npc_identity_id === identity.id).reduce((n,t) => n + Number(t.unread_count || 0),0)}</b>}</button>)}
      </aside>
      <aside className="gm-ghost-threads"><div className="gm-ghost-section-title">CONVERSATIONS <span>{shown.length}</span></div>
        <button type="button" className="gm-ghost-create-trigger" aria-expanded={recipientPickerOpen} disabled={!selectedIdentity || busy} onClick={() => { if (recipientPickerOpen) setRecipientPickerOpen(false); else void startNewChat(); }}>{recipientPickerOpen ? "− New Chat" : "+ New Chat"}</button>
        {recipientPickerOpen && <div className="gm-ghost-recipient-picker"><strong>SELECT CHARACTER</strong>{!playerIdentities.length && <p className="gm-ghost-muted">No player characters available.</p>}{playerIdentities.map(p => <button type="button" key={p.identity_id} className="gm-ghost-recipient-option" onClick={() => { const existing = threads.find(t => t.npc_identity_id === selectedIdentity && t.player_identity_id === p.identity_id); setRecipientPickerOpen(false); setNewChatRecipient(p.identity_id); setDraft(""); if (existing) { setNewChat(false); setSelectedConversation(existing.conversation_id); } else { setNewChat(true); setSelectedConversation(""); } }}><span className="gm-ghost-avatar player">{p.player_name.slice(0,1).toUpperCase()}</span><span>{p.player_name}</span></button>)}</div>}
        {shown.map(thread => <button key={thread.conversation_id} className={'gm-ghost-entry ' + (selectedConversation === thread.conversation_id ? 'active' : '')} onClick={() => { setNewChat(false); setRecipientPickerOpen(false); setSelectedConversation(thread.conversation_id); setConfirmReveal(false); setDraft(''); void read(thread.conversation_id).catch(e => setError(e instanceof Error ? e.message : String(e))); }}><span className="gm-ghost-avatar player">{thread.player_name.slice(0,1).toUpperCase()}</span><span><strong>{thread.player_name}</strong><small>{thread.npc_internal_name} → {thread.player_name}</small><small className="gm-ghost-preview">{thread.last_message || 'New conversation'}</small></span>{Number(thread.unread_count) > 0 && <b className="gm-ghost-unread">{thread.unread_count}</b>}</button>)}
        {!shown.length && <p className="gm-ghost-muted">No conversations for this identity yet.</p>}
      </aside>
      <main className="gm-ghost-chat">{newChat ? <><div className="gm-ghost-chat-header"><div><strong>NEW CONVERSATION</strong><small>Sending as: {allIdentities.find(i => i.id === selectedIdentity)?.internal_name || 'NPC'}</small></div><button type="button" className="gm-ghost-cancel-chat" onClick={() => { setNewChat(false); setNewChatRecipient(""); setDraft(""); }}>Cancel</button></div><div className="gm-ghost-new-chat"><p>To: {playerIdentities.find(p => p.identity_id === newChatRecipient)?.player_name || "Player"}</p><p>The conversation will appear when you send the first message.</p></div><form className="gm-ghost-compose" onSubmit={e => { e.preventDefault(); void send(); }}><input aria-label="First NPC message" maxLength={4000} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Write the first message..."/><button disabled={!newChatRecipient || !draft.trim() || busy} type="submit"><Send size={15}/> SEND</button></form></> : selected ? <><div className="gm-ghost-chat-header"><div><strong>{selected.player_name} ↔ {selected.npc_internal_name}</strong><small>Sending as: {selectedPublicLabel}</small></div>{selectedAnonymous && !selectedRevealed ? <button type="button" className="gm-ghost-tag gm-ghost-tag-action" title={'Reveal identity to ' + selected.player_name} aria-label={'Reveal identity to ' + selected.player_name} onClick={() => setConfirmReveal(true)}>ANONYMOUS <Eye size={12} aria-hidden="true" /></button> : <span className="gm-ghost-tag">{selectedRevealed ? 'IDENTIFIED' : 'NPC IDENTITY'}</span>}</div>{confirmReveal && <div className="gm-ghost-reveal-confirm" role="group" aria-label="Confirm identity reveal"><strong>Reveal identity?</strong><p>Reveal <b>{selected.npc_internal_name}</b> to <b>{selected.player_name}</b>? Only this player will see the NPC's name, including in earlier messages.</p><small>This action is permanent.</small><div><button type="button" onClick={() => setConfirmReveal(false)} disabled={revealing}>Cancel</button><button type="button" onClick={() => void revealIdentity()} disabled={revealing}>{revealing ? 'Revealing…' : 'Reveal Identity'}</button></div></div>}
        <div className="gm-ghost-history" ref={historyRef} onScroll={handleHistoryScroll}>{messages.map(message => <div key={message.message_id} className={'gm-ghost-bubble ' + (message.sender_identity_id === selected.npc_identity_id && message.body.startsWith(REVEAL_EVENT_PREFIX) ? ' gm-ghost-system-event' : message.sender_identity_id === selected.npc_identity_id ? 'out' : 'in') + (glowingMessageIds.includes(message.message_id) ? ' gm-ghost-unread-glow' : '')}><div>{message.sender_identity_id === selected.npc_identity_id && message.body.startsWith(REVEAL_EVENT_PREFIX) ? <><strong>GHOST//LINK · IDENTITY REVEALED</strong><span>{message.body.slice(REVEAL_EVENT_PREFIX.length)}</span></> : message.body}</div><small>{message.sender_identity_id === selected.npc_identity_id && message.body.startsWith(REVEAL_EVENT_PREFIX) ? time(message.created_at) : (message.sender_identity_id === selected.npc_identity_id ? selected.npc_internal_name : selected.player_name) + ' · ' + time(message.created_at)}</small></div>)}{!messages.length && <p className="gm-ghost-muted">No messages loaded.</p>}</div>
        <form className="gm-ghost-compose" onSubmit={e => { e.preventDefault(); void send(); }}><input aria-label="NPC message" maxLength={4000} value={draft} onChange={e => setDraft(e.target.value)} placeholder={'Send as ' + selected.npc_internal_name + '...'} /><button disabled={!draft.trim() || busy} type="submit"><Send size={15}/> SEND</button></form>
      </> : <div className="gm-ghost-empty">Select a conversation to begin messaging.</div>}</main>
    </div> : tab === 'contacts' ? <section className="gm-ghost-player-directory">
      <div className="gm-ghost-identity-directory">
        {allIdentities.map(identity => <button type="button" key={identity.id}
          className={'gm-ghost-identity-choice' + (contactNpcId === identity.id ? ' active' : '')}
          onClick={() => { setContactNpcId(identity.id); setContactRecipients([]); setContactReview(false); setContactResult(''); }}>
          <strong>{identity.internal_name}</strong>
          <small>{identity.anonymous ? 'Anonymous · shared alias: ' + identity.display_name : 'Public · ' + identity.display_name}</small>
        </button>)}
      </div>
        <button type="button" className="gm-ghost-create-trigger" onClick={() => { setCreatingIdentity(v => !v); setError(''); }}>+ New Identity</button>
        {creatingIdentity && <form className="gm-ghost-create-form" onSubmit={e => { e.preventDefault(); void createIdentity(); }}>
          <strong>CREATE NPC IDENTITY</strong>
          <label>Internal name (GM only)<input maxLength={100} value={internalName} onChange={e => setInternalName(e.target.value)}/></label>
          <label>Public contact name / alias<input maxLength={100} value={publicName} onChange={e => setPublicName(e.target.value)}/></label>
          <label className="gm-ghost-check"><input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)}/> Anonymous — unsolicited messages remain masked; shared contacts show the alias</label>
          <div className="gm-ghost-create-actions"><button type="button" onClick={() => setCreatingIdentity(false)}>Cancel</button><button type="submit" disabled={identityBusy || !internalName.trim() || !publicName.trim()}>{identityBusy ? 'Creating…' : 'Create Identity'}</button></div>
        </form>}

      <h3>CONTACT ACCESS</h3>
      {contactNpcId && <>
        <div className="gm-ghost-player-list">{players.map(player => {
          const allowed = contactGrants.some(grant => grant.npc_identity_id === contactNpcId && grant.character_id === player.id);
          return <div key={player.id} className="gm-ghost-player-row gm-ghost-contact-row">
            <span className="gm-ghost-avatar player">{player.name.slice(0,1).toUpperCase()}</span>
            <span><strong>{player.name}</strong><small>{allowed ? 'Already shared' : 'Not shared'}</small></span>
            {allowed ? <button type="button" className="gm-ghost-contact-revoke" disabled={contactBusy} onClick={() => void setContactAccess(player.id,false)}>Revoke</button>
              : <input type="checkbox" checked={contactRecipients.includes(player.id)} disabled={contactBusy || contactReview} onChange={e => setContactRecipients(current => e.target.checked ? [...current,player.id] : current.filter(id => id !== player.id))} aria-label={'Send contact to ' + player.name}/>}
          </div>;
        })}</div>
        {contactReview ? <div className="gm-ghost-contact-review" role="group" aria-label="Review contact distribution">
          <strong>REVIEW DISTRIBUTION</strong>
          <p>NPC: {identities.find(i => i.id === contactNpcId)?.internal_name}</p>
          <p>Player sees: {identities.find(i => i.id === contactNpcId)?.display_name || 'Unknown Number'}</p>
          <p>Recipients: {players.filter(p => contactRecipients.includes(p.id)).map(p => p.name).join(', ')}</p>
          <p>Each new recipient receives a persistent Ghost//Link notification.</p>
          <div className="gm-ghost-contact-actions"><button type="button" disabled={contactBusy} onClick={() => setContactReview(false)}>Back</button><button type="button" disabled={contactBusy} onClick={() => void sendContacts()}>{contactBusy ? 'Sending…' : 'Confirm & Send'}</button></div>
        </div> : <div className="gm-ghost-contact-actions"><button type="button" disabled={contactBusy || contactRecipients.length===0} onClick={() => setContactReview(true)}>Review Distribution ({contactRecipients.length})</button></div>}
        {contactResult && <p className="gm-ghost-contact-success" role="status">{contactResult}</p>}
      </>}
      {!identities.length && <p>Create an NPC identity above to begin sharing contacts.</p>}
      {!players.length && <p>No player characters found in this campaign.</p>}
    </section> : tab === 'calls' ? <GMCallControl campaignId={campaignId} identities={allIdentities} players={players} /> : <section className="gm-ghost-future" aria-label="Ghost Link future capabilities">
      <h3>GHOST//LINK — SETTINGS</h3>
      <p>FUTURE SYSTEM CAPABILITIES · CONCEPTS ONLY</p>
      <p>Ghost//Link is more than a messaging application. Future updates may allow the GM to manipulate the campaign's communication network, creating opportunities for deception, surveillance, interference, and narrative events.</p>
      <div className="gm-ghost-feature-grid">
        {[
          ['Network Control', 'Simulate network outages, communication blackouts, restricted zones, signal jamming, and temporary disruptions affecting individual characters or the entire campaign.'],
          ['Communication & Identity', 'Introduce spoofed caller identities, intercepted messages, anonymous transmissions, suspicious contacts, and calls originating from compromised devices.'],
          ['Surveillance & Netrunning', 'Allow netrunners to trace calls, intercept communications, discover hidden identities, and potentially compromise a communication channel. Network security and cyberware could influence these interactions.'],
          ['Notifications & Immersion', 'Configure how calls and messages reach players. Future possibilities include emergency transmissions, priority alerts, corrupted messages, signal interference, and deliberately misleading notifications.'],
          ['Automated Events', 'Schedule messages, calls, and other transmissions to occur after delays or when specific campaign conditions are met, allowing the GM to prepare narrative sequences in advance.'],
          ['Network Diagnostics', 'Monitor player connectivity, message delivery, and synchronization. Provide tools for identifying communication failures and restoring a player\'s connection without interrupting the session.'],
        ].map(([heading, description]) => <div key={heading} className="gm-ghost-feature"><strong>{heading}</strong><p>{description}</p></div>)}
      </div>
      <p>These are potential future features, not currently active settings. Their implementation will depend on the development of the communication and campaign-event systems.</p>
    </section>}
    {loading && <p className="gm-ghost-muted">Connecting to Ghost//Link...</p>}
    {error && <p className="gm-ghost-error" role="alert">{error} <button onClick={() => { setError(''); void refresh().catch(e => setError(String(e))); }}><RefreshCw size={14}/> Retry</button></p>}
    <footer className="gm-ghost-footer">● GHOST//LINK NETWORK <span>DESKTOP / TABLET TERMINAL</span></footer>
  </section>;
}
