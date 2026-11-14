import { useState } from 'react';
import { ArrowLeft, ScanLine } from 'lucide-react';
import './PlayerStats.css';

const slots = [
 {id:'arms',label:'ARMS',name:'Arm Augmentation',description:'Cybernetic upper-limb enhancements for strength, dexterity, or integrated tools.',points:[[68,31]]},
 {id:'legs',label:'LEGS',name:'Leg Augmentation',description:'Lower-limb reinforcements designed to improve mobility, stability, and jumping.',points:[[61,65]]},
 {id:'spine',label:'SPINE',name:'Spinal Augmentation',description:'Implants along the spinal column for structural support and neural communication.',points:[[50,14]]},
 {id:'operating',label:'OPERATING SYSTEM',name:'Cybernetic Operating System',description:'A central neural processor that coordinates installed cyberware and advanced functions.',points:[[50,6]]},
 {id:'crotch',label:'CROTCH',name:'Pelvic Augmentation',description:'Specialized implants in the pelvic region; capabilities depend on the installed model.',points:[[50,46]]},
] as const;
const attributes = [
 {name:'BODY',value:6,description:'Strength and endurance.'},
 {name:'REFLEXES',value:7,description:'Speed and coordination.'},
 {name:'TECH',value:4,description:'Technical and mechanical aptitude.'},
 {name:'INTELLIGENCE',value:8,description:'Analysis and netrunning.'},
 {name:'COOL',value:5,description:'Composure under pressure.'},
];
export default function PlayerStats({onBack}:{onBack:()=>void}) {
 const [selected,setSelected]=useState<string|null>(null);
  const [view,setView]=useState<'map'|'list'>('map');
 const active=slots.find(s=>s.id===selected);
 const zoom = active ? (active.id === 'legs' ? 2.65 : active.id === 'arms' ? 2.7 : active.id === 'crotch' ? 2.8 : 3.2) : 1;
 const [focusX,focusY] = active?.points[0] ?? [50,50];
 const zoomStyle = {transform: `translate(${(50-focusX)*zoom}%, ${(50-focusY)*zoom}%) scale(${zoom})`};
 const selectSlot = (id:string) => { setSelected(id); };
 return <section className="ps-page" aria-label="Character stats">
  <header className="ps-header"><button type="button" onClick={onBack}><ArrowLeft size={17}/> Back</button><div><small>PERSONAL PROFILE // NIGHT CITY</small><h2>CHARACTER STATS</h2></div><ScanLine size={22}/></header>
  <section className="ps-panel"><div className="ps-heading"><strong>ATTRIBUTES</strong><small>DEMO VALUES</small></div>
   <div className="ps-attributes">{attributes.map(a=><div className="ps-attribute-tile" key={a.name}><span>{a.name}</span><strong>{a.value}</strong></div>)}</div>
  </section>
  <section className="ps-panel"><div className="ps-heading"><strong>CYBERWARE // INSTALLED</strong><small>DEMO SLOTS</small></div>
   <div className="ps-tabs"><button type="button" className={view==='map'?'active':''} aria-pressed={view==='map'} onClick={()=>setView('map')}>BODY MAP</button><button type="button" className={view==='list'?'active':''} aria-pressed={view==='list'} onClick={()=>setView('list')}>LIST</button></div>
   <div className={'ps-layout '+(view==='list'?'ps-list-only':'')}>
    {view==='map'&&<div className="ps-body">
     <div className="ps-scan-viewport"><div className="ps-scan-layer" style={zoomStyle}>
      <img src="/cyberware/cyberware-anatomical-scan.webp" alt="Cybernetic anatomical illustration"/>
      {slots.flatMap(s=>s.points.map(([x,y],i)=><button type="button" key={s.id+i} className={'ps-marker '+(selected===s.id?'active':'')} style={{left:x+'%',top:y+'%',transform:`translate(-50%, -50%) scale(${1 / zoom})`}} title={s.label} aria-label={'Select '+s.label} onClick={()=>selectSlot(s.id)}/>))}
     </div>{active&&<button type="button" className="ps-zoom-back" onClick={()=>setSelected(null)}><ArrowLeft size={13}/> FULL BODY</button>}</div>
     <div className="ps-scan-label">{active?'FOCUSED SCAN // '+active.label:'ANATOMICAL SCAN'}</div>
    </div>}
    <div className="ps-slots">{slots.map(s=><div key={s.id} className="ps-slot-entry">
     <button type="button" aria-pressed={selected===s.id} className={selected===s.id?'selected':''} onClick={()=>selectSlot(s.id)}><span>{s.label}</span><strong>{s.name}</strong></button>
     {selected===s.id&&<div className="ps-inline-detail" aria-live="polite"><p>{s.description}</p><small>PLACEHOLDER // No cyberware is installed or modified.</small></div>}
    </div>)}</div>
   </div>
  </section>
  <button type="button" className="ps-close" onClick={onBack}>CLOSE</button>
 </section>;
}
