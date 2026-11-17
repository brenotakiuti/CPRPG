import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, LockKeyhole, MessageSquare, Send, ShieldAlert, UserRound } from 'lucide-react';
import { supabase } from './supabase';
import './PlayerPhone.css';

type Contact = { identity_id: string; kind: string; label: string; anonymous: boolean; can_message: boolean; can_call: boolean; has_conversation: boolean };
type Thread = { conversation_id: string; other_identity_id: string; other_label: string; other_anonymous: boolean; last_message_at: string | null; last_message: string | null; unread_count: number };
type Message = { message_id: string; sender_identity_id: string; body: string; created_at: string };

export default function PlayerPhone({ characterId, onBack }: { characterId: string; onBack: () => void }) {
  const [selfId, setSelfId] = useState('');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<{ id: string; label: string; conversationId?: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [directory, setDirectory] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const historyRef = useRef<HTMLDivElement | null>(null);
  const historyNearBottom = useRef(true);
  const historyPrevious = useRef({ conversation: '', lastMessage: '' });
  const handleHistoryScroll = useCallback(() => {
    const node = historyRef.current;
    if (!node) return;
    historyNearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
  }, []);
  useLayoutEffect(() => {
    const node = historyRef.current;
    const conversation = selected?.conversationId || selected?.id;
    if (!node || !conversation) return;
    const lastMessage = messages[messages.length - 1]?.message_id || '';
    const previous = historyPrevious.current;
    const changedConversation = previous.conversation !== conversation;
    const changedLastMessage = previous.lastMessage !== lastMessage;
    if (changedConversation || changedLastMessage) {
      const shouldScroll = changedConversation || historyNearBottom.current ||
        (messages.length > 0 && messages[messages.length - 1].sender_identity_id === selfId);
      if (shouldScroll) {
        node.scrollTo({ top: node.scrollHeight, behavior: changedConversation ? 'instant' : 'smooth' });
        historyNearBottom.current = true;
      }
      historyPrevious.current = { conversation, lastMessage };
    }
  }, [selected?.conversationId, selected?.id, messages, selfId]);

  const [animatedMessageIds, setAnimatedMessageIds] = useState<string[]>([]);
  const [pulsingThreads, setPulsingThreads] = useState<string[]>([]);
  const [signalPulse, setSignalPulse] = useState(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const selfRef = useRef(selfId);
  selfRef.current = selfId;
  const knownMessages = useRef(new Set<string>());
  const pendingIncomingAnimation = useRef(new Set<string>());
  const initializedConversations = useRef(new Set<string>());
  const pulseTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { pulseTimers.current.forEach(clearTimeout); }, []);
  // Start the slide only after the new bubble is actually present in the DOM.
  useEffect(() => {
    const arrived = messages.filter(m => pendingIncomingAnimation.current.has(m.message_id) && m.sender_identity_id !== selfId);
    if (!arrived.length) return;
    arrived.forEach(m => pendingIncomingAnimation.current.delete(m.message_id));
    const ids = arrived.map(m => m.message_id);
    setAnimatedMessageIds(current => [...new Set([...current, ...ids])]);
    const timer = setTimeout(() => setAnimatedMessageIds(current => current.filter(id => !ids.includes(id))), 450);
    pulseTimers.current.push(timer);
  }, [messages, selfId]);
  const refresh = useCallback(async () => {
    const [t, d] = await Promise.all([
      supabase.rpc('phone_threads', { p_character_id: characterId }),
      supabase.rpc('phone_directory', { p_character_id: characterId }),
    ]);
    if (t.error || d.error) throw new Error(t.error?.message || d.error?.message);
    setThreads((t.data || []) as Thread[]);
    setContacts((d.data || []) as Contact[]);
  }, [characterId]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const identity = await supabase.rpc('phone_ensure_player_identity', { p_character_id: characterId });
        if (identity.error) throw identity.error;
        if (cancelled) return;
        setSelfId(identity.data as string);
        await refresh();
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [characterId, refresh]);
  const markRead = useCallback(async (conversationId: string) => {
    if (!selfId) return;
    const result = await supabase.rpc('phone_mark_read', { p_conversation_id: conversationId, p_reader_identity_id: selfId });
    if (result.error) throw result.error;
    await refresh();
  }, [selfId, refresh]);
  const read = useCallback(async (conversationId: string) => {
    const result = await supabase.rpc('phone_read_messages', { p_conversation_id: conversationId, p_limit: 100 });
    if (result.error) throw result.error;
    const next = ((result.data || []) as Message[]).reverse();
    // The first load is history, not a new-message event.
    if (!initializedConversations.current.has(conversationId)) {
      next.forEach(m => knownMessages.current.add(m.message_id));
      initializedConversations.current.add(conversationId);
    }
    setMessages(next);
    await markRead(conversationId);
  }, [markRead]);
  useEffect(() => {
    if (!selected?.conversationId) { setMessages([]); return; }
    let cancelled = false;
    read(selected.conversationId).catch(e => { if (!cancelled) setError(String(e.message || e)); });
    return () => { cancelled = true; };
  }, [selected?.conversationId, read]);
  useEffect(() => {
    const channel = supabase.channel('ghost-link-' + characterId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'phone_messages' }, payload => {
        const incoming = payload.new as { id?: string; sender_identity_id?: string; conversation_id?: string };
        if (incoming.sender_identity_id === selfRef.current) return;
        const current = selectedRef.current;
        if (incoming.id && !knownMessages.current.has(incoming.id)) {
          knownMessages.current.add(incoming.id);
          if (current?.conversationId === incoming.conversation_id) {
            pendingIncomingAnimation.current.add(incoming.id);
          } else if (incoming.conversation_id) {
            setPulsingThreads(ids => [...new Set([...ids, incoming.conversation_id!])]);
            const timer = setTimeout(() => setPulsingThreads(ids => ids.filter(id => id !== incoming.conversation_id)), 650);
            pulseTimers.current.push(timer);
          }
          setSignalPulse(true);
          const timer = setTimeout(() => setSignalPulse(false), 350);
          pulseTimers.current.push(timer);
        }
        void refresh().catch(() => {});
        if (current?.conversationId) void read(current.conversationId).catch(() => {});
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [characterId, refresh, read]);
  const openThread = (t: Thread) => { setError(''); setDirectory(false); setSelected({ id: t.other_identity_id, label: t.other_label, conversationId: t.conversation_id }); };
  const openContact = (c: Contact) => {
    const existing = threads.find(t => t.other_identity_id === c.identity_id);
    setError(''); setDirectory(false);
    setSelected({ id: c.identity_id, label: c.label, conversationId: existing?.conversation_id });
  };
  const send = async () => {
    if (!selected || !selfId || !draft.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const response = await supabase.rpc('phone_send_message', {
        p_sender_identity_id: selfId, p_recipient_identity_id: selected.id, p_body: draft.trim(),
      });
      if (response.error) throw response.error;
      setDraft('');
      await refresh();
      const result = await supabase.rpc('phone_threads', { p_character_id: characterId });
      if (result.error) throw result.error;
      const thread = ((result.data || []) as Thread[]).find(t => t.other_identity_id === selected.id);
      if (thread) { setSelected(s => s ? { ...s, conversationId: thread.conversation_id } : s); await read(thread.conversation_id); }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const time = (date: string) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return <section className="ghost-link" aria-label="Ghost Link messaging">
    <header className={"ghost-top" + (signalPulse ? " ghost-signal-pulse" : "")}><span><img src="/ghost-link-icon.svg" width={26} height={26} alt="" aria-hidden="true"/> GHOST//LINK</span><span><LockKeyhole size={13}/> PRIVATE CHANNEL</span></header>
    {!selected ? <>
      <div className="ghost-heading"><button onClick={onBack} aria-label="Return to dashboard"><ArrowLeft size={20}/></button><div><h2>{directory ? 'CONTACTS' : 'SIGNAL INBOX'}</h2><small>PRIVATE COMMUNICATION NETWORK</small></div><button onClick={() => setDirectory(!directory)} aria-label={directory ? 'Show inbox' : 'New conversation'}><MessageSquare size={21}/></button></div>
      {loading && <p className="ghost-muted">Connecting to network...</p>}
      {!loading && (directory ? contacts.length === 0 : threads.length === 0) && <p className="ghost-muted">{directory ? 'No contacts available.' : 'No conversations yet. Select the message icon to find contacts.'}</p>}
      <div className="ghost-list">
        {directory ? contacts.filter(c => c.can_message).map(c => <button key={c.identity_id} className="ghost-contact" onClick={() => openContact(c)}><UserRound size={24}/><span><strong>{c.label}</strong><small>{c.anonymous ? 'MASKED IDENTITY' : c.kind === 'player' ? 'PLAYER CONTACT' : 'REGISTERED CONTACT'}</small></span></button>)
          : threads.map(t => <button key={t.conversation_id} className={"ghost-contact" + (pulsingThreads.includes(t.conversation_id) ? " ghost-contact-pulse" : "")} onClick={() => openThread(t)}><UserRound size={24}/><span><strong>{t.other_label}</strong><small>{t.last_message || 'New conversation'}</small></span>{Number(t.unread_count) > 0 && <b className="ghost-unread">{t.unread_count}</b>}</button>)}
      </div>
    </> : <>
      <div className="ghost-heading"><button onClick={() => { setSelected(null); void refresh().catch(() => {}); }} aria-label="Back to inbox"><ArrowLeft size={20}/></button><UserRound size={27}/><div><h2>{selected.label}</h2><small>{contacts.find(c => c.identity_id === selected.id)?.anonymous || selected.label === 'Unknown Number' ? 'IDENTITY MASKED' : 'SECURE CONNECTION'}</small></div></div>
      <div className="ghost-status"><ShieldAlert size={15}/> {selected.label === 'Unknown Number' ? 'UNREGISTERED SIGNAL' : 'PRIVATE COMMUNICATION'}</div>
      <div className="ghost-messages" ref={historyRef} onScroll={handleHistoryScroll}>{messages.length === 0 && <p className="ghost-muted">No messages yet.</p>}{messages.map(m => <div key={m.message_id} className={'ghost-bubble ' + (m.sender_identity_id === selfId ? 'outgoing' : 'incoming') + (animatedMessageIds.includes(m.message_id) ? ' ghost-quick-pop' : '')}><span>{m.body}</span><small>{time(m.created_at)}</small></div>)}</div>
      <form className="ghost-compose" onSubmit={e => { e.preventDefault(); void send(); }}><input value={draft} onChange={e => setDraft(e.target.value)} maxLength={4000} placeholder="Transmit message..." aria-label="Message"/><button type="submit" disabled={busy || !draft.trim()} aria-label="Send message"><Send size={19}/></button></form>
    </>}
    {error && <p className="ghost-error" role="alert">{error}</p>}
    <footer className="ghost-footer"><LockKeyhole size={12}/> GHOST//LINK • NETWORK ACTIVE</footer>
  </section>;
}
