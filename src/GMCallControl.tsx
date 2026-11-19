import { useCallback, useEffect, useState } from 'react';
import { Phone, PhoneOff, RadioTower } from 'lucide-react';
import { supabase } from './supabase';
import './GhostCall.css';

type Identity = { id:string; internal_name:string; display_name:string; anonymous:boolean };
type Player = { id:string; name:string };
type Call = { id:string; npc_identity_id:string; character_id:string; direction:'gm'|'player'; status:string; created_at:string; answered_at:string|null; ended_at:string|null };
const terminal = ['declined','missed','cancelled','ended'];
export default function GMCallControl({campaignId,identities,players}:{campaignId:string;identities:Identity[];players:Player[]}) {
  const [identityId,setIdentityId]=useState('');
  const [characterId,setCharacterId]=useState('');
  const [calls,setCalls]=useState<Call[]>([]);
  const [endingCall,setEndingCall]=useState<Call|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [ready,setReady]=useState(false);
  const refresh=useCallback(async()=>{
    const r=await supabase.rpc('phone_gm_calls',{p_campaign_id:campaignId});
    if(r.error)throw r.error;
    const next=(r.data||[]) as Call[];
    setCalls(next);
    setEndingCall(previous=>previous&&next.some(c=>c.id===previous.id&&!terminal.includes(c.status))?null:previous);
    setReady(true);
  },[campaignId]);
  useEffect(()=>{
    let live=true;
    const poll=()=>{if(live && document.visibilityState!=='hidden')void refresh().catch(e=>{if(live)setError(e.message||String(e));});};
    poll();
    const timer=window.setInterval(poll,2000);
    window.addEventListener('focus',poll);
    return()=>{live=false;window.clearInterval(timer);window.removeEventListener('focus',poll);};
  },[refresh]);
  useEffect(()=>{if(!identities.some(i=>i.id===identityId))setIdentityId(identities[0]?.id||'');},[identities,identityId]);
  useEffect(()=>{if(!players.some(p=>p.id===characterId))setCharacterId(players[0]?.id||'');},[players,characterId]);
  const active=calls.find(c=>!terminal.includes(c.status));
  useEffect(()=>{
    if(!endingCall)return;
    const timer=window.setTimeout(()=>setEndingCall(null),1300);
    return()=>window.clearTimeout(timer);
  },[endingCall?.id]);
  const action=async(name:string,args:Record<string,unknown>)=>{
    setBusy(true);setError('');
    try{const r=await supabase.rpc(name,args);if(r.error)throw r.error;if(name==='phone_gm_end_call'&&active)setEndingCall(active);await refresh();}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  const identity=(id:string)=>identities.find(i=>i.id===id);
  const character=(id:string)=>players.find(p=>p.id===id)?.name||'Unknown character';
  return <section className="gl-gm-calls">
    <header className="gl-call-heading"><RadioTower size={18}/><div><strong>GHOST//LINK // CALLS</strong><small>SIMULATED ENCRYPTED TRANSMISSIONS</small></div></header>
    <div className="gl-gm-fields">
      <label>Calling as<select value={identityId} disabled={!!active||busy} onChange={e=>setIdentityId(e.target.value)}><option value="">Select NPC...</option>{identities.map(i=><option key={i.id} value={i.id}>{i.internal_name} ({i.anonymous?'Unknown Number':i.display_name})</option>)}</select></label>
      <label>Call recipient<select value={characterId} disabled={!!active||busy} onChange={e=>setCharacterId(e.target.value)}><option value="">Select player...</option>{players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    </div>
    {(active||endingCall)?<div className="gl-gm-active">
      <span className="gl-call-state">{!active?'CONNECTION TERMINATED':active.status==='ringing'?(active.direction==='player'?'INCOMING PLAYER CALL':'CALLING...'):'CHANNEL ESTABLISHED'}</span>
      <strong>{(active||endingCall)!.direction==='player' ? character((active||endingCall)!.character_id)+' → '+(identity((active||endingCall)!.npc_identity_id)?.internal_name||'NPC') : (identity((active||endingCall)!.npc_identity_id)?.internal_name||'NPC')+' → '+character((active||endingCall)!.character_id)}</strong>
      <div className={'gl-signal'+(!active?' gl-signal-ended':active.status==='ringing'?' gl-signal-ringing':'')} aria-hidden="true">{Array.from({length:15},(_,i)=><i key={i} style={{animationDelay:(-i*.13)+'s'}}/>)}</div>
      {active && active.direction === 'player' && active.status === 'ringing' && <button className="gl-call-start" disabled={busy} onClick={() => void action('phone_gm_answer_call',{p_call_id:active.id})}><Phone size={17}/>Answer</button>}
      {active&&<button className="gl-call-stop" disabled={busy} onClick={()=>void action('phone_gm_end_call',{p_call_id:active.id})}><PhoneOff size={17}/>{active.direction==='player' && active.status==='ringing'?'Decline':active.status==='ringing'?'Cancel Call':'Hang Up'}</button>}
    </div>:<button className="gl-call-start" disabled={busy||!identityId||!characterId||!ready} onClick={()=>void action('phone_gm_start_call',{p_campaign_id:campaignId,p_npc_identity_id:identityId,p_character_id:characterId})}><Phone size={17}/>Place Call</button>}
    {error&&<p className="gl-call-error" role="alert">{error}</p>}
    <h3>RECENT CALLS</h3>
    <div className="gl-call-history">{calls.filter(c=>terminal.includes(c.status)).slice(0,15).map(c=><div key={c.id}><span>{c.direction === 'player' ? character(c.character_id)+' → '+(identity(c.npc_identity_id)?.internal_name||'NPC') : (identity(c.npc_identity_id)?.internal_name||'NPC')+' → '+character(c.character_id)}</span><small>{c.status.toUpperCase()} · {new Date(c.created_at).toLocaleString()}</small></div>)}{ready&&!calls.some(c=>terminal.includes(c.status))&&<p>No previous calls.</p>}</div>
  </section>;
}
