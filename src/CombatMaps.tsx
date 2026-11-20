import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import './CombatMaps.css';

type MapObject = { type: string; x: number; y: number; number?: number };
type Layout = { version: number; width: number; height: number; objects: MapObject[] };
type SavedMap = { id: string; name: string; width: number; height: number; layout: Layout };
const shapes: Record<string, [number,number]> = {wall:[1,1],pillar:[2,2],coverH:[2,1],coverV:[1,2],player:[1,1],enemy:[1,1]};
function validMap(value: unknown): value is Layout {
  if (!value || typeof value !== 'object') return false;
  const m=value as Layout;
  if(m.version!==1 || !Number.isInteger(m.width)||!Number.isInteger(m.height)||m.width<4||m.height<4||m.width>30||m.height>30||!Array.isArray(m.objects)||m.objects.length>900)return false;
  const taken=new Set<string>();
  const unitNumbers={player:new Set<number>(),enemy:new Set<number>()};
  for(const o of m.objects){
    if(!o||!Object.prototype.hasOwnProperty.call(shapes,o.type)||!Number.isInteger(o.x)||!Number.isInteger(o.y))return false;
    if(o.type==='player'||o.type==='enemy'){
      if(o.number!==undefined){if(!Number.isInteger(o.number)||o.number<1||unitNumbers[o.type].has(o.number))return false;unitNumbers[o.type].add(o.number);}
    }
    const [w,h]=shapes[o.type];
    if(o.x<0||o.y<0||o.x+w>m.width||o.y+h>m.height)return false;
    for(let y=o.y;y<o.y+h;y++)for(let x=o.x;x<o.x+w;x++){const k=x+','+y;if(taken.has(k))return false;taken.add(k);}
  }
  return true;
}
const labels: Record<string,string>={wall:'■',pillar:'▦',coverH:'▰',coverV:'▰'};
type Unit = { key:string; label:string; type:'player'|'enemy'; x:number; y:number };
function unitsForMap(map:Layout):Unit[]{
 const counters={player:0,enemy:0};
 return map.objects.filter(o=>o.type==='player'||o.type==='enemy').map(o=>{
  const type=o.type as 'player'|'enemy';
  const number=o.number??++counters[type];
  if(o.number!==undefined)counters[type]=Math.max(counters[type],o.number);
  const label=(type==='player'?'P':'E')+number;
  return {key:type+':'+number,label,type,x:o.x,y:o.y};
 }).sort((a,b)=>a.type===b.type?Number(a.label.slice(1))-Number(b.label.slice(1)):a.type==='player'?-1:1);
}
function MapGrid({map}:{map:Layout}){
 const occupied=new Map<string,string>();
 const units=unitsForMap(map);
 const unitAt=new Map(units.map(u=>[u.x+','+u.y,u.label]));
 for(const o of map.objects){const [w,h]=shapes[o.type]||[1,1];for(let y=o.y;y<o.y+h;y++)for(let x=o.x;x<o.x+w;x++)occupied.set(x+','+y,o.type);}
 return <div className="combat-map-scroll"><div className="combat-map-grid" style={{gridTemplateColumns:`repeat(${map.width},42px)`}}>{Array.from({length:map.width*map.height},(_,i)=>{const x=i%map.width,y=Math.floor(i/map.width),kind=occupied.get(x+','+y)||'';return <div key={i} className={'combat-map-cell '+kind} title={`Column ${x+1}, row ${y+1} ${unitAt.get(x+','+y)||kind}`}>{unitAt.get(x+','+y)||labels[kind]||''}</div>})}</div></div>;
}
export default function CombatMaps({campaignId,mode}:{campaignId:string;mode:'editor'|'combat'}){
 const [maps,setMaps]=useState<SavedMap[]>([]);
 const [selected,setSelected]=useState('');
 const [name,setName]=useState('');
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [unitNames,setUnitNames]=useState<Record<string,string>>({});
 const frame=useRef<HTMLIFrameElement>(null);
 const pending=useRef<((data:unknown)=>void)|null>(null);
 const load=useCallback(async()=>{
   const {data,error}=await supabase.from('combat_maps').select('id,name,width,height,layout').eq('campaign_id',campaignId).order('name');
   if(error){setMessage('Unable to load maps: '+error.message);return;}
   setMaps((data||[]) as SavedMap[]);
 },[campaignId]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{
  const receive=(event:MessageEvent)=>{
   if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow||!event.data||event.data.source!=='cprpg-map-editor')return;
   if(event.data.action==='export'&&pending.current){const resolve=pending.current;pending.current=null;resolve(event.data.layout);}
  };
  window.addEventListener('message',receive);
  return ()=>window.removeEventListener('message',receive);
 },[]);
 function requestLayout():Promise<unknown>{
  return new Promise((resolve,reject)=>{
   if(!frame.current?.contentWindow){reject(new Error('Editor is not ready'));return;}
   pending.current=resolve;
   frame.current.contentWindow.postMessage({source:'cprpg-gm',action:'export'},window.location.origin);
   window.setTimeout(()=>{if(pending.current===resolve){pending.current=null;reject(new Error('Editor did not respond'));}},3000);
  });
 }
 async function save(){
  const trimmed=name.trim();
  if(!trimmed){setMessage('Enter a map name first.');return;}
  setBusy(true);setMessage('');
  try{
   const layout=await requestLayout();
   if(!validMap(layout))throw new Error('Map contains invalid or overlapping objects.');
   const payload={campaign_id:campaignId,name:trimmed,width:layout.width,height:layout.height,layout};
   const query=selected?supabase.from('combat_maps').update(payload).eq('id',selected).eq('campaign_id',campaignId):supabase.from('combat_maps').insert(payload);
   const {data,error}=await query.select('id').single();
   if(error)throw error;
   setSelected(data.id);await load();setMessage('Map saved to Supabase.');
  }catch(e){setMessage(e instanceof Error?e.message:'Unable to save map.');}
  finally{setBusy(false);}
 }
 function openMap(id:string){
  setSelected(id);
  setUnitNames({});
  const map=maps.find(m=>m.id===id);
  if(!map)return;
  setName(map.name);
  if(mode==='editor')frame.current?.contentWindow?.postMessage({source:'cprpg-gm',action:'import',layout:map.layout},window.location.origin);
 }
 const current=maps.find(m=>m.id===selected);
 return <section className="combat-maps-panel">
  <div className="combat-maps-toolbar">
   <label>Saved maps <select aria-label="Saved maps" value={selected} onChange={e=>openMap(e.target.value)}><option value="">Select a map</option>{maps.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
   <button type="button" onClick={()=>void load()}>Refresh list</button>
   {mode==='editor'&&<><button type="button" onClick={()=>{setSelected('');setName('');frame.current?.contentWindow?.postMessage({source:'cprpg-gm',action:'reset'},window.location.origin);setMessage('New map.');}}>New map</button><label>Map name <input value={name} maxLength={100} onChange={e=>setName(e.target.value)} placeholder="Arasaka Warehouse"/></label><button type="button" disabled={busy} onClick={()=>void save()}>{busy?'Saving...':'Save map'}</button></>}
  </div>
  {message&&<p role="status" className="combat-maps-message">{message}</p>}
  {mode==='editor'?<><p className="combat-maps-hint">Use the drawing tools below. Save a named map to make it available in Combat. The standalone editor's JSON export/import remains available.</p><iframe ref={frame} title="Tactical map editor" src="/map-editor.html?embedded=1" className="combat-map-editor-frame" onLoad={()=>{const map=maps.find(m=>m.id===selected);if(map)frame.current?.contentWindow?.postMessage({source:'cprpg-gm',action:'import',layout:map.layout},window.location.origin)}}/></>:
   current&&validMap(current.layout)?<><h3>{current.name}</h3><MapGrid map={current.layout}/><div className="combat-map-roster"><h3>Combatants</h3><p className="combat-maps-hint">Assign names to the map markers for this combat session.</p><div className="combat-map-roster-grid">{unitsForMap(current.layout).map(unit=><label key={unit.key} className="combat-map-unit-field"><span className={'combat-map-unit-tag '+unit.type}>{unit.label}</span><input type="text" maxLength={100} aria-label={unit.label+' name'} placeholder={unit.type==='player'?'Player name':'Enemy name'} value={unitNames[unit.key]||''} onChange={e=>setUnitNames(prev=>({...prev,[unit.key]:e.target.value}))}/></label>)}</div></div></>:<p className="combat-maps-hint">Choose a saved map to view its grid. Combat actions are not enabled yet.</p>}
 </section>;
}
