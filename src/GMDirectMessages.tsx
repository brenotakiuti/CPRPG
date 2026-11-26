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
 const [error,setError]=useState('');
 const refresh=useCallback(async()=>{
  const status=await supabase.rpc('phone_player_dm_mode',{p_campaign_id:campaignId});
  if(status.error)throw status.error;
  const next=status.data as Mode;
  setMode(next);
  if(next!=='monitored'){setEntries([]);return;}
  const result=await supabase.rpc('phone_player_dm_monitor',{p_campaign_id:campaignId});
  if(result.error)throw result.error;
  setEntries((result.data??[]) as Entry[]);
 },[campaignId]);
 useEffect(()=>{
  void refresh().catch(e=>setError(String(e)));
  const interval=window.setInterval(()=>{void refresh().catch(e=>setError(String(e)))},5000);
  return()=>window.clearInterval(interval);
 },[refresh]);
 return <section className="gl-direct-messages gl-dm-monitor">
  <h3>Player Direct Messages // GM Monitor</h3>
  {mode!=='monitored'?<p>Monitoring is not enabled for this campaign. Private player messages cannot be viewed here.</p>:<>
   <p>Read-only monitoring. Showing the latest 300 messages.</p>
   <div className="gl-direct-history">{entries.map(m=><div key={m.id} className="incoming"><strong>{m.sender} → {m.recipient}</strong><span>{m.body}</span><small>{new Date(m.created_at).toLocaleString()}</small></div>)}{!entries.length&&<p>No messages yet.</p>}</div>
  </>}
  {error&&<p role="alert" className="gl-direct-error">{error}</p>}
 </section>;
}
