import './PlayerDirectMessages.css';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, LockKeyhole, Mail, Send, ShieldAlert, Smartphone, UserRound, LogOut, Wifi } from 'lucide-react';
import { supabase } from './supabase';
import './PlayerPhone.css';
import { getHistory, putHistory, appendHistory, removeHistoryId, historyKey } from './phoneMessageCache';

type Contact = { identity_id: string; kind: string; label: string; anonymous: boolean; can_message: boolean; can_call: boolean; has_conversation: boolean };
type ContactNotice = { id: string; message: string; created_at: string };
type Thread = { conversation_id: string; other_identity_id: string; other_label: string; other_anonymous: boolean; last_message_at: string | null; last_message: string | null; unread_count: number };
type Message = { message_id: string; sender_identity_id: string; body: string; created_at: string };
const REVEAL_EVENT_PREFIX = '[GHOST//LINK IDENTITY REVEALED] ';
const phoneErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [e.message, e.details, e.hint].filter((value): value is string => typeof value === 'string' && value.length > 0);
    if (parts.length) return [e.code ? String(e.code) : '', ...parts].filter(Boolean).join(' — ');
    try { return JSON.stringify(error); } catch { /* Fall through. */ }
  }
  return String(error);
};


export default function PlayerPhone({ characterId, onBack }: { characterId: string; onBack: () => void }) {
  const [dmMode,setDmMode]=useState<'disabled'|'private'|'monitored'>('disabled');
  const [monitorNoticeExpanded,setMonitorNoticeExpanded]=useState(false);
  const [dmContacts,setDmContacts]=useState<{id:string;name:string}[]>([]);
  const [dmThreads,setDmThreads]=useState<{other_character_id:string;other_label:string;last_message:string;last_message_at:string}[]>([]);
  const [dmUnread,setDmUnread]=useState<Record<string,number>>({});
  const dmSeen=useRef<Record<string,string>>({});
  const dmInitial=useRef(false);
  const dmCampaignId=useRef('');
  const dmAlerted=useRef<Record<string,string>>({});
  const [selfId, setSelfId] = useState('');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactNotices, setContactNotices] = useState<ContactNotice[]>([]);
  const noticeStorageKey = 'ghost-link-contact-notices-read-' + characterId;
  const [readNoticeIds, setReadNoticeIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('ghost-link-contact-notices-read-' + characterId) || '[]') as string[]; }
    catch { return []; }
  });
  const [page, setPage] = useState(0);
  const [toast, setToast] = useState('');
  const [attentionPulse, setAttentionPulse] = useState<'messages' | 'notifications' | null>(null);
  const attentionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialNoticesLoaded = useRef(false);
  const knownNoticeIds = useRef(new Set<string>());
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [revealedIdentities, setRevealedIdentities] = useState<Record<string,string>>({});
  const [selected, setSelected] = useState<{ id: string; label: string; conversationId?: string; kind?: 'player' } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const activeHistoryKey=useRef('');
  const historyRequests=useRef(new Map<string,Promise<void>>());
  const [expandedContact, setExpandedContact] = useState<string | null>(null);
  const [calling, setCalling] = useState(false);
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

  const [pulsingThreads, setPulsingThreads] = useState<string[]>([]);
  const [signalPulse, setSignalPulse] = useState(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const selfRef = useRef(selfId);
  selfRef.current = selfId;
  const knownMessages = useRef(new Set<string>());
  const initializedConversations = useRef(new Set<string>());
  const pulseTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => {
    pulseTimers.current.forEach(clearTimeout);
    if (attentionTimer.current) clearTimeout(attentionTimer.current);
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);
  const alertIncoming = useCallback((kind: 'messages' | 'notifications', text: string) => {
    setAttentionPulse(kind);
    if (attentionTimer.current) clearTimeout(attentionTimer.current);
    attentionTimer.current = setTimeout(() => setAttentionPulse(null), 600);
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2800);
  }, []);
  const refresh = useCallback(async () => {
    const [t, r, shared, notices] = await Promise.all([
      supabase.rpc('phone_threads', { p_character_id: characterId }),
      supabase.rpc('phone_player_reveals', { p_character_id: characterId }),
      supabase.rpc('phone_player_shared_contacts', { p_character_id: characterId }),
      supabase.from('campaign_events')
        .select('id,message,created_at')
        .eq('character_id',characterId).eq('audience','character')
        .eq('category','system')
        .like('message','[GHOST//LINK CONTACT RECEIVED] %')
        .order('created_at',{ascending:false}).limit(100),
    ]);
    if (t.error || r.error || shared.error || notices.error) throw new Error(t.error?.message || r.error?.message || shared.error?.message || notices.error?.message);
    setRevealedIdentities(Object.fromEntries(((r.data || []) as {identity_id:string;revealed_name:string}[]).map(x => [x.identity_id,x.revealed_name])));
    setThreads((t.data || []) as Thread[]);
    // Only explicitly distributed NPC contacts belong in Contacts.
    // An unsolicited anonymous message belongs in the inbox, not the address book.
    setContacts(((shared.data || []) as Contact[]).filter(c => c.kind === 'npc'));
    const nextNotices = (notices.data || []) as ContactNotice[];
    if (initialNoticesLoaded.current) {
      const incoming = nextNotices.find(n => !knownNoticeIds.current.has(n.id));
      if (incoming) alertIncoming('notifications', 'NEW CONTACT RECEIVED');
    }
    nextNotices.forEach(n => knownNoticeIds.current.add(n.id));
    initialNoticesLoaded.current = true;
    setContactNotices(nextNotices);
  }, [characterId, alertIncoming]);
  const refreshDM = useCallback(async () => {
    if(!dmCampaignId.current){
      const character=await supabase.from('characters').select('campaign_id').eq('id',characterId).single();
      if(character.error)throw character.error;
      dmCampaignId.current=character.data.campaign_id;
    }
    const [mode,contacts,threads]=await Promise.all([
      supabase.rpc('phone_player_dm_mode',{p_campaign_id:dmCampaignId.current}),
      supabase.rpc('phone_player_dm_contacts',{p_character_id:characterId}),
      supabase.rpc('phone_player_dm_threads',{p_character_id:characterId}),
    ]);
    if(mode.error||contacts.error||threads.error)throw mode.error??contacts.error??threads.error;
    const nextMode=mode.data as 'disabled'|'private'|'monitored';
    setDmMode(nextMode);
    setDmContacts((contacts.data??[]) as {id:string;name:string}[]);
    const next=(threads.data??[]) as {other_character_id:string;other_label:string;last_message:string;last_message_at:string}[];
    setDmThreads(next);
    if(nextMode==='disabled'){setDmUnread({});if(selectedRef.current?.kind==='player')setSelected(null);return;}
    const unread:Record<string,number>={};
    let hasNew=false;
    for(const thread of next){
      const id=thread.other_character_id;
      const seen=dmSeen.current[id];
      if(!seen && !dmInitial.current){dmSeen.current[id]=thread.last_message_at;continue;}
      if(selectedRef.current?.kind==='player' && selectedRef.current.id===id)continue;
      if(!seen || thread.last_message_at>seen){
        unread[id]=1;
        if(dmAlerted.current[id]!==thread.last_message_at){hasNew=true;dmAlerted.current[id]=thread.last_message_at;}
      }
    }
    setDmUnread(unread);
    if(dmInitial.current && hasNew)alertIncoming('messages','NEW PLAYER MESSAGE');
    dmInitial.current=true;
  },[characterId,alertIncoming]);
  useEffect(()=>{
    void refreshDM().catch(e=>setError(phoneErrorMessage(e)));
    const interval=window.setInterval(()=>{void refreshDM().catch(()=>{})},10000);
    return()=>window.clearInterval(interval);
  },[refreshDM]);
  const readDM=useCallback(async(id:string)=>{
    const key=historyKey(characterId,'player',id);
    const existing=historyRequests.current.get(key);
    if(existing)return existing;
    const request=(async()=>{
      const cached=getHistory(key);
      const last=cached?.filter(m=>!m.message_id.startsWith('pending:')).at(-1);
      const result=last
        ?await supabase.rpc('phone_player_dm_since',{p_character_id:characterId,p_other_character_id:id,p_after:last.created_at,p_after_id:last.message_id})
        :await supabase.rpc('phone_player_dm_history',{p_character_id:characterId,p_other_character_id:id});
      if(result.error)throw result.error;
      const next=((result.data??[]) as {id:string;sender_id:string;body:string;created_at:string}[]).map(m=>({
        message_id:m.id,sender_identity_id:m.sender_id,body:m.body,created_at:m.created_at
      }));
      // Keep pending messages until the server confirms them, and deduplicate by UUID.
      const merged=putHistory(key,[...(cached??[]),...next]);
      if(activeHistoryKey.current===key)setMessages(merged);
      if(merged.length){
        const lastSeen=merged.filter(m=>!m.message_id.startsWith('pending:')).at(-1);
        if(lastSeen){dmSeen.current[id]=lastSeen.created_at;dmAlerted.current[id]=lastSeen.created_at;}
      }
      setDmUnread(current=>({...current,[id]:0}));
    })();
    historyRequests.current.set(key,request);
    try{await request}finally{historyRequests.current.delete(key)}
  },[characterId]);
  useEffect(()=>{
    if(selected?.kind!=='player'||dmMode==='disabled')return;
    void readDM(selected.id).catch(e=>setError(phoneErrorMessage(e)));
    // Realtime notifications drive active history; visibility recovery handles missed events.
  },[selected?.id,selected?.kind,dmMode,readDM]);
  useEffect(()=>{
    if(dmMode==='disabled')return;
    let channel:ReturnType<typeof supabase.channel>|null=null;
    let disposed=false;
    const connect=async()=>{
      if(!dmCampaignId.current)return;
      await supabase.realtime.setAuth();
      if(disposed)return;
      channel=supabase.channel('ghost-dm:'+characterId,{config:{private:true}})
        .on('broadcast',{event:'new-message'},({payload})=>{
          const sender=String(payload?.sender??'');
          const recipient=String(payload?.recipient??'');
          const other=sender===characterId?recipient:sender;
          if(!other)return;
          const current=selectedRef.current;
          if(current?.kind==='player'&&current.id===other)void readDM(other).catch(()=>{});
          else if(sender!==characterId)alertIncoming('messages','NEW PLAYER MESSAGE');
          void refreshDM().catch(()=>{});
        }).subscribe(status=>{
          if(status==='SUBSCRIBED'){
            void refreshDM().catch(()=>{});
            const current=selectedRef.current;
            if(current?.kind==='player')void readDM(current.id).catch(()=>{});
          }
        });
    };
    void connect().catch(()=>{});
    const recover=()=>{
      if(document.visibilityState!=='visible')return;
      void refreshDM().catch(()=>{});
      const current=selectedRef.current;
      if(current?.kind==='player')void readDM(current.id).catch(()=>{});
    };
    document.addEventListener('visibilitychange',recover);
    window.addEventListener('online',recover);
    return()=>{disposed=true;document.removeEventListener('visibilitychange',recover);window.removeEventListener('online',recover);if(channel)void supabase.removeChannel(channel)};
  },[characterId,dmMode,readDM,refreshDM,alertIncoming]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const identity = await supabase.rpc('phone_ensure_player_identity', { p_character_id: characterId });
        if (identity.error) throw identity.error;
        if (cancelled) return;
        setSelfId(identity.data as string);
        await refresh();
      } catch (e) { if (!cancelled) setError(phoneErrorMessage(e)); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [characterId, refresh]);
  const markRead = useCallback(async (conversationId: string) => {
    if (!selfId) return;
    const result = await supabase.rpc('phone_mark_read', { p_conversation_id: conversationId, p_reader_identity_id: selfId });
    if (result.error) throw result.error;
    // Update unread metadata without reloading contacts and notices.
    setThreads(current=>current.map(t=>t.conversation_id===conversationId?{...t,unread_count:0}:t));
  }, [selfId]);
  const read = useCallback(async (conversationId: string) => {
    const result = await supabase.rpc('phone_read_messages', { p_conversation_id: conversationId, p_limit: 100 });
    if (result.error) throw result.error;
    const next = ((result.data || []) as Message[]).reverse();
    // The first load is history, not a new-message event.
    if (!initializedConversations.current.has(conversationId)) {
      next.forEach(m => knownMessages.current.add(m.message_id));
      initializedConversations.current.add(conversationId);
    }
    const key=historyKey(characterId,'npc',conversationId);
    const cached=putHistory(key,next);
    if(activeHistoryKey.current===key)setMessages(cached);
    void markRead(conversationId).catch(()=>{});
  }, [markRead,characterId]);
  useEffect(() => {
    if (selected?.kind==='player')return;
    if (!selected?.conversationId) { if(!selected)setMessages([]); return; }
    let cancelled = false;
    read(selected.conversationId).catch(e => { if (!cancelled) setError(phoneErrorMessage(e)); });
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
            // Active conversation is refreshed below; no bubble animation.
          } else if (incoming.conversation_id) {
            setPulsingThreads(ids => [...new Set([...ids, incoming.conversation_id!])]);
            alertIncoming('messages', 'NEW MESSAGE RECEIVED');
            const timer = setTimeout(() => setPulsingThreads(ids => ids.filter(id => id !== incoming.conversation_id)), 650);
            pulseTimers.current.push(timer);
          }
          setSignalPulse(true);
          const timer = setTimeout(() => setSignalPulse(false), 350);
          pulseTimers.current.push(timer);
        }
        void refresh().catch(() => {});
        if (current?.conversationId && current.kind!=='player') void read(current.conversationId).catch(() => {});
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'campaign_events', filter: 'character_id=eq.' + characterId }, () => {
        setSignalPulse(true);
        void refresh().catch(() => {});
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [characterId, refresh, read, alertIncoming]);
  const labelFor = (id: string, fallback: string) => revealedIdentities[id] || contacts.find(c => c.identity_id === id)?.label || fallback;
  const openPlayer=(id:string,label:string)=>{const key=historyKey(characterId,'player',id);activeHistoryKey.current=key;setMessages(getHistory(key)??[]);setError('');setMonitorNoticeExpanded(false);setPage(1);setSelected({id,label,kind:'player'});};
  const openThread = (t: Thread) => { const key=historyKey(characterId,'npc',t.conversation_id);activeHistoryKey.current=key;setMessages(getHistory(key)??[]);setError(''); setPage(1); setSelected({ id: t.other_identity_id, label: labelFor(t.other_identity_id,t.other_label), conversationId: t.conversation_id }); };
  const openContact = (c: Contact) => {
    const existing = threads.find(t => t.other_identity_id === c.identity_id);
    setError(''); setPage(1);
    if(existing?.conversation_id){const key=historyKey(characterId,'npc',existing.conversation_id);activeHistoryKey.current=key;setMessages(getHistory(key)??[])}else{activeHistoryKey.current='';setMessages([])}
    setSelected({ id: c.identity_id, label: labelFor(c.identity_id,c.label), conversationId: existing?.conversation_id });
  };
  const callContact = async (c: Contact) => {
    if (calling || c.kind !== 'npc' || !c.can_call) return;
    setCalling(true); setError('');
    try {
      const result = await supabase.rpc('phone_player_start_call', { p_character_id: characterId, p_npc_identity_id: c.identity_id });
      if (result.error) throw result.error;
    } catch (e) { setError(phoneErrorMessage(e)); }
    finally { setCalling(false); }
  };
  const selectedLabel = selected ? (selected.kind==='player'?selected.label:labelFor(selected.id,selected.label)) : '';
  const selectedMasked = !!selected && selectedLabel === 'Unknown Number';
  const send = async () => {
    if (!selected || !selfId || !draft.trim() || busy || (selected.kind==='player'&&dmMode==='disabled')) return;
    setBusy(true); setError('');
    try {
      if(selected.kind==='player'){
        const key=historyKey(characterId,'player',selected.id);
        const text=draft.trim();const tempId='pending:'+crypto.randomUUID();
        const optimistic={message_id:tempId,sender_identity_id:characterId,body:text,created_at:new Date().toISOString()};
        setMessages(appendHistory(key,optimistic));setDraft('');
        const result=await supabase.rpc('phone_player_dm_send',{p_character_id:characterId,p_recipient_character_id:selected.id,p_body:text});
        if(result.error){setMessages(removeHistoryId(key,tempId));setDraft(text);throw result.error;}
        await readDM(selected.id);
        void refreshDM().catch(()=>{});return;
      }
      const text=draft.trim();
      const conversationId=selected.conversationId;
      const key=conversationId?historyKey(characterId,'npc',conversationId):'';
      const tempId='pending:'+crypto.randomUUID();
      if(key){setMessages(appendHistory(key,{message_id:tempId,sender_identity_id:selfId,body:text,created_at:new Date().toISOString()}));}
      setDraft('');
      const response = await supabase.rpc('phone_send_message', {
        p_sender_identity_id: selfId, p_recipient_identity_id: selected.id, p_body:text,
      });
      if (response.error) {
        if(key)setMessages(removeHistoryId(key,tempId));
        setDraft(text);
        throw response.error;
      }
      if(conversationId){
        void read(conversationId).catch(()=>{});
        setThreads(current=>current.map(t=>t.conversation_id===conversationId?{...t,last_message:text,last_message_at:new Date().toISOString()}:t));
      }else{
        const result=await supabase.rpc('phone_threads',{p_character_id:characterId});
        if(result.error)throw result.error;
        const next=(result.data||[]) as Thread[];
        setThreads(next);
        const thread=next.find(t=>t.other_identity_id===selected.id);
        if(thread){setSelected(current=>current?{...current,conversationId:thread.conversation_id}:current);void read(thread.conversation_id).catch(()=>{});}
      }
    } catch (e) { setError(phoneErrorMessage(e)); }
    finally { setBusy(false); }
  };
  const changePage = (delta: number) => {
    setSelected(null);
    setExpandedContact(null);
    setPage(current => (current + delta + 4) % 4);
  };
  useEffect(() => {
    if (page === 3 && contactNotices.length) {
      const ids = [...new Set([...readNoticeIds, ...contactNotices.map(n => n.id)])];
      if (ids.length !== readNoticeIds.length) {
        try { localStorage.setItem(noticeStorageKey, JSON.stringify(ids)); } catch { /* Ignore storage errors. */ }
        setReadNoticeIds(ids);
      }
    }
  }, [page, contactNotices, readNoticeIds, noticeStorageKey]);
  const unreadNotices = contactNotices.filter(n => !readNoticeIds.includes(n.id)).length;
  const unreadMessages = threads.reduce((sum, thread) => sum + Math.max(0, Number(thread.unread_count) || 0), 0)+Object.values(dmUnread).reduce((a,b)=>a+b,0);
  const time = (date: string) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return <section className="ghost-link ghost-carousel" aria-label="Ghost Link messaging">
    <header className={"ghost-top" + (signalPulse ? " ghost-signal-pulse" : "")}>
      <span><img src="/ghost-link-icon.svg" width={26} height={26} alt="" aria-hidden="true"/> GHOST//LINK</span>
      <span><LockKeyhole size={13}/> PRIVATE CHANNEL</span>
    </header>
    {toast && <div className="ghost-carousel-toast" role="status">{toast}</div>}
    <div className="ghost-carousel-stage"
      onTouchStart={e => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={e => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start) return;
        const dx = e.changedTouches[0].clientX - start.x;
        const dy = e.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) changePage(dx < 0 ? 1 : -1);
      }}>
      <div className="ghost-carousel-track" style={{ transform: `translateX(-${page * 25}%)` }}>
        <section className="ghost-carousel-slide" aria-hidden={page !== 0}>
          <div className="ghost-carousel-hero">
            <div className="ghost-carousel-emblem"><img src="/ghost-link-icon.svg" alt="" aria-hidden="true"/></div>
            <h1>GHOST//LINK</h1>
            <p>PRIVATE COMMUNICATION NETWORK</p>
            <small>● SIGNAL ESTABLISHED</small>
          </div>
        </section>
        <section className="ghost-carousel-slide" aria-hidden={page !== 1}>
          {!selected ? <>
            <div className="ghost-carousel-heading"><h2>SIGNAL INBOX</h2><small>ENCRYPTED MESSAGES</small></div>
            
            {!loading && threads.length === 0 && dmThreads.length===0 && <p className="ghost-muted">No conversations yet. Find a contact in Contacts.</p>}
            <div className="ghost-list">
              {[...threads.map(t=>({...t,kind:'npc' as const})),...dmThreads.map(t=>({conversation_id:'dm:'+t.other_character_id,other_identity_id:t.other_character_id,other_label:t.other_label,other_anonymous:false,last_message_at:t.last_message_at,last_message:t.last_message,unread_count:dmUnread[t.other_character_id]||0,kind:'player' as const}))].sort((a,b)=>(b.last_message_at||'').localeCompare(a.last_message_at||'')).map(t => <button key={t.conversation_id} className={"ghost-contact" + (pulsingThreads.includes(t.conversation_id) ? " ghost-contact-pulse" : "")} onClick={() => t.kind==='player'?openPlayer(t.other_identity_id,t.other_label):openThread(t)}>
                <UserRound size={24}/><span><strong>{t.kind==='player'?t.other_label:labelFor(t.other_identity_id,t.other_label)}</strong><small>{t.last_message || 'New conversation'}</small></span>
                {Number(t.unread_count) > 0 && <b className="ghost-unread">{t.unread_count}</b>}
              </button>)}
            </div>
          </> : <>
            <div className="ghost-heading"><button onClick={() => { setSelected(null); void refresh().catch(() => {}); }} aria-label="Back to inbox"><ArrowLeft size={20}/></button><UserRound size={27}/><div><h2>{selectedLabel}</h2><small>{selectedMasked ? 'IDENTITY MASKED' : 'SECURE CONNECTION'}</small></div></div>
            <div className="ghost-status"><ShieldAlert size={15}/> {selected.kind==='player' ? 'PLAYER DIRECT MESSAGE' : selectedMasked ? 'UNREGISTERED SIGNAL' : 'PRIVATE COMMUNICATION'}</div>
            {selected.kind==='player' && dmMode==='monitored' && <div className="gl-monitor-notice" role="note"><div className="gl-monitor-notice-heading"><span><ShieldAlert size={16}/> GM MONITORING ACTIVE</span><button type="button" aria-expanded={monitorNoticeExpanded} onClick={()=>setMonitorNoticeExpanded(value=>!value)}>{monitorNoticeExpanded?'Hide details':'Details'} <ChevronDown size={14} className={monitorNoticeExpanded?'expanded':''}/></button></div>{monitorNoticeExpanded&&<p>The GM can read player-to-player messages in this campaign. Ask the GM to change this under Ghost//Link Settings if you want private conversations.</p>}</div>}
            <div className="ghost-messages" ref={historyRef} onScroll={handleHistoryScroll}>
              {messages.length === 0 && <p className="ghost-muted">No messages yet.</p>}
              {messages.map(m => selected.kind!=='player' && m.body.startsWith(REVEAL_EVENT_PREFIX) ?
                <div key={m.message_id} className="ghost-reveal-event" role="status"><div className="ghost-reveal-title">GHOST//LINK · IDENTITY REVEALED</div><div className="ghost-reveal-description">{m.body.slice(REVEAL_EVENT_PREFIX.length)}</div><time className="ghost-reveal-time" dateTime={m.created_at}>{time(m.created_at)}</time></div> :
                <div key={m.message_id} className={'ghost-bubble ' + (m.sender_identity_id === (selected.kind==='player'?characterId:selfId) ? 'outgoing' : 'incoming')}><span>{m.body}</span><small>{time(m.created_at)}</small></div>)}
            </div>
            <form className="ghost-compose" onSubmit={e => { e.preventDefault(); void send(); }}><input value={draft} onChange={e => setDraft(e.target.value)} maxLength={4000} placeholder="Transmit message..." aria-label="Message"/><button type="submit" disabled={busy || !draft.trim()} aria-label="Send message"><Send size={19}/></button></form>
          </>}
        </section>
        <section className="ghost-carousel-slide" aria-hidden={page !== 2}>
          <div className="ghost-carousel-heading"><h2>CONTACTS</h2><small>REGISTERED IDENTITIES</small></div>
          {loading && <p className="ghost-muted">Connecting to network...</p>}
          {!loading && contacts.filter(c => c.can_message || c.can_call).length === 0 && dmContacts.length===0 && <p className="ghost-muted">No contacts available.</p>}
          <div className="ghost-list">
            {dmContacts.map(c=><div key={c.id} className="ghost-contact-expand"><button type="button" className="ghost-contact" aria-expanded={expandedContact===c.id} onClick={()=>setExpandedContact(current=>current===c.id?null:c.id)}><UserRound size={24}/><span><strong>{c.name}</strong><small>PLAYER CHARACTER</small></span><ChevronDown size={18}/></button><div className={'ghost-contact-reveal'+(expandedContact===c.id?' open':'')} aria-hidden={expandedContact!==c.id}><div className="ghost-contact-actions"><button type="button" onClick={()=>openPlayer(c.id,c.name)}><Mail size={19}/> Message</button></div></div></div>)}
            {contacts.filter(c => c.kind === 'npc' && (c.can_message || c.can_call)).map(c => <div key={c.identity_id} className="ghost-contact-expand">
              <button type="button" className="ghost-contact" aria-expanded={expandedContact === c.identity_id} onClick={() => setExpandedContact(current => current === c.identity_id ? null : c.identity_id)}>
                <UserRound size={24}/><span><strong>{labelFor(c.identity_id,c.label)}</strong><small>{c.anonymous && !revealedIdentities[c.identity_id] ? 'ANONYMOUS CONTACT' : 'REGISTERED CONTACT'}</small></span><ChevronDown size={18} className={expandedContact === c.identity_id ? 'ghost-contact-chevron expanded' : 'ghost-contact-chevron'}/>
              </button>
              <div className={'ghost-contact-reveal' + (expandedContact === c.identity_id ? ' open' : '')} aria-hidden={expandedContact !== c.identity_id}><div className="ghost-contact-actions">
                {c.can_message && <button type="button" onClick={() => openContact(c)}><Mail size={19}/> Message</button>}
                {c.can_call && <button type="button" disabled={calling} onClick={() => void callContact(c)}><Smartphone size={19}/> {calling ? 'Calling…' : 'Call'}</button>}
              </div></div>
            </div>)}
          </div>
        </section>
        <section className="ghost-carousel-slide" aria-hidden={page !== 3}>
          <div className="ghost-carousel-heading"><h2>NOTIFICATIONS</h2><small>NETWORK ACTIVITY</small></div>
          <div className="ghost-contact-notices">
            {contactNotices.length === 0 && <p className="ghost-muted">No contact deliveries yet.</p>}
            {contactNotices.map(n => <div key={n.id} className={'ghost-contact-notice' + (!readNoticeIds.includes(n.id) ? ' unread' : '')}>
              <strong>GHOST//LINK · NEW CONTACT RECEIVED</strong>
              <span>{n.message.slice('[GHOST//LINK CONTACT RECEIVED] '.length)} added to your directory.</span>
              <small>{new Date(n.created_at).toLocaleString()}</small>
            </div>)}
          </div>
        </section>
      </div>
    </div>
    {error && <p className="ghost-error" role="alert">{error}</p>}
    <nav className="ghost-carousel-nav" aria-label="Ghost Link pages">
      <button type="button" onClick={() => changePage(-1)} aria-label="Previous page"><ChevronLeft size={23}/></button>
      <div className="ghost-carousel-dots" aria-label={['Ghost Link', 'Messages', 'Contacts', 'Notifications'][page]}>
        {[0,1,2,3].map(i => {
          const count = i === 1 ? unreadMessages : i === 3 ? unreadNotices : 0;
          return <span key={i} className={'ghost-carousel-indicator' + (i === page ? ' active' : '') + (attentionPulse === (i === 1 ? 'messages' : i === 3 ? 'notifications' : null) && (i === 1 || i === 3) ? ' pulse' : '')} aria-label={['Title', 'Messages', 'Contacts', 'Notifications'][i] + (count ? ': ' + count + ' unread' : '')}>
            <span className="ghost-carousel-indicator-mark"/>
            {count > 0 && <span className="ghost-carousel-indicator-count">{count > 99 ? '99+' : count}</span>}
          </span>;
        })}
      </div>
      <button type="button" onClick={() => changePage(1)} aria-label="Next page"><ChevronRight size={23}/></button>
    </nav>
    <footer className="ghost-footer"><button type="button" onClick={onBack} aria-label="Exit Ghost Link" title="Exit Ghost Link"><LogOut size={19}/></button><span title="Network active" aria-label="Network active"><Wifi size={18}/> ONLINE</span></footer>
  </section>;
}
