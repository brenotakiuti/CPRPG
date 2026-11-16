import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { ArrowLeft, ScanLine } from 'lucide-react';
import './PlayerStats.css';
import { anatomicalPositions } from './anatomicalPositions';
import { ArtworkZoomButton } from './ArtworkViewer';

const attributes = [
 {name:'BODY',value:6,description:'Strength and endurance.'},
 {name:'REFLEXES',value:7,description:'Speed and coordination.'},
 {name:'TECH',value:4,description:'Technical and mechanical aptitude.'},
 {name:'INTELLIGENCE',value:8,description:'Analysis and netrunning.'},
 {name:'COOL',value:5,description:'Composure under pressure.'},
];
type InstalledCyberware = { id: string; name: string; description: string | null; image_url: string | null; position_id: string };
export default function PlayerStats({onBack,characterId}:{onBack:()=>void;characterId:string}) {
 const [installed,setInstalled]=useState<InstalledCyberware[]>([]);
 const [installedLoading,setInstalledLoading]=useState(true);
 const [installedError,setInstalledError]=useState('');
 const [selectedInstalled,setSelectedInstalled]=useState<string|null>(null);
 useEffect(()=>{
  let active=true;
  const load=async()=>{
   const {data,error}=await supabase.from('character_cyberware').select('id,name,description,image_url,position_id').eq('character_id',characterId).is('removed_at',null).order('installed_at',{ascending:false});
   if(!active)return;
   setInstalled((data??[]) as InstalledCyberware[]);
   setInstalledError(error?.message??'');
   setInstalledLoading(false);
  };
  setInstalledLoading(true);void load();
  const channel=supabase.channel('player-cyberware-'+characterId).on('postgres_changes',{event:'*',schema:'public',table:'character_cyberware',filter:'character_id=eq.'+characterId},()=>{void load();}).subscribe();
  return ()=>{active=false;void supabase.removeChannel(channel);};
 },[characterId]);
 const [mapSelected,setMapSelected]=useState<string|null>(null);
 const [listSelected,setListSelected]=useState<string|null>(null);
 const [view,setView]=useState<'map'|'list'>('map');
 const active=anatomicalPositions.find(s=>s.id===mapSelected);
 const zoom = active ? 2.7 : 1;
 const [focusX,focusY] = active ? [active.x,active.y] : [50,50];
 const zoomStyle = {transform: `translate(${(50-focusX)*zoom}%, ${(50-focusY)*zoom}%) scale(${zoom})`};
 const implantsAt = (positionId: string) => installed.filter(i => i.position_id === positionId);
 const showMap = () => { setMapSelected(null); setView('map'); };
 const showList = () => { setListSelected(null); setView('list'); };
 return <section className="ps-page" aria-label="Character stats">
  <header className="ps-header"><button type="button" onClick={onBack}><ArrowLeft size={17}/> Back</button><div><small>PERSONAL PROFILE // NIGHT CITY</small><h2>CHARACTER STATS</h2></div><ScanLine size={22}/></header>
  <section className="ps-panel"><div className="ps-heading"><strong>ATTRIBUTES</strong><small>DEMO VALUES</small></div>
   <div className="ps-attributes">{attributes.map(a=><div className="ps-attribute-tile" key={a.name}><span>{a.name}</span><strong>{a.value}</strong></div>)}</div>
  </section>
  <section className="ps-panel"><div className="ps-heading"><strong>INSTALLED IMPLANTS</strong><small>LIVE DATA</small></div>
   {installedLoading?<p>Loading implants…</p>:installedError?<p role="alert">{installedError}</p>:installed.length===0?<p>No cyberware installed.</p>:
   <div className="ps-slots">{installed.map(i=><div className="ps-slot-entry" key={i.id}>
    <button type="button" className={selectedInstalled===i.id?'selected':''} aria-expanded={selectedInstalled===i.id} onClick={()=>setSelectedInstalled(selectedInstalled===i.id?null:i.id)}>
     <span>{i.position_id}</span><strong>{i.name}</strong>
    </button>
    {selectedInstalled===i.id&&<div className="ps-inline-detail ps-installed-detail">
      {i.image_url&&<div style={{position:'relative',width:'100%',maxWidth:240}}><img src={i.image_url} alt={i.name+' artwork'}/><ArtworkZoomButton src={i.image_url} alt={i.name}/></div>}
      <p>{i.description||'No description available.'}</p>
    </div>}
   </div>)}</div>}
  </section>
  <section className="ps-panel"><div className="ps-heading"><strong>CYBERWARE // INSTALLED</strong><small>15 POSITIONS // LIVE DATA</small></div>
   <div className="ps-tabs"><button type="button" className={view==='map'?'active':''} aria-pressed={view==='map'} onClick={showMap}>BODY MAP</button><button type="button" className={view==='list'?'active':''} aria-pressed={view==='list'} onClick={showList}>LIST</button></div>
   <div className={'ps-layout '+(view==='list'?'ps-list-only':'')}>
    {view==='map'&&<div className="ps-body">
     <div className="ps-scan-viewport"><div className="ps-scan-layer" style={zoomStyle}>
      <img src="/cyberware/cyberware-anatomical-scan.webp" alt="Cybernetic anatomical illustration"/>
      {anatomicalPositions.map(s=><button type="button" key={s.id} className={'ps-marker '+(mapSelected===s.id?'active':'')+(implantsAt(s.id).length?' installed':'')} style={{left:s.x+'%',top:s.y+'%',transform:`translate(-50%, -50%) scale(${1 / zoom})`}} title={s.label+(implantsAt(s.id).length?' // '+implantsAt(s.id).length+' installed':'')} aria-label={'Select '+s.label} onClick={()=>setMapSelected(s.id)}/>)}
     </div>{active&&<button type="button" className="ps-zoom-back" onClick={()=>setMapSelected(null)}><ArrowLeft size={13}/> FULL BODY</button>}</div>
     <div className="ps-scan-label">{active?'FOCUSED SCAN // '+active.label:'ANATOMICAL SCAN'}</div>
    </div>}
    <div className="ps-slots">{installedLoading?<p>Loading implants…</p>:installedError?<p role="alert">{installedError}</p>:installed.length===0?<p>No cyberware installed.</p>:anatomicalPositions.filter(s=>implantsAt(s.id).length>0).map(s=><div key={s.id} className="ps-slot-entry">
     <button type="button" aria-pressed={(view==='map'?mapSelected:listSelected)===s.id} className={(view==='map'?mapSelected:listSelected)===s.id?'selected':''} onClick={()=>view==='map'?setMapSelected(s.id):setListSelected(s.id)}><span>{s.id} // {s.label.toUpperCase()}</span><strong>{implantsAt(s.id).length ? implantsAt(s.id).map(i=>i.name).join(', ') : 'No cyberware installed'}</strong></button>
     {(view==='map'?mapSelected:listSelected)===s.id&&<div className="ps-inline-detail" aria-live="polite">
      {implantsAt(s.id).length===0?<p>No cyberware installed at this position.</p>:implantsAt(s.id).map(i=><div key={i.id} className="ps-position-implant"><strong>{i.name}</strong><div className="ps-installed-detail">{i.image_url&&<div style={{position:'relative',width:'100%',maxWidth:240}}><img src={i.image_url} alt={i.name+' artwork'}/><ArtworkZoomButton src={i.image_url} alt={i.name}/></div>}<p>{i.description||'No description available.'}</p></div></div>)}
     </div>}
    </div>)}</div>
   </div>
  </section>
 </section>;
}
