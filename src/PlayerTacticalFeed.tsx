import { useEffect, useRef, useState } from 'react';
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
  const [zoom,setZoom] = useState(1);
  const [selected,setSelected] = useState(false);
  const [offset,setOffset] = useState({x:0,y:0});
  const [moving,setMoving] = useState<{key:string;x:number;y:number}|null>(null);
  const viewport=useRef<HTMLDivElement>(null);
  const gesture=useRef<{mode:'pan'|'move'|'pinch';x:number;y:number;ox:number;oy:number;distance?:number;zoom?:number}|null>(null);
  const pointers=useRef(new Map<number,{x:number;y:number}>());
  const clampZoom=(z:number)=>Math.max(.5,Math.min(3,z));
  const recenter=()=>{
    const mine=state.units?.find(u=>u.mine);
    const rect=viewport.current?.getBoundingClientRect();
    if(!mine||!rect)return;
    setOffset({x:rect.width/2-(mine.x+.5)*36*zoom,y:rect.height/2-(mine.y+.5)*36*zoom});
  };
  const saveMove=async(key:string,x:number,y:number)=>{
    const {error:moveError}=await supabase.rpc('move_player_tactical_unit',{p_character_id:characterId,p_marker_key:key,p_x:x,p_y:y});
    if(moveError)setError(moveError.message);
  };
  const pointerDown=(e:React.PointerEvent<HTMLDivElement>)=>{
    if(!state.layout)return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const mine=state.units?.find(u=>u.mine);
    const target=e.target as HTMLElement;
    if(pointers.current.size===2){
      const [a,b]=Array.from(pointers.current.values());
      gesture.current={mode:'pinch',x:0,y:0,ox:offset.x,oy:offset.y,distance:Math.hypot(a.x-b.x,a.y-b.y),zoom};
      return;
    }
    if(target.closest('.tactical-feed-unit.mine')){
      if(!selected){setSelected(true);gesture.current=null;return;}
      if(mine){gesture.current={mode:'move',x:e.clientX,y:e.clientY,ox:mine.x,oy:mine.y};setMoving({key:mine.key,x:mine.x,y:mine.y});}
    }else if(selected){setSelected(false);gesture.current=null;}
    else gesture.current={mode:'pan',x:e.clientX,y:e.clientY,ox:offset.x,oy:offset.y};
  };
  const pointerMove=(e:React.PointerEvent<HTMLDivElement>)=>{
    if(!pointers.current.has(e.pointerId))return;
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const g=gesture.current;
    if(!g)return;
    if(g.mode==='pinch'&&pointers.current.size>=2){
      const [a,b]=Array.from(pointers.current.values());
      const next=clampZoom((g.zoom||1)*Math.hypot(a.x-b.x,a.y-b.y)/(g.distance||1));
      const rect=viewport.current?.getBoundingClientRect();
      if(rect){const cx=(a.x+b.x)/2-rect.left,cy=(a.y+b.y)/2-rect.top;
        setOffset({x:cx-(cx-g.ox)*next/(g.zoom||1),y:cy-(cy-g.oy)*next/(g.zoom||1)});}
      setZoom(next);
    }else if(g.mode==='pan'){setOffset({x:g.ox+e.clientX-g.x,y:g.oy+e.clientY-g.y});}
    else if(g.mode==='move'&&state.layout){
      const x=Math.max(0,Math.min(state.layout.width-1,Math.round(g.ox+(e.clientX-g.x)/(36*zoom))));
      const y=Math.max(0,Math.min(state.layout.height-1,Math.round(g.oy+(e.clientY-g.y)/(36*zoom))));
      const mine=state.units?.find(u=>u.mine);
      if(mine)setMoving({key:mine.key,x,y});
    }
  };
  const pointerUp=(e:React.PointerEvent<HTMLDivElement>)=>{
    pointers.current.delete(e.pointerId);
    if(gesture.current?.mode==='move'&&moving){
      void saveMove(moving.key,moving.x,moving.y);
      setMoving(null);
    }
    gesture.current=null;
  };
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
  return <section className="tactical-feed" aria-label="Tactical//Feed">
    <div className="tactical-feed-accent" />
    <header className="tactical-feed-header">
      <div><div className="tactical-feed-brand"><img src="/ghost-link-icon.svg" alt="" /> GHOST // LINK — NET 07</div><h2>TACTICAL//FEED</h2></div>
      <span className="tactical-feed-offline">{live?'● LIVE':loading?'◌ LINKING':'○ OFFLINE'}</span>
    </header>
    <div className="tactical-feed-meta"><span>SECTOR <strong>{live?'CONNECTED':'UNAVAILABLE'}</strong></span><span>{live?'SIGNAL ACTIVE':'NO SIGNAL'}</span></div>
    <div className="tactical-feed-screen">
      {live&&map?<div className="tactical-feed-live-scroll" ref={viewport} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}><div className="tactical-feed-live-board" style={{width:map.width*36,height:map.height*36,transform:`translate(${offset.x}px,${offset.y}px) scale(${zoom})`,transformOrigin:'top left'}}>
        {Array.from({length:map.width*map.height},(_,i)=>{const x=i%map.width,y=Math.floor(i/map.width),o=objects.get(x+','+y);return <div key={i} className={'tactical-feed-tile '+(o?.type||'')} style={{left:x*36,top:y*36,backgroundColor:o?.color||map.floorColors?.[x+','+y]||undefined}}/>})}
        {(state.units||[]).map(u=><div key={u.key} title={u.name||u.label} className={'tactical-feed-unit '+u.type+(u.mine?' mine':'')+(u.mine&&selected?' selected':'')} style={{left:(u.mine&&moving?moving.x:u.x)*36+4,top:(u.mine&&moving?moving.y:u.y)*36+4}}>{u.mine?'YOU':u.label}</div>)}
      </div><div className="tactical-feed-map-controls" onPointerDown={e=>e.stopPropagation()}><button type="button" aria-label="Zoom in" onClick={()=>setZoom(z=>clampZoom(z*1.25))}>+</button><button type="button" aria-label="Zoom out" onClick={()=>setZoom(z=>clampZoom(z/1.25))}>−</button><button type="button" aria-label="Center on character" onClick={recenter}>⌖</button></div>{selected&&<div className="tactical-feed-move-hint">MOVE MODE · DRAG YOUR MARKER</div>}{error&&<div className="tactical-feed-error">{error}</div>}</div>:<>
      <div className="tactical-feed-grid" /><div className="tactical-feed-radar"><div className="tactical-feed-sweep" /></div>
      <div className="tactical-feed-static" /><div className="tactical-feed-interference" />
      <div className="tactical-feed-screen-label">◈ AREA SURVEILLANCE // {loading?'CONNECTING':'STANDBY'}</div>
      <div className="tactical-feed-center"><div className="tactical-feed-symbol">⌁</div><strong>{loading?'ESTABLISHING TACTICAL UPLINK':'NO TACTICAL//FEED'}</strong><p>{loading?'DECODING BATTLEFIELD DATA':error?'CONNECTION ERROR: '+error:'SIGNAL SOURCE NOT DETECTED'}<br />{loading?'SYNCING UNIT POSITIONS':'AWAITING GM TRANSMISSION'}</p><div className="tactical-feed-dots"><i /><i /><i /><i /><i /></div></div>
      <div className="tactical-feed-bottom"><span>SCAN ACTIVE</span><span>UPLINK STATUS: {loading?'CONNECTING':'IDLE'}</span></div>
      </>}
    </div>
    <footer className="tactical-feed-footer"><span>GHOSTLINK OS // 2077</span><button type="button" onClick={onBack}>← BACK</button></footer>
  </section>;
}
