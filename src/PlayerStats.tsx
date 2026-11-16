import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabase';
import { ArrowLeft, ScanLine, Search } from 'lucide-react';
import './PlayerStats.css';
import { anatomicalPositions } from './anatomicalPositions';



/* Cyberware-only portal viewer: leaves the inventory artwork component unchanged. */
function CyberwareArtworkZoom({ src, alt }: { src: string; alt: string }) {
 const [open, setOpen] = useState(false);
 const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
 const viewport = useRef<HTMLDivElement>(null);
 const image = useRef<HTMLImageElement>(null);
 const pointers = useRef(new Map<number, { x: number; y: number }>());
 const gesture = useRef<{ distance: number; scale: number } | null>(null);
 const current = useRef(transform);
 current.current = transform;
 useEffect(() => {
  if (!open) return;
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
 }, [open]);
 function update(next: { x: number; y: number; scale: number }) {
  const box = viewport.current?.getBoundingClientRect();
  const img = image.current;
  if (!box || !img) { setTransform(next); return; }
  const fit = Math.min(box.width / (img.naturalWidth || box.width), box.height / (img.naturalHeight || box.height));
  const maxX = Math.max(0, ((img.naturalWidth || box.width) * fit * next.scale - box.width) / 2);
  const maxY = Math.max(0, ((img.naturalHeight || box.height) * fit * next.scale - box.height) / 2);
  setTransform({ x: Math.max(-maxX, Math.min(maxX, next.x)), y: Math.max(-maxY, Math.min(maxY, next.y)), scale: next.scale });
 }
 function pointerDown(e: React.PointerEvent<HTMLDivElement>) {
  e.currentTarget.setPointerCapture(e.pointerId);
  pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.current.size === 2) {
   const [a,b] = [...pointers.current.values()];
   gesture.current = { distance: Math.hypot(a.x-b.x,a.y-b.y), scale: current.current.scale };
  }
 }
 function pointerMove(e: React.PointerEvent<HTMLDivElement>) {
  const previous = pointers.current.get(e.pointerId);
  if (!previous) return;
  pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.current.size === 2) {
   const [a,b] = [...pointers.current.values()];
   if (gesture.current?.distance) update({ ...current.current, scale: Math.max(1, Math.min(6, gesture.current.scale * Math.hypot(a.x-b.x,a.y-b.y) / gesture.current.distance)) });
  } else if (pointers.current.size === 1) update({ ...current.current, x: current.current.x+e.clientX-previous.x, y: current.current.y+e.clientY-previous.y });
 }
 function pointerEnd(e: React.PointerEvent<HTMLDivElement>) { pointers.current.delete(e.pointerId); gesture.current = null; }
 return <>
  <button type="button" aria-label={`Inspect ${alt} artwork`} title="Inspect artwork" onClick={() => { setTransform({x:0,y:0,scale:1}); setOpen(true); }}
   style={{position:'absolute',right:10,bottom:10,zIndex:2,display:'grid',placeItems:'center',width:40,height:40,borderRadius:8,border:'1px solid #e8bd4a',background:'#10151de8',color:'#e8bd4a',cursor:'pointer'}}>
   <Search size={21} aria-hidden="true"/>
  </button>
  {open && createPortal(<div role="dialog" aria-modal="true" aria-label={`Inspect ${alt} artwork`}
   style={{position:'fixed',inset:0,zIndex:2000,display:'flex',flexDirection:'column',alignItems:'center',background:'rgba(2,4,10,.96)',color:'#f0e5cc',padding:'max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom))',boxSizing:'border-box'}}>
   <div ref={viewport} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd}
    onWheel={e=>{e.preventDefault();update({...current.current,scale:Math.max(1,Math.min(6,current.current.scale*(e.deltaY<0?1.15:1/1.15)))})}}
    onDoubleClick={()=>update(current.current.scale>1?{x:0,y:0,scale:1}:{...current.current,scale:2.5})}
    style={{flex:1,width:'100%',minHeight:0,overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',touchAction:'none',cursor:transform.scale>1?'grab':'zoom-in',userSelect:'none'}}>
    <img ref={image} src={src} alt={alt} draggable={false} onLoad={()=>update(current.current)}
     style={{maxWidth:'100%',maxHeight:'100%',width:'auto',height:'auto',objectFit:'contain',transform:`translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,transformOrigin:'center',pointerEvents:'none'}}/>
   </div>
   <div style={{flexShrink:0,padding:'14px 0 4px',display:'flex',justifyContent:'center',width:'100%'}}>
    <button type="button" onClick={()=>setOpen(false)} style={{border:'1px solid #c4a261',borderRadius:7,background:'#d3aa5c',color:'#16120b',padding:'12px 38px',fontWeight:700,fontSize:15,cursor:'pointer'}}>CLOSE</button>
   </div>
  </div>, document.body)}
 </>;
}

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
      {i.image_url&&<div style={{position:'relative',width:'100%',maxWidth:240}}><img src={i.image_url} alt={i.name+' artwork'}/><CyberwareArtworkZoom src={i.image_url} alt={i.name}/></div>}
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
      {implantsAt(s.id).length===0?<p>No cyberware installed at this position.</p>:implantsAt(s.id).map(i=><div key={i.id} className="ps-position-implant"><strong>{i.name}</strong><div className="ps-installed-detail">{i.image_url&&<div style={{position:'relative',width:'100%',maxWidth:240}}><img src={i.image_url} alt={i.name+' artwork'}/><CyberwareArtworkZoom src={i.image_url} alt={i.name}/></div>}<p>{i.description||'No description available.'}</p></div></div>)}
     </div>}
    </div>)}</div>
   </div>
  </section>
 </section>;
}
