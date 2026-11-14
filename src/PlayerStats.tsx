import { useState } from 'react';
import { ArrowLeft, ScanLine } from 'lucide-react';
import './PlayerStats.css';

const slots = [
 {id:'arms',label:'ARMS',name:'Arm Augmentation',description:'Cybernetic upper-limb enhancements for strength, dexterity, or integrated tools.',points:[[27,39],[73,39]]},
 {id:'legs',label:'LEGS',name:'Leg Augmentation',description:'Lower-limb reinforcements designed to improve mobility, stability, and jumping.',points:[[43,76],[57,76]]},
 {id:'spine',label:'SPINE',name:'Spinal Augmentation',description:'Implants along the spinal column for structural support and neural communication.',points:[[50,42]]},
 {id:'operating',label:'OPERATING SYSTEM',name:'Cybernetic Operating System',description:'A central neural processor that coordinates installed cyberware and advanced functions.',points:[[50,16]]},
 {id:'crotch',label:'CROTCH',name:'Pelvic Augmentation',description:'Specialized implants in the pelvic region; capabilities depend on the installed model.',points:[[50,58]]},
] as const;
const attributes = [
 {name:'BODY',value:6,description:'Strength and endurance.'},
 {name:'REFLEXES',value:7,description:'Speed and coordination.'},
 {name:'TECH',value:4,description:'Technical and mechanical aptitude.'},
 {name:'INTELLIGENCE',value:8,description:'Analysis and netrunning.'},
 {name:'COOL',value:5,description:'Composure under pressure.'},
];
export default function PlayerStats({onBack}:{onBack:()=>void}) {
 const [selected,setSelected]=useState<string>('arms');
 const [attribute,setAttribute]=useState<string|null>(null);
 const [view,setView]=useState<'map'|'list'>('map');
 const active=slots.find(s=>s.id===selected) ?? slots[0];
 return <section className="ps-page" aria-label="Character stats">
  <header className="ps-header"><button type="button" onClick={onBack}><ArrowLeft size={17}/> Back</button><div><small>PERSONAL PROFILE // NIGHT CITY</small><h2>CHARACTER STATS</h2></div><ScanLine size={22}/></header>
  <section className="ps-panel"><div className="ps-heading"><strong>ATTRIBUTES</strong><small>DEMO VALUES</small></div>
   <div className="ps-attributes">{attributes.map(a=><button type="button" key={a.name} aria-pressed={attribute===a.name} className={attribute===a.name?'selected':''} onClick={()=>setAttribute(attribute===a.name?null:a.name)}><span>{a.name}</span><strong>{a.value}</strong></button>)}</div>
   {attribute&&<p className="ps-attribute-detail">{attribute}: {attributes.find(a=>a.name===attribute)?.description}</p>}
  </section>
  <section className="ps-panel"><div className="ps-heading"><strong>CYBERWARE // INSTALLED</strong><small>DEMO SLOTS</small></div>
   <div className="ps-tabs"><button type="button" className={view==='map'?'active':''} aria-pressed={view==='map'} onClick={()=>setView('map')}>BODY MAP</button><button type="button" className={view==='list'?'active':''} aria-pressed={view==='list'} onClick={()=>setView('list')}>LIST</button></div>
   <div className={'ps-layout '+(view==='list'?'ps-list-only':'')}>
    {view==='map'&&<div className="ps-body"><img src="/cyberware/cyberware-anatomical-scan.webp" alt="Cybernetic anatomical illustration"/>{slots.flatMap(s=>s.points.map(([x,y],i)=><button type="button" key={s.id+i} className={'ps-marker '+(selected===s.id?'active':'')} style={{left:x+'%',top:y+'%'}} title={s.label} aria-label={'Select '+s.label} onClick={()=>setSelected(s.id)}/>))}<div className="ps-scan-label">ANATOMICAL SCAN</div></div>}
    <div className="ps-slots">{slots.map(s=><button type="button" key={s.id} aria-pressed={selected===s.id} className={selected===s.id?'selected':''} onClick={()=>setSelected(s.id)}><span>{s.label}</span><strong>{s.name}</strong></button>)}</div>
   </div>
   <div className="ps-detail" aria-live="polite"><div><strong>{active.name}</strong><small>PLACEHOLDER</small></div><p>{active.description}</p><small>Preview only — no cyberware is installed or modified.</small></div>
  </section>
  <button type="button" className="ps-close" onClick={onBack}>CLOSE</button>
 </section>;
}
