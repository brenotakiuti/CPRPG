import { useEffect, useRef, useState } from 'react';
import { Dices, Plus, Minus, Focus, X } from 'lucide-react';
import { supabase } from './supabase';
import './SharedTacticalFeed.css';

type Unit = {key:string;label:string;type:string;x:number;y:number;name?:string;visible?:boolean;manualReveal?:Record<string,string>};
type ObjectCell = {type:string;x:number;y:number;color?:string};
type Layout = {width:number;height:number;objects:ObjectCell[];floorColors?:Record<string,string>};
type Feed = {broadcasting:boolean;layout?:Layout;units?:Unit[];visibilityMode?:'full'|'light'|'dark';visibilityRadius?:number;revealMode?:string};
const CELL=36;
function sightCells(ax:number,ay:number,bx:number,by:number):[number,number][] {
 const result:[number,number][]=[];let x=Math.floor(ax),y=Math.floor(ay);
 const ex=Math.floor(bx),ey=Math.floor(by),dx=bx-ax,dy=by-ay;
 const sx=Math.sign(dx),sy=Math.sign(dy);
 let tx=sx?(sx>0?x+1-ax:ax-x)/Math.abs(dx):Infinity;
 let ty=sy?(sy>0?y+1-ay:ay-y)/Math.abs(dy):Infinity;
 const stepX=sx?1/Math.abs(dx):Infinity,stepY=sy?1/Math.abs(dy):Infinity;
 const push=(a:number,b:number)=>{if(!result.some(v=>v[0]===a&&v[1]===b))result.push([a,b]);};
 push(x,y);
 for(let i=0;i<2048&&(x!==ex||y!==ey);i++){
  if(Math.abs(tx-ty)<1e-9){push(x+sx,y);push(x,y+sy);x+=sx;y+=sy;tx+=stepX;ty+=stepY;}
  else if(tx<ty){x+=sx;tx+=stepX;}else{y+=sy;ty+=stepY;}
  push(x,y);
 }
 return result;
}
export default function SharedTacticalFeed({token}:{token:string}) {
 const [feed,setFeed]=useState<Feed>({broadcasting:false});
 const [error,setError]=useState('');
 const [zoom,setZoom]=useState(1);
 const [selected,setSelected]=useState<string|null>(null);
 const [diceOpen,setDiceOpen]=useState(false);
 const [diceCount,setDiceCount]=useState(1);
 const [diceSides,setDiceSides]=useState(6);
 const [diceResults,setDiceResults]=useState<number[]>([]);
 const [moving,setMoving]=useState(false);
 const boardRef=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{
  let mounted=true;let inflight=false;
  const refresh=async()=>{
   if(inflight||document.visibilityState==='hidden')return;
   inflight=true;
   try{
    const {data,error:err}=await supabase.rpc('get_shared_tactical_feed',{p_token:token});
    if(!mounted)return;
    if(err){setError(err.message);return;}
    setError('');setFeed(data as Feed);
   }finally{inflight=false;}
  };
  void refresh();
  const timer=window.setInterval(()=>void refresh(),1200);
  const onFocus=()=>void refresh();
  document.addEventListener('visibilitychange',onFocus);
  return ()=>{mounted=false;clearInterval(timer);document.removeEventListener('visibilitychange',onFocus)};
 },[token]);
 const layout=feed.layout;
 const players=(feed.units||[]).filter(u=>u.type==='player');
 const walls=new Set<string>();
 if(layout)for(const o of layout.objects||[]){
  if(o.type==='wall')walls.add(o.x+','+o.y);
  if(o.type==='pillar')for(let y=0;y<2;y++)for(let x=0;x<2;x++)walls.add((o.x+x)+','+(o.y+y));
 }
 const canSee=(x:number,y:number)=>{
  if(feed.visibilityMode==='full')return true;
  if(!players.length)return false;
  return players.some(p=>{
   const path=sightCells(p.x+.5,p.y+.5,x+.5,y+.5);
   const blockers=path.filter(([a,b])=>walls.has(a+','+b));
   const clear=blockers.length===0||(blockers.length===1&&blockers[0][0]===x&&blockers[0][1]===y);
   return clear&&(feed.visibilityMode!=='dark'||Math.hypot(p.x-x,p.y-y)<=Math.max(1,Math.min(8,feed.visibilityRadius||3)));
  });
 };
 const terrain=new Map<string,ObjectCell>();
 if(layout)for(const o of layout.objects||[]){
  const [w,h]=o.type==='pillar'?[2,2]:o.type==='coverH'?[2,1]:o.type==='coverV'?[1,2]:[1,1];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)terrain.set((o.x+x)+','+(o.y+y),o);
 }
 const move=async(x:number,y:number)=>{
  if(!selected||!layout||moving||x<0||y<0||x>=layout.width||y>=layout.height)return;
  const obstacle=terrain.get(x+','+y)?.type;
  if(obstacle==='wall'||obstacle==='pillar'||obstacle==='cover'||obstacle==='coverH'||obstacle==='coverV'||obstacle==='hole')return;
  setMoving(true);
  const {error:err}=await supabase.rpc('move_shared_tactical_player',{p_token:token,p_marker_key:selected,p_x:x,p_y:y});
  if(err)setError(err.message);
  else {
   setFeed(old=>({...old,units:old.units?.map(u=>u.key===selected?{...u,x,y}:u)}));
   setSelected(null);
  }
  setMoving(false);
 };
 const roll=()=>{
  const results=Array.from({length:diceCount},()=>{
   const b=new Uint32Array(1);const limit=Math.floor(4294967296/diceSides)*diceSides;
   do{crypto.getRandomValues(b)}while(b[0]>=limit);
   return b[0]%diceSides+1;
  });
  setDiceResults(results);
 };
 return <main className="shared-feed">
  <section className="shared-feed-frame">
   <header><span>SECTOR 07 // ACTIVE FEED</span><span className="shared-feed-status">● LIVE</span></header>
   <div className="shared-feed-viewport" ref={boardRef}>
    {layout&&feed.broadcasting?<div className="shared-feed-board" style={{width:layout.width*CELL,height:layout.height*CELL,transform:`scale(${zoom})`}}>
     {Array.from({length:layout.width*layout.height},(_,i)=>{
      const x=i%layout.width,y=Math.floor(i/layout.width),o=terrain.get(x+','+y);
      return <div key={i} className={'shared-feed-tile '+(o?.type||'')} style={{left:x*CELL,top:y*CELL,backgroundColor:canSee(x,y)?o?.color||layout.floorColors?.[x+','+y]||undefined:'#050b13'}} onClick={()=>void move(x,y)} />;
     })}
     {(feed.units||[]).filter(u=>u.type==='player'||(u.visible!==false&&canSee(u.x,u.y))).map(u=><button type="button" key={u.key} className={'shared-feed-marker '+u.type+(selected===u.key?' selected':'')} style={{left:u.x*CELL+3,top:u.y*CELL+3}} onClick={()=>{if(u.type==='player')setSelected(selected===u.key?null:u.key)}} title={u.name||u.label}>{u.label}</button>)}
    </div>:<div className="shared-feed-empty">{error||'AWAITING TACTICAL BROADCAST'}</div>}
    <div className="shared-feed-zoom">
     <button aria-label="Zoom in" onClick={()=>setZoom(v=>Math.min(3,+(v+.2).toFixed(2)))}><Plus size={19}/></button>
     <button aria-label="Zoom out" onClick={()=>setZoom(v=>Math.max(.4,+(v-.2).toFixed(2)))}><Minus size={19}/></button>
     <button aria-label="Center map" onClick={()=>{setZoom(1);boardRef.current?.scrollTo({left:0,top:0,behavior:'smooth'})}}><Focus size={19}/></button>
    </div>
   </div>
   {error&&<p role="alert" className="shared-feed-error">{error}</p>}
  </section>
  <button type="button" className="shared-feed-dice-fab" aria-label="Open dice spotlight" onClick={()=>{setDiceOpen(true);setDiceResults([])}}><Dices size={26}/></button>
  {diceOpen&&<div className="shared-feed-dice-backdrop"><section className="shared-feed-dice-dialog" role="dialog" aria-modal="true" aria-label="Dice spotlight">
   <header><strong>DICE SPOTLIGHT</strong><button aria-label="Close dice spotlight" onClick={()=>setDiceOpen(false)}><X size={20}/></button></header>
   <label>Dice <input type="number" min={1} max={20} value={diceCount} onChange={e=>setDiceCount(Math.max(1,Math.min(20,Number(e.target.value)||1)))}/></label>
   <label>Sides <select value={diceSides} onChange={e=>setDiceSides(Number(e.target.value))}>{[2,4,6,8,10,12,20,100].map(n=><option key={n} value={n}>D{n}</option>)}</select></label>
   <button onClick={roll}>ROLL</button>
   {diceResults.length>0&&<p className="shared-feed-roll">{diceResults.reduce((a,b)=>a+b,0)} <small>({diceResults.join(' + ')})</small></p>}
  </section></div>}
 </main>;
}
