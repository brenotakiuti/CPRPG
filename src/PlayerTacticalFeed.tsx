import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import './PlayerTacticalFeed.css';

type TacticalUnit = {key:string;label:string;type:'player'|'enemy';x:number;y:number;name?:string;mine?:boolean};
type TacticalObject = {type:string;x:number;y:number;color?:string};
type TacticalLayout = {width:number;height:number;objects:TacticalObject[];floorColors?:Record<string,string>};
type TacticalState = {broadcasting:boolean;mapId?:string;layout?:TacticalLayout;units?:TacticalUnit[]};
export default function PlayerTacticalFeed({ onBack, characterId }: { onBack: () => void; characterId: string }) {
  const [state,setState] = useState<TacticalState>({broadcasting:false});
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  useEffect(()=>{
    let active=true, inflight=false, transition:ReturnType<typeof setTimeout>|undefined;
    async function refresh(){
      if(inflight || document.visibilityState==='hidden')return;
      inflight=true;
      try{
        const {data,error:requestError}=await supabase.rpc('get_player_tactical_feed',{p_character_id:characterId});
        if(!active)return;
        if(requestError){setError(requestError.message);return;}
        setError('');
        const next=data as TacticalState;
        setState(previous=>{
          if(next.broadcasting && !previous.broadcasting){
            setLoading(true);
            if(transition)clearTimeout(transition);
            transition=setTimeout(()=>{if(active)setLoading(false)},1100);
          } else if(!next.broadcasting){setLoading(false);}
          return next;
        });
      }finally{inflight=false;}
    }
    void refresh();
    const timer=setInterval(()=>void refresh(),1400);
    const onVisible=()=>{if(document.visibilityState==='visible')void refresh()};
    document.addEventListener('visibilitychange',onVisible);
    return ()=>{active=false;clearInterval(timer);if(transition)clearTimeout(transition);document.removeEventListener('visibilitychange',onVisible)};
  },[characterId]);
  const live=state.broadcasting && !loading && state.layout && Number.isInteger(state.layout.width) && Number.isInteger(state.layout.height) && state.layout.width>0 && state.layout.height>0;
  const map=state.layout;
  const objects=new Map<string,TacticalObject>();
  if(live&&map)for(const obj of map.objects||[])if(obj.type!=='player'&&obj.type!=='enemy'){
    const size=obj.type==='pillar'?[2,2]:obj.type==='coverH'?[2,1]:obj.type==='coverV'?[1,2]:[1,1];
    for(let dy=0;dy<size[1];dy++)for(let dx=0;dx<size[0];dx++)objects.set((obj.x+dx)+','+(obj.y+dy),obj);
  }
  return <section className="tactical-feed" aria-label="Tactical Feed">
    <div className="tactical-feed-accent" />
    <header className="tactical-feed-header">
      <div><div className="tactical-feed-brand"><img src="/ghost-link-icon.svg" alt="" /> GHOST // LINK — NET 07</div><h2>TACTICAL FEED</h2></div>
      <span className="tactical-feed-offline">{live?'● LIVE':loading?'◌ LINKING':'○ OFFLINE'}</span>
    </header>
    <div className="tactical-feed-meta"><span>SECTOR <strong>{live?'CONNECTED':'UNAVAILABLE'}</strong></span><span>{live?'SIGNAL ACTIVE':'NO SIGNAL'}</span></div>
    <div className="tactical-feed-screen">
      {live&&map?<div className="tactical-feed-live-scroll"><div className="tactical-feed-live-board" style={{width:map.width*36,height:map.height*36}}>
        {Array.from({length:map.width*map.height},(_,i)=>{const x=i%map.width,y=Math.floor(i/map.width),o=objects.get(x+','+y);return <div key={i} className={'tactical-feed-tile '+(o?.type||'')} style={{left:x*36,top:y*36,backgroundColor:o?.color||map.floorColors?.[x+','+y]||undefined}}/>})}
        {(state.units||[]).map(u=><div key={u.key} title={u.name||u.label} className={'tactical-feed-unit '+u.type+(u.mine?' mine':'')} style={{left:u.x*36+4,top:u.y*36+4}}>{u.mine?'YOU':u.label}</div>)}
      </div></div>:<>
      <div className="tactical-feed-grid" /><div className="tactical-feed-radar"><div className="tactical-feed-sweep" /></div>
      <div className="tactical-feed-static" /><div className="tactical-feed-interference" />
      <div className="tactical-feed-screen-label">◈ AREA SURVEILLANCE // {loading?'CONNECTING':'STANDBY'}</div>
      <div className="tactical-feed-center"><div className="tactical-feed-symbol">⌁</div><strong>{loading?'ESTABLISHING TACTICAL UPLINK':'NO TACTICAL FEED'}</strong><p>{loading?'DECODING BATTLEFIELD DATA':error?'CONNECTION ERROR: '+error:'SIGNAL SOURCE NOT DETECTED'}<br />{loading?'SYNCING UNIT POSITIONS':'AWAITING GM TRANSMISSION'}</p><div className="tactical-feed-dots"><i /><i /><i /><i /><i /></div></div>
      <div className="tactical-feed-bottom"><span>SCAN ACTIVE</span><span>UPLINK STATUS: {loading?'CONNECTING':'IDLE'}</span></div>
      </>}
    </div>
    <footer className="tactical-feed-footer"><span>GHOSTLINK OS // 2077</span><button type="button" onClick={onBack}>← BACK</button></footer>
  </section>;
}
