import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import './PlayerDirectMessages.css';
type Mode='disabled'|'private'|'monitored';
type Entry={id:string;sender:string;recipient:string;body:string;created_at:string};
export function GMDirectMessageSettings({campaignId}:{campaignId:string}){
 const [mode,setMode]=useState<Mode>('disabled');
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 useEffect(()=>{
  let active=true;
  void supabase.rpc('phone_player_dm_mode',{p_campaign_id:campaignId}).then(r=>{
   if(!active)return;
   if(r.error)setError(r.error.message);else setMode(r.data as Mode);
  });
  return()=>{active=false};
 },[campaignId]);
 const save=async(next:Mode)=>{
  setSaving(true);setError('');setNotice('');
  const result=await supabase.rpc('phone_player_dm_set_mode',{p_campaign_id:campaignId,p_mode:next});
  if(result.error)setError(result.error.message);
  else{setMode(next);setNotice('Messaging policy saved. Changes apply immediately. Existing messages are retained.')}
  setSaving(false);
 };
 return <section className="gl-dm-settings">
  <h3>Communications // Player-to-Player Messaging</h3>
  <p>Choose whether characters can send each other direct messages.</p>
  {([
   ['disabled','Disabled','Players cannot send direct messages.'],
   ['private','Enabled','Player conversations are private from the GM interface.'],
   ['monitored','Enabled — GM Monitoring','The GM can read all player-to-player messages; players are warned when opening chat.']
  ] as const).map(([id,label,description])=><label key={id} className="gl-dm-mode"><input type="radio" name="player-dm-mode" checked={mode===id} disabled={saving} onChange={()=>void save(id)}/><span><strong>{label}</strong><small>{description}</small></span></label>)}
  {notice&&<p role="status">{notice}</p>}
  {error&&<p role="alert" className="gl-direct-error">{error}</p>}
 </section>;
}
export function GMDirectMessageMonitor({campaignId}:{campaignId:string}){
 const [mode,setMode]=useState<Mode>('disabled');
 const [entries,setEntries]=useState<Entry[]>([]);
 const [selected,setSelected]=useState<string|null>(null);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const refresh=useCallback(async()=>{
  const status=await supabase.rpc('phone_player_dm_mode',{p_campaign_id:campaignId});
  if(status.error)throw status.error;
  const next=status.data as Mode;
  setMode(next);
  if(next!=='monitored'){setEntries([]);setSelected(null);setError('');return;}
  const result=await supabase.rpc('phone_player_dm_monitor',{p_campaign_id:campaignId});
  if(result.error)throw result.error;
  setEntries((result.data??[]) as Entry[]);
  setError('');
 },[campaignId]);
 useEffect(()=>{
  setLoading(true);
  void refresh().catch(e=>setError(e instanceof Error?e.message:String(e))).finally(()=>setLoading(false));
  const interval=window.setInterval(()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:String(e)))},5000);
  return()=>window.clearInterval(interval);
 },[refresh]);
 // A conversation is an unordered pair. The existing monitor RPC returns character names,
 // not IDs; this groups both directions together without changing the current database.
 const conversationKey=(m:Entry)=>[m.sender,m.recipient].sort((a,b)=>a.localeCompare(b)).join('\\u0000');
 const conversations=Array.from(new Map(entries.map(m=>[conversationKey(m),m])).entries()).map(([key,latest])=>({
  key,latest,participants:key.split('\\u0000')
 })).sort((a,b)=>b.latest.created_at.localeCompare(a.latest.created_at));
 const active=selected && conversations.some(c=>c.key===selected)?selected:conversations[0]?.key??null;
 const current=conversations.find(c=>c.key===active);
 const history=entries.filter(m=>conversationKey(m)===active).sort((a,b)=>a.created_at.localeCompare(b.created_at));
 return <section className="gm-ghost-dm-monitor" aria-label="Player direct message monitoring">
  {loading&&<p className="gm-ghost-muted">Connecting to player message monitor...</p>}
  {!loading&&mode!=='monitored'&&<div className="gm-ghost-placeholder">Player message monitoring is disabled. Private conversations cannot be viewed by the GM.</div>}
  {!loading&&mode==='monitored'&&<div className="gm-ghost-dm-workstation">
   <aside className="gm-ghost-threads">
    <div className="gm-ghost-section-title">PLAYER CONVERSATIONS <span>{conversations.length}</span></div>
    {conversations.map(c=><button type="button" key={c.key} className={'gm-ghost-entry'+(active===c.key?' active':'')} onClick={()=>setSelected(c.key)}>
     <span className="gm-ghost-avatar player">{c.participants[0]?.slice(0,1).toUpperCase()||'P'}</span>
     <span><strong>{c.participants.join(' ↔ ')}</strong><small className="gm-ghost-preview">{c.latest.sender}: {c.latest.body}</small></span>
    </button>)}
    {!conversations.length&&<p className="gm-ghost-muted">No player conversations yet.</p>}
   </aside>
   <main className="gm-ghost-chat">
    {current?<><div className="gm-ghost-chat-header"><div><strong>{current.participants.join(' ↔ ')}</strong><small>PLAYER DIRECT MESSAGES</small></div><span className="gm-ghost-tag">READ ONLY</span></div>
     <div className="gm-ghost-history gm-ghost-dm-history" key={active}>
      {history.map(m=><div key={m.id} className={'gm-ghost-bubble '+(m.sender===current.participants[0]?'out':'in')}>
       <strong className="gm-ghost-dm-sender">{m.sender}</strong>
       <span>{m.body}</span><small>{new Date(m.created_at).toLocaleString()}</small>
      </div>)}
     </div>
     <div className="gm-ghost-dm-readonly">MONITORING CHANNEL · READ ONLY</div>
    </>:<div className="gm-ghost-empty">Select a player conversation to view messages.</div>}
   </main>
  </div>}
  {error&&<p role="alert" className="gm-ghost-error">{error}</p>}
 </section>;
}
