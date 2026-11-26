import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import './PlayerDirectMessages.css';

type Contact={id:string;name:string};
type Message={id:string;sender_id:string;body:string;created_at:string};
type Mode='disabled'|'private'|'monitored';
const explain=(e:unknown)=>e instanceof Error?e.message:String(e);
export default function PlayerDirectMessages({characterId,onClose}:{characterId:string;onClose:()=>void}){
 const [mode,setMode]=useState<Mode>('disabled');
 const [contacts,setContacts]=useState<Contact[]>([]);
 const [selected,setSelected]=useState('');
 const [messages,setMessages]=useState<Message[]>([]);
 const [draft,setDraft]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const load=useCallback(async()=>{
  const character=await supabase.from('characters').select('campaign_id').eq('id',characterId).single();
  if(character.error)throw character.error;
  const [m,c]=await Promise.all([
   supabase.rpc('phone_player_dm_mode',{p_campaign_id:character.data.campaign_id}),
   supabase.rpc('phone_player_dm_contacts',{p_character_id:characterId})
  ]);
  if(m.error||c.error)throw m.error??c.error;
  setMode(m.data as Mode);setContacts((c.data??[]) as Contact[]);
 },[characterId]);
 const loadHistory=useCallback(async(id:string)=>{
  const result=await supabase.rpc('phone_player_dm_history',{p_character_id:characterId,p_other_character_id:id});
  if(result.error)throw result.error;
  setMessages((result.data??[]) as Message[]);
 },[characterId]);
 useEffect(()=>{
  void load().catch(e=>setError(explain(e)));
  const interval=window.setInterval(()=>{void load().catch(e=>setError(explain(e)))},5000);
  return()=>window.clearInterval(interval);
 },[load]);
 useEffect(()=>{
  if(!selected||mode==='disabled'){setMessages([]);return;}
  void loadHistory(selected).catch(e=>setError(explain(e)));
  const interval=window.setInterval(()=>{void loadHistory(selected).catch(e=>setError(explain(e)))},4000);
  return()=>window.clearInterval(interval);
 },[selected,mode,loadHistory]);
 const send=async()=>{
  if(!selected||!draft.trim()||busy||mode==='disabled')return;
  setBusy(true);setError('');
  try{
   const result=await supabase.rpc('phone_player_dm_send',{p_character_id:characterId,p_recipient_character_id:selected,p_body:draft.trim()});
   if(result.error)throw result.error;
   setDraft('');await loadHistory(selected);
  }catch(e){setError(explain(e))}finally{setBusy(false)}
 };
 return <div className="gl-direct-messages">
  <div className="gl-direct-heading"><strong>GHOST//LINK // PLAYER MESSAGES</strong><button type="button" onClick={onClose}>Close</button></div>
  {mode==='monitored'&&<div className="gl-direct-warning" role="note"><strong>GM MONITORING ACTIVE</strong><p>In this campaign, all messages between players are monitored by the Game Master. If you want your conversations to be secret, ask the GM to change this in Campaign Settings.</p></div>}
  {mode==='disabled'?<p>Player-to-player messaging is disabled in this campaign.</p>:<>
   <div className="gl-direct-contacts">{contacts.map(c=><button type="button" key={c.id} className={selected===c.id?'active':''} onClick={()=>{setSelected(c.id);setMessages([]);setError('')}}>{c.name}</button>)}{!contacts.length&&<p>No other registered characters.</p>}</div>
   {selected&&<><div className="gl-direct-history">{messages.map(m=><div key={m.id} className={m.sender_id===characterId?'outgoing':'incoming'}><span>{m.body}</span><small>{new Date(m.created_at).toLocaleString()}</small></div>)}</div>
   <form className="gl-direct-compose" onSubmit={e=>{e.preventDefault();void send()}}><input aria-label="Direct message" maxLength={4000} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Send a direct message..."/><button type="submit" disabled={busy||!draft.trim()}>Send</button></form></>}
  </>}
  {error&&<p role="alert" className="gl-direct-error">{error}</p>}
 </div>;
}
