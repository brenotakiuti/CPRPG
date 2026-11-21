import { LogOut, Expand, Shrink, HeartPulse, Dices, Crosshair, Swords, ScanEye, ArrowLeft } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import './PlayerTacticalFeed.css';

type TacticalUnit = {key:string;label:string;type:'player'|'enemy'|'target'|'objective';x:number;y:number;name?:string;mine?:boolean};
type TacticalObject = {type:string;x:number;y:number;color?:string};
type TacticalLayout = {width:number;height:number;objects:TacticalObject[];floorColors?:Record<string,string>};
type TacticalState = {visibilityMode?:'full'|'dark';visibilityRadius?:number;broadcasting:boolean;mapId?:string;layout?:TacticalLayout;units?:TacticalUnit[]};
type TacticalWeaponStats={name:string;type:string;dice:string;accuracy:string;damage:string;ammo:string};
export default function PlayerTacticalFeed({ onBack, characterId, currentHp, maxHp, weapons, onDice, renderStats, renderInventory, onOpenInventory }: { onBack: () => void; characterId: string; currentHp:number|null; maxHp:number|null; weapons:TacticalWeaponStats[]; onDice:()=>void; renderStats:(onClose:()=>void)=>React.ReactNode; renderInventory:(onClose:()=>void)=>React.ReactNode; onOpenInventory:()=>void }) {
  const [state,setState] = useState<TacticalState>({broadcasting:false});
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const [zoom,setZoom] = useState(1);
  const [expanded,setExpanded] = useState(false);
  const [panel,setPanel] = useState<'stats'|'inventory'|null>(null);
  const [scanning,setScanning] = useState(false);
  const [selected,setSelected] = useState(false);
  const [offset,setOffset] = useState({x:0,y:0});
  const [moving,setMoving] = useState<{key:string;x:number;y:number}|null>(null);
  const [pendingMove,setPendingMove]=useState<{key:string;x:number;y:number}|null>(null);
  const pendingRef=useRef<{key:string;x:number;y:number}|null>(null);
  const [locked,setLocked]=useState(false);
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
  useEffect(()=>{if(!expanded)return;const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false)};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[expanded]);
  const saveMove=async(key:string,x:number,y:number)=>{
    const optimistic={key,x,y};
    pendingRef.current=optimistic;
    setPendingMove(optimistic);
    setLocked(true);
    setError('');
    try {
      const {error:moveError}=await supabase.rpc('move_player_tactical_unit',{p_character_id:characterId,p_marker_key:key,p_x:x,p_y:y});
      if(moveError)throw moveError;
      // Read back the confirmed position before releasing the optimistic override.
      const {data,error:readError}=await supabase.rpc('get_player_tactical_feed',{p_character_id:characterId});
      if(readError)throw readError;
      const confirmed=data as TacticalState;
      if(!confirmed.broadcasting || !confirmed.units?.some(u=>u.mine&&u.key===key&&u.x===x&&u.y===y)){
        throw new Error('Movement could not be confirmed');
      }
      setState(confirmed);
    } catch (e) {
      setError(e instanceof Error?e.message:'Movement failed');
    } finally {
      pendingRef.current=null;
      setPendingMove(null);
      setLocked(false);
    }
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
    if(target.closest('.tactical-feed-unit.mine') && locked){gesture.current=null;return;}
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
        // Keep the local marker at its dropped position until the write is confirmed.
        if(pendingRef.current && next.units){
          const pending=pendingRef.current;
          next.units=next.units.map(u=>u.mine&&u.key===pending.key?{...u,x:pending.x,y:pending.y}:u);
        }
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
  if(live&&map)for(const obj of map.objects||[])if(!['player','enemy','target','poi','objective'].includes(obj.type)){
    const size=obj.type==='pillar'?[2,2]:obj.type==='coverH'?[2,1]:obj.type==='coverV'?[1,2]:[1,1];
    for(let dy=0;dy<size[1];dy++)for(let dx=0;dx<size[0];dx++)objects.set((obj.x+dx)+','+(obj.y+dy),obj);
  }
  const minePosition=state.units?.find(u=>u.mine);
  const dark=state.visibilityMode==='dark'&&!!minePosition;
  const sightRadius=Math.max(1,Math.min(8,state.visibilityRadius||3))*36;
  const displayUnits=(state.units||[]).map(u=>u.mine&&moving?{...u,x:moving.x,y:moving.y}:u.mine&&pendingMove?{...u,x:pendingMove.x,y:pendingMove.y}:u);
  const unitStacks=new Map<string,TacticalUnit[]>();for(const u of displayUnits){const key=u.x+','+u.y;unitStacks.set(key,[...(unitStacks.get(key)||[]),u]);}
  return <section className="tactical-feed" aria-label="Tactical//Feed">
    <div className="tactical-feed-accent" />
    <header className="tactical-feed-header">
      <div><div className="tactical-feed-brand"><img src="/ghost-link-icon.svg" alt="" /> GHOST // LINK — NET 07</div><h2>TACTICAL//FEED</h2></div>
      <span className="tactical-feed-offline">{live?'● LIVE':loading?'◌ LINKING':'○ OFFLINE'}</span>
    </header>
    <div className="tactical-feed-meta"><span>SECTOR <strong>{live?'CONNECTED':'UNAVAILABLE'}</strong></span><span>{live?'SIGNAL ACTIVE':'NO SIGNAL'}</span></div>
    <div className="tactical-feed-screen">
      {live&&map?(expanded?createPortal(<div className={"tactical-feed-live-scroll"+(expanded?" tactical-feed-expanded":"")} ref={viewport} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}><div className="tactical-feed-live-board" style={{width:map.width*36,height:map.height*36,transform:`translate(${offset.x}px,${offset.y}px) scale(${zoom})`,transformOrigin:'top left'}}>
        {Array.from({length:map.width*map.height},(_,i)=>{const x=i%map.width,y=Math.floor(i/map.width),o=objects.get(x+','+y);return <div key={i} className={'tactical-feed-tile '+(o?.type||'')} style={{left:x*36,top:y*36,backgroundColor:o?.color||map.floorColors?.[x+','+y]||undefined}}/>})}
        {dark&&minePosition&&<svg aria-hidden="true" style={{position:'absolute',inset:0,width:map.width*36,height:map.height*36,pointerEvents:'none',zIndex:5}} viewBox={`0 0 ${map.width*36} ${map.height*36}`}><defs><mask id="tactical-fog-mask"><rect width="100%" height="100%" fill="white"/><circle cx={(minePosition.x+.5)*36} cy={(minePosition.y+.5)*36} r={sightRadius} fill="black"/></mask></defs><rect width="100%" height="100%" fill="#02050a" fillOpacity=".97" mask="url(#tactical-fog-mask)"/><circle cx={(minePosition.x+.5)*36} cy={(minePosition.y+.5)*36} r={sightRadius} fill="none" stroke="#67dce8" strokeOpacity=".35" strokeDasharray="5 6"/></svg>}
         {displayUnits.filter(u=>!dark||u.mine||u.type==='player'||(minePosition&&Math.hypot(u.x-minePosition.x,u.y-minePosition.y)*36<=sightRadius)).map(u=>{const stack=unitStacks.get(u.x+','+u.y)||[u];const index=stack.findIndex(v=>v.key===u.key);const spread=stack.length>1;const dx=spread?(index%2===0?-6:6):0;const dy=spread?(Math.floor(index/2)*10+(index%2===0?-6:6)):0;return <div key={u.key} title={u.name||u.label} className={'tactical-feed-unit '+u.type+(u.mine?' mine':'')+(u.mine&&selected?' selected':'')+(u.mine&&locked?' syncing':'')} style={{left:u.x*36+4+dx,top:u.y*36+4+dy,zIndex:spread?10+index:undefined}}>{u.mine?'YOU':u.label}</div>})}
      </div><div className="tactical-feed-map-controls" onPointerDown={e=>e.stopPropagation()}><button type="button" aria-label={expanded?"Exit expanded map":"Expand map"} title={expanded?"Exit expanded map":"Expand map"} onClick={()=>setExpanded(v=>!v)}>{expanded?<Shrink size={21}/>:<Expand size={21}/>}</button><button type="button" aria-label="Zoom in" onClick={()=>setZoom(z=>clampZoom(z*1.25))}>+</button><button type="button" aria-label="Zoom out" onClick={()=>setZoom(z=>clampZoom(z/1.25))}>−</button><button type="button" aria-label="Center on character" onClick={recenter}>⌖</button></div>{expanded&&<div className="tactical-feed-hud-stack"><div className="tactical-feed-hud-actions" onPointerDown={e=>e.stopPropagation()}><button type="button" aria-label={scanning?'Exit scan mode':'Enter scan mode'} title={scanning?'Exit scan mode':'Scan layers'} aria-pressed={scanning} onClick={()=>setScanning(v=>!v)}><ScanEye size={20}/></button><button type="button" aria-label="Open dice spotlight" title="Roll dice" onClick={onDice}><Dices size={20}/></button></div>
        <aside className="tactical-feed-compact-hud" aria-label="Character tactical stats" onPointerDown={e=>e.stopPropagation()} onPointerMove={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()}>
          <button type="button" className="tactical-feed-hud-health" onClick={()=>setPanel('stats')} aria-label="Open character stats"><div className="tactical-feed-hud-heading"><span><HeartPulse size={15}/> HEALTH</span><strong>{currentHp!==null&&maxHp!==null?`${currentHp} / ${maxHp} HP`:'HP —'}</strong></div><div className="tactical-feed-hud-track"><div style={{width:maxHp&&currentHp!==null?`${Math.max(0,Math.min(100,currentHp/maxHp*100))}%`:'0%'}}/></div></button>
          <div className="tactical-feed-hud-weapons">{weapons.length?weapons.map((weapon,i)=><button type="button" className="tactical-feed-hud-weapon" key={i} onClick={()=>{onOpenInventory();setPanel('inventory')}} aria-label={'Open inventory for '+weapon.name}>
            <div className="tactical-feed-hud-weapon-name"><strong>{weapon.name}</strong><span>{weapon.type}</span></div>
            <div className="tactical-feed-hud-stats"><span title="Attack dice"><Dices size={13}/>{weapon.dice}</span><span title="Hit threshold"><Crosshair size={13}/>{weapon.accuracy}</span><span title="Damage per success"><Swords size={13}/>{weapon.damage}</span><span title="Ammo">▥ {weapon.ammo}</span></div>
          </button>):<div className="tactical-feed-hud-empty">NO WEAPONS EQUIPPED</div>}</div>
        </aside></div>}{expanded&&scanning&&<div className="tactical-feed-scan-panel" onPointerDown={e=>e.stopPropagation()}><strong>SCAN // LAYERS</strong><p>No scan layers available yet.</p></div>}
        {expanded&&panel&&<div className="tactical-feed-subscreen" onPointerDown={e=>e.stopPropagation()} onPointerMove={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()}><div className="tactical-feed-subscreen-top"><button type="button" onClick={()=>setPanel(null)}><ArrowLeft size={19}/> BACK TO MAP</button></div>{panel==='stats'?renderStats(()=>setPanel(null)):renderInventory(()=>setPanel(null))}</div>}
        {selected&&<div className="tactical-feed-move-hint">MOVE MODE · DRAG YOUR MARKER</div>}{error&&<div className="tactical-feed-error">{error}</div>}</div>,document.body):<div className={"tactical-feed-live-scroll"+(expanded?" tactical-feed-expanded":"")} ref={viewport} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}><div className="tactical-feed-live-board" style={{width:map.width*36,height:map.height*36,transform:`translate(${offset.x}px,${offset.y}px) scale(${zoom})`,transformOrigin:'top left'}}>
        {Array.from({length:map.width*map.height},(_,i)=>{const x=i%map.width,y=Math.floor(i/map.width),o=objects.get(x+','+y);return <div key={i} className={'tactical-feed-tile '+(o?.type||'')} style={{left:x*36,top:y*36,backgroundColor:o?.color||map.floorColors?.[x+','+y]||undefined}}/>})}
        {dark&&minePosition&&<svg aria-hidden="true" style={{position:'absolute',inset:0,width:map.width*36,height:map.height*36,pointerEvents:'none',zIndex:5}} viewBox={`0 0 ${map.width*36} ${map.height*36}`}><defs><mask id="tactical-fog-mask"><rect width="100%" height="100%" fill="white"/><circle cx={(minePosition.x+.5)*36} cy={(minePosition.y+.5)*36} r={sightRadius} fill="black"/></mask></defs><rect width="100%" height="100%" fill="#02050a" fillOpacity=".97" mask="url(#tactical-fog-mask)"/><circle cx={(minePosition.x+.5)*36} cy={(minePosition.y+.5)*36} r={sightRadius} fill="none" stroke="#67dce8" strokeOpacity=".35" strokeDasharray="5 6"/></svg>}
         {displayUnits.filter(u=>!dark||u.mine||u.type==='player'||(minePosition&&Math.hypot(u.x-minePosition.x,u.y-minePosition.y)*36<=sightRadius)).map(u=>{const stack=unitStacks.get(u.x+','+u.y)||[u];const index=stack.findIndex(v=>v.key===u.key);const spread=stack.length>1;const dx=spread?(index%2===0?-6:6):0;const dy=spread?(Math.floor(index/2)*10+(index%2===0?-6:6)):0;return <div key={u.key} title={u.name||u.label} className={'tactical-feed-unit '+u.type+(u.mine?' mine':'')+(u.mine&&selected?' selected':'')+(u.mine&&locked?' syncing':'')} style={{left:u.x*36+4+dx,top:u.y*36+4+dy,zIndex:spread?10+index:undefined}}>{u.mine?'YOU':u.label}</div>})}
      </div><div className="tactical-feed-map-controls" onPointerDown={e=>e.stopPropagation()}><button type="button" aria-label={expanded?"Exit expanded map":"Expand map"} title={expanded?"Exit expanded map":"Expand map"} onClick={()=>setExpanded(v=>!v)}>{expanded?<Shrink size={21}/>:<Expand size={21}/>}</button><button type="button" aria-label="Zoom in" onClick={()=>setZoom(z=>clampZoom(z*1.25))}>+</button><button type="button" aria-label="Zoom out" onClick={()=>setZoom(z=>clampZoom(z/1.25))}>−</button><button type="button" aria-label="Center on character" onClick={recenter}>⌖</button></div>{selected&&<div className="tactical-feed-move-hint">MOVE MODE · DRAG YOUR MARKER</div>}{error&&<div className="tactical-feed-error">{error}</div>}</div>):<>
      <div className="tactical-feed-grid" /><div className="tactical-feed-radar"><div className="tactical-feed-sweep" /></div>
      <div className="tactical-feed-static" /><div className="tactical-feed-interference" />
      <div className="tactical-feed-screen-label">◈ AREA SURVEILLANCE // {loading?'CONNECTING':'STANDBY'}</div>
      <div className="tactical-feed-center"><div className="tactical-feed-symbol">⌁</div><strong>{loading?'ESTABLISHING TACTICAL UPLINK':'NO TACTICAL//FEED'}</strong><p>{loading?'DECODING BATTLEFIELD DATA':error?'CONNECTION ERROR: '+error:'SIGNAL SOURCE NOT DETECTED'}<br />{loading?'SYNCING UNIT POSITIONS':'AWAITING GM TRANSMISSION'}</p><div className="tactical-feed-dots"><i /><i /><i /><i /><i /></div></div>
      <div className="tactical-feed-bottom"><span>SCAN ACTIVE</span><span>UPLINK STATUS: {loading?'CONNECTING':'IDLE'}</span></div>
      </>}
    </div>
    <footer className="tactical-feed-footer"><span>GHOSTLINK OS // 2077</span><button type="button" onClick={onBack} aria-label="Exit Tactical Feed" title="Exit Tactical Feed"><LogOut size={19}/></button></footer>
  </section>;
}
