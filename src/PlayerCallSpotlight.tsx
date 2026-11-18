import { useCallback, useEffect, useRef, useState } from 'react';
import { LockKeyhole, Phone, PhoneOff, UserRound, RadioTower } from 'lucide-react';
import { supabase } from './supabase';
import './GhostCall.css';

type Call = { id:string; status:string; caller_label:string; created_at:string; answered_at:string|null; ended_at:string|null };
export default function PlayerCallSpotlight({characterId}:{characterId:string}){
  const [call,setCall]=useState<Call|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [closing,setClosing]=useState(false);
  const lastId=useRef('');
  const refresh=useCallback(async()=>{
    const r=await supabase.rpc('phone_player_current_call',{p_character_id:characterId});
    if(r.error)throw r.error;
    const current=((r.data||[]) as Call[])[0]||null;
    setCall(previous=>{
      if(current){lastId.current=current.id;return current;}
      if(previous && ['ringing','connected'].includes(previous.status))return {...previous,status:'ended'};
      return previous;
    });
  },[characterId]);
  useEffect(()=>{
    let live=true;
    const poll=()=>{if(live && document.visibilityState!=='hidden')void refresh().catch(e=>{if(live)setError(e.message||String(e));});};
    poll();
    const timer=window.setInterval(poll,1500);
    window.addEventListener('focus',poll);
    document.addEventListener('visibilitychange',poll);
    return()=>{live=false;window.clearInterval(timer);window.removeEventListener('focus',poll);document.removeEventListener('visibilitychange',poll);};
  },[refresh]);
  useEffect(()=>{
    if(!call||!['ended','missed','cancelled','declined'].includes(call.status)){setClosing(false);return;}
    setClosing(true);
    const timer=window.setTimeout(()=>{setCall(null);setClosing(false);},1300);
    return()=>window.clearTimeout(timer);
  },[call?.id,call?.status]);
  const respond=async(action:'answer'|'decline'|'end')=>{
    if(!call||busy)return;
    setBusy(true);setError('');
    try{
      const r=await supabase.rpc('phone_player_call_action',{p_character_id:characterId,p_call_id:call.id,p_action:action});
      if(r.error)throw r.error;
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  if(!call)return null;
  const ringing=call.status==='ringing',connected=call.status==='connected';
  return <div className="gl-spotlight" role="dialog" aria-modal="true" aria-label="Ghost Link call">
    <div className="gl-spotlight-backdrop"/>
    <section className={'gl-spotlight-panel'+(closing?' gl-closing':'')}>
      <header><strong>GHOST//LINK</strong><span><LockKeyhole size={13}/> ENCRYPTED</span></header>
      <div className="gl-caller-avatar"><UserRound size={40}/></div>
      <h2>{call.caller_label||'Unknown Number'}</h2>
      <p className="gl-call-state">{ringing?'INCOMING TRANSMISSION':connected?'CHANNEL ESTABLISHED':'CONNECTION TERMINATED'}</p>
      <div className={'gl-signal'+(closing?' gl-signal-ended':'')+(ringing?' gl-signal-ringing':'')} aria-label={ringing?'Ringing signal':connected?'Active encrypted signal':'Signal disconnected'}>{Array.from({length:15},(_,i)=><i key={i} style={{animationDelay:(-i*.11)+'s'}}/>)}</div>
      {ringing?<div className="gl-call-actions"><button disabled={busy} className="gl-call-stop" onClick={()=>void respond('decline')}><PhoneOff size={19}/>Decline</button><button disabled={busy} className="gl-call-start" onClick={()=>void respond('answer')}><Phone size={19}/>Answer</button></div>:connected?<div className="gl-call-actions"><button disabled={busy} className="gl-call-stop" onClick={()=>void respond('end')}><PhoneOff size={19}/>Hang Up</button></div>:null}
      {error&&<p className="gl-call-error" role="alert">{error}</p>}
    </section>
  </div>;
}
