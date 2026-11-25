import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { anatomicalPositions } from './anatomicalPositions';
import { useGMCharacterData, type SharedCyberware } from './GMCharacterData';
import { supabase } from './supabase';
import './PlayerStats.css';
import './PartyMonitorDetails.css';

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
 useEffect(()=>{setPosition(null)},[tab,characterId]);
 useEffect(()=>{
  if(!position)return;
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setPosition(null)};
  document.addEventListener('keydown',onKey);
  return()=>document.removeEventListener('keydown',onKey);
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
       return <button key={slot.id} type="button" className={'ps-marker'+(count?' installed':'')} style={{left:slot.x+'%',top:slot.y+'%'}} title={slot.label+(count?' // '+count+' installed':'')} aria-label={slot.label+(count?' // inspect implants':' // empty')} disabled={!count} onClick={()=>setPosition(slot.id)}/>;
      })}
     </div>
    </div>
    <div className="ps-scan-label">ANATOMICAL SCAN // {installed.length} INSTALLED</div>
   </div>}
  {position&&selected.length>0&&createPortal(<div className="party-implant-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)setPosition(null)}} role="presentation">
   <section className="party-implant-window" role="dialog" aria-modal="true" aria-label="Installed cyberware details">
    <header><strong>{anatomicalPositions.find(s=>s.id===position)?.label.toUpperCase()} // INSTALLED CYBERWARE</strong><button type="button" onClick={()=>setPosition(null)} aria-label="Close implant details"><X size={19}/></button></header>
    <div className="party-implant-list">{selected.map((implant:SharedCyberware)=><article key={implant.id}>
     <h3>{implant.name}</h3>
     {implant.image_url&&<img src={implant.image_url} alt={implant.name+' artwork'}/>}
     <p>{implant.description||'No description available.'}</p>
     {!implant.item_id&&<small>CUSTOM MADE</small>}
    </article>)}</div>
   </section>
  </div>,document.body)}
 </>;
}
