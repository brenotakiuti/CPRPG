import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, LockKeyhole, Minimize2, Maximize2, Phone, PhoneOff, RadioTower, Smartphone } from 'lucide-react';
import { supabase } from './supabase';
import './GhostCall.css';

type Call = { id:string; npc_identity_id:string; character_id:string; direction:'gm'|'player'; status:string; created_at:string; answered_at:string|null; ended_at:string|null };
type Identity = { id:string; internal_name:string; display_name:string; anonymous:boolean; portrait_url?:string|null };
type Character = { id:string; name:string; portrait_url?:string|null };
const initials=(name:string)=>name.trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()||'').join('')||'?';
function Avatar({name,url,npc}:{name:string;url?:string|null;npc?:boolean}) {
 const [broken,setBroken]=useState(false);
 return <div className={'gl-gm-avatar'+(npc?' npc':'')}>{url&&!broken?<img src={url} alt="" onError={()=>setBroken(true)}/>:<span>{initials(name)}</span>}</div>;
}
export default function GMCallSpotlight({campaignId}:{campaignId:string}) {
 const [call,setCall]=useState<Call|null>(null);
 const [identities,setIdentities]=useState<Identity[]>([]);
 const [characters,setCharacters]=useState<Character[]>([]);
 const [minimized,setMinimized]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [now,setNow]=useState(Date.now());
 const previous=useRef('');
 const refresh=useCallback(async()=>{
  const r=await supabase.rpc('phone_gm_calls',{p_campaign_id:campaignId});
  if(r.error)throw r.error;
  const active=((r.data||[]) as Call[]).find(c=>c.direction==='player'&&(c.status==='ringing'||c.status==='connected'))||null;
  setCall(active);
  if(active && previous.current!==active.id){setMinimized(false);setError('');}
  previous.current=active?.id||'';
 },[campaignId]);
 useEffect(()=>{
  let live=true;
  const load=async()=>{
   const [i,c]=await Promise.all([
    supabase.rpc('phone_gm_identities',{p_campaign_id:campaignId}),
    supabase.from('characters').select('id,name').eq('campaign_id',campaignId)
   ]);
   if(!live)return;
   if(!i.error)setIdentities((i.data||[]) as Identity[]);
   if(!c.error)setCharacters((c.data||[]) as Character[]);
  };
  void load();
  const poll=()=>{if(live&&document.visibilityState!=='hidden')void refresh().catch(e=>{if(live)setError(e instanceof Error?e.message:String(e));});};
  poll();
  const timer=window.setInterval(poll,1500);
  const clock=window.setInterval(()=>setNow(Date.now()),1000);
  window.addEventListener('focus',poll);
  return()=>{live=false;clearInterval(timer);clearInterval(clock);window.removeEventListener('focus',poll);};
 },[campaignId,refresh]);
 const action=async(name:string)=>{
  if(!call||busy)return;
  setBusy(true);setError('');
  try{const r=await supabase.rpc(name,{p_call_id:call.id});if(r.error)throw r.error;await refresh();}
  catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 };
 if(!call)return null;
 const identity=identities.find(i=>i.id===call.npc_identity_id);
 const character=characters.find(c=>c.id===call.character_id);
 const caller=character?.name||'Unknown character';
 const npc=identity?.internal_name||'Unknown NPC';
 const alias=identity?.anonymous?'Unknown Number':identity?.display_name||npc;
 const ringing=call.status==='ringing';
 const seconds=Math.max(0,Math.floor((now-new Date(call.created_at).getTime())/1000));
 const duration=call.answered_at?Math.max(0,Math.floor((now-new Date(call.answered_at).getTime())/1000)):0;
 const formatted=`${String(Math.floor(duration/60)).padStart(2,'0')}:${String(duration%60).padStart(2,'0')}`;
 if(minimized)return <div className="gl-gm-mini" role="status"><Smartphone size={18}/><div><strong>{ringing?'INCOMING CALL':'CONNECTED · '+formatted}</strong><span>{caller} → {npc}</span></div><button onClick={()=>setMinimized(false)} aria-label="Expand call"><Maximize2 size={18}/></button>{!ringing&&<button onClick={()=>void action('phone_gm_end_call')} disabled={busy}><PhoneOff size={18}/></button>}</div>;
 return <div className="gl-spotlight gl-gm-spotlight" role="dialog" aria-modal="true" aria-label="GM incoming call">
  <div className="gl-spotlight-backdrop"/>
  <section className="gl-gm-spotlight-panel">
   <header className="gl-gm-spotlight-header"><div><RadioTower size={21}/><span><strong>GHOST//LINK</strong><small>COMMUNICATION CONTROL</small></span></div><span className="gl-gm-call-badge">{ringing?'INCOMING':'CONNECTED'}</span></header>
   <div className="gl-gm-spotlight-title"><small>PLAYER-INITIATED TRANSMISSION</small><h2>{ringing?'INCOMING CALL':'CHANNEL ESTABLISHED'}</h2><p><LockKeyhole size={13}/> ENCRYPTED CONNECTION · NIGHT CITY NETWORK</p></div>
   <div className="gl-gm-participants">
    <div className="gl-gm-person"><small>CALLER · PLAYER</small><Avatar name={caller} url={character?.portrait_url}/><strong>{caller}</strong><span>PLAYER CHARACTER</span></div>
    <div className="gl-gm-person npc"><small>DESTINATION · NPC</small><Avatar name={npc} url={identity?.portrait_url} npc/><strong>{npc}</strong><span>NPC IDENTITY</span><em>PUBLIC ALIAS: {alias}</em></div>
   </div>
   <div className="gl-gm-route"><ArrowRight size={17}/>{caller} is calling {npc}</div>
   <div className="gl-signal gl-signal-ringing" aria-hidden="true">{Array.from({length:19},(_,i)=><i key={i} style={{animationDelay:(-i*.12)+'s'}}/>)}</div>
   <div className="gl-gm-timing">{ringing?`AWAITING GM RESPONSE · ${Math.max(0,45-seconds)}s REMAINING`:`SIMULATED VOICE CHANNEL · ${formatted}`}</div>
   {error&&<p className="gl-call-error" role="alert">{error}</p>}
   <div className="gl-gm-spotlight-actions">
    {ringing?<><button className="gl-call-stop" disabled={busy} onClick={()=>void action('phone_gm_end_call')}><PhoneOff size={18}/>Decline</button><button className="gl-call-start" disabled={busy} onClick={()=>void action('phone_gm_answer_call')}><Phone size={18}/>Answer</button></>:<><button className="gl-call-stop" disabled={busy} onClick={()=>void action('phone_gm_end_call')}><PhoneOff size={18}/>End Connection</button><button className="gl-gm-minimize" onClick={()=>setMinimized(true)}><Minimize2 size={18}/>Minimize</button></>}
   </div>
   <footer>GM-ONLY INFORMATION <span>GHOST//LINK // SECURE</span></footer>
  </section>
 </div>;
}
