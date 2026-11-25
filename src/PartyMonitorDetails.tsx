import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { anatomicalPositions } from './anatomicalPositions';
import { useGMCharacterData } from './GMCharacterData';
import { supabase } from './supabase';
import './PlayerStats.css';
import './PartyMonitorDetails.css';

type rightOrLeft = 'right'|'left';
type Stat = { id:string; name:string; value:number; maxValue:number };
const tiers = [
 {min:0,color:'#8b95a4'}, {min:5,color:'#4ade80'},
 {min:10,color:'#32c5c5'}, {min:15,color:'#bd7bea'}, {min:20,color:'#f59e0b'},
];
const statColor = (value:number) => [...tiers].reverse().find(t=>value>=t.min)?.color ?? tiers[0].color;

export default function PartyMonitorDetails({campaignId,characterId}:{campaignId:string;characterId:string}) {
 const [tab,setTab]=useState<'stats'|'cyberware'>('stats');
 const [stats,setStats]=useState<Stat[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [position,setPosition]=useState<string|null>(null);
 const [page,setPage]=useState(0);
 const [anchor,setAnchor]=useState<{x:number;y:number;side:'right'|'left'}|null>(null);
 const popoverRef=useRef<HTMLElement|null>(null);
 const markerRef=useRef<HTMLElement|null>(null);
 const openPosition=(id:string,event:React.MouseEvent<HTMLButtonElement>)=>{
  markerRef.current=event.currentTarget;
  setPage(0);
  setPosition(id);
 };
 useLayoutEffect(()=>{
  if(!position)return;
  const update=()=>{
   const rect=markerRef.current?.getBoundingClientRect();if(!rect)return;
   const width=Math.min(300,window.innerWidth-24);
   const height=Math.min(410,window.innerHeight-24);
   const gap=18;
   const rightFits=rect.right+gap+width<=window.innerWidth-12;
   const leftFits=rect.left-gap-width>=12;
   const side:rightOrLeft=rightFits||!leftFits?'right':'left';
   const x=side==='right'?Math.min(window.innerWidth-width-12,rect.right+gap):Math.max(12,rect.left-gap-width);
   const y=Math.max(12,Math.min(window.innerHeight-height-12,rect.top+rect.height/2-height/2));
   setAnchor({x,y,side});
  };
  update();window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
  return()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true)};
 },[position]);
 const shared=useGMCharacterData();
 useEffect(()=>{
  let active=true;
  setStats([]);setError('');setPosition(null);
  const load=async()=>{
   setLoading(true);
   const [definitions,values]=await Promise.all([
    supabase.from('stat_definitions').select('id,name,display_order,max_value').eq('campaign_id',campaignId).order('display_order'),
    supabase.from('character_stats').select('stat_id,value').eq('campaign_id',campaignId).eq('character_id',characterId)
   ]);
   if(!active)return;
   if(definitions.error||values.error)setError(definitions.error?.message??values.error?.message??'Unable to load stats');
   else {
    const byId=new Map((values.data??[]).map(row=>[row.stat_id,Number(row.value)]));
    setStats((definitions.data??[]).map(row=>({id:row.id,name:row.name,value:byId.get(row.id)??0,maxValue:row.max_value??20})));
   }
   setLoading(false);
  };
  void load();
  return()=>{active=false};
 },[campaignId,characterId]);
 useEffect(()=>{setPosition(null);setAnchor(null)},[tab,characterId]);
 useEffect(()=>{
  if(!position)return;
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setPosition(null)};
  const outside=(e:PointerEvent)=>{if(popoverRef.current?.contains(e.target as Node))return;setPosition(null)};
  document.addEventListener('keydown',onKey);
  document.addEventListener('pointerdown',outside,true);
  return()=>{document.removeEventListener('keydown',onKey);document.removeEventListener('pointerdown',outside,true)};
 },[position]);
 const installed=shared.cyberware.filter(c=>c.character_id===characterId);
 const selected=installed.filter(c=>c.position_id===position);
 return <>
  <div className="party-detail-tabs" role="tablist" aria-label="Character details">
   <button type="button" role="tab" aria-selected={tab==='stats'} className={tab==='stats'?'active':''} onClick={()=>setTab('stats')}>STATS</button>
   <button type="button" role="tab" aria-selected={tab==='cyberware'} className={tab==='cyberware'?'active':''} onClick={()=>setTab('cyberware')}>CYBERWARE</button>
  </div>
  {tab==='stats'?
   <div className="party-detail-stats">
    {loading?<p>Loading stats...</p>:error?<p role="alert">{error}</p>:stats.length===0?<p>No stats assigned.</p>:
     <div className="party-detail-stat-grid">{stats.map(stat=><div key={stat.id} className="party-detail-stat" style={{borderColor:statColor(stat.value)}}><span>{stat.name}</span><strong style={{color:statColor(stat.value)}}>{stat.value}</strong></div>)}</div>}
   </div>:
   <div className="party-detail-cyberware">
    {shared.loading?<p>Loading cyberware...</p>:shared.error?<p role="alert">{shared.error}</p>:null}
    <div className="ps-scan-viewport">
     <div className="ps-scan-layer">
      <img src="/cyberware/cyberware-anatomical-scan.webp" alt="Cybernetic anatomical illustration"/>
      {anatomicalPositions.map(slot=>{
       const count=installed.filter(c=>c.position_id===slot.id).length;
       return <button key={slot.id} type="button" className={'ps-marker'+(count?' installed':'')} style={{left:slot.x+'%',top:slot.y+'%'}} title={slot.label+(count?' // '+count+' installed':'')} aria-label={slot.label+(count?' // inspect implants':' // empty')} disabled={!count} onClick={event=>openPosition(slot.id,event)}/>;
      })}
     </div>
    </div>
    <div className="ps-scan-label">ANATOMICAL SCAN // {installed.length} INSTALLED</div>
   </div>}
  {position&&selected.length>0&&anchor&&createPortal(
   <section ref={popoverRef} className={'party-implant-popover party-implant-'+anchor.side} style={{left:anchor.x,top:anchor.y}} role="dialog" aria-label="Installed cyberware details">
    {selected.length>1&&<button type="button" className="party-implant-prev" disabled={page===0} onClick={()=>setPage(n=>Math.max(0,n-1))} aria-label="Previous implant"><ChevronLeft size={18}/></button>}
    <div className="party-implant-content">
     <div className="party-implant-name">{selected[Math.min(page,selected.length-1)].name}</div>
     <div className="party-implant-art">{selected[Math.min(page,selected.length-1)].image_url?<img src={selected[Math.min(page,selected.length-1)].image_url!} alt={selected[Math.min(page,selected.length-1)].name+' artwork'}/>:<span>No artwork available</span>}</div>
     <div className="party-implant-description">{selected[Math.min(page,selected.length-1)].description||'No description available.'}</div>
     <div className="party-implant-footer">{selected[Math.min(page,selected.length-1)].item_id===null&&<span>CUSTOM MADE</span>}{selected.length>1&&<span>{page+1} / {selected.length}</span>}</div>
    </div>
    {selected.length>1&&<button type="button" className="party-implant-next" disabled={page>=selected.length-1} onClick={()=>setPage(n=>Math.min(selected.length-1,n+1))} aria-label="Next implant"><ChevronRight size={18}/></button>}
   </section>,document.body)}
 </>;
}
