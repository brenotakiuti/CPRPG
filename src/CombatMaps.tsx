import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleHelp, Eye, Sun, Moon, ScanEye, Flame, AudioLines, Network, Check, RefreshCw, FolderOpen, RadioTower, Wifi, WifiOff, FilePlus2, Save } from 'lucide-react';
import { supabase } from './supabase';
import './CombatMaps.css';

type MapObject = { type: string; x: number; y: number; number?: number; color?: string };
type Gate = { type:'gate'; side:'top'|'bottom'|'left'|'right'; start:number; length:number };
type Layout = { version: number; width: number; height: number; objects: MapObject[]; gates?:Gate[]; floorColors?:Record<string,string>; groups?:{id:string;cells:string[]}[]; layerVisibility?:Record<string,Record<string,boolean>> };
type SavedMap = { id: string; name: string; width: number; height: number; layout: Layout };
const shapes: Record<string, [number,number]> = {wall:[1,1],cover:[1,1],hole:[1,1],target:[1,1],poi:[1,1],pillar:[2,2],coverH:[2,1],coverV:[1,2],player:[1,1],enemy:[1,1]};
const allowedColors=new Set(['#718096','#c2a477','#a35d42','#4c8065','#427caa','#8467a8','#b66b81','#c4a448']);
const terrainKind=(type:string)=>type==='pillar'?'wall':type==='coverH'||type==='coverV'?'cover':type;
function mapValidationError(value:unknown):string|null {
  if(!value||typeof value!=='object')return 'Map data is missing.';
  const m=value as Layout;
  if(m.version!==1||!Number.isInteger(m.width)||!Number.isInteger(m.height)||m.width<4||m.height<4||m.width>30||m.height>30||!Array.isArray(m.objects)||m.objects.length>900)return 'Invalid map dimensions or object list.';
  if(m.gates!==undefined){
    if(!Array.isArray(m.gates)||m.gates.length>120)return 'Invalid gate list.';
    const used=new Set<string>();
    for(const g of m.gates){
      if(!g||g.type!=='gate'||!['top','bottom','left','right'].includes(g.side)||!Number.isInteger(g.start)||!Number.isInteger(g.length)||g.start<0||g.length<1||g.start+g.length>(g.side==='top'||g.side==='bottom'?m.width:m.height))return 'Invalid gate position or size.';
      for(let i=g.start;i<g.start+g.length;i++){const k=g.side+':'+i;if(used.has(k))return 'Overlapping gates at '+k+'.';used.add(k)}
    }
  }
  if(m.floorColors!==undefined){
    if(!m.floorColors||typeof m.floorColors!=='object'||Array.isArray(m.floorColors)||Object.keys(m.floorColors).length>900)return 'Invalid floor color settings.';
    for(const [k,color] of Object.entries(m.floorColors)){const match=/^(\\d+),(\\d+)$/.exec(k);if(!match||+match[1]>=m.width||+match[2]>=m.height||!allowedColors.has(color))return 'Invalid floor color at '+k+'.'}
  }
  const taken=new Map<string,string>();
  const numbers:Record<string,Set<number>>={player:new Set(),enemy:new Set(),target:new Set(),poi:new Set()};
  for(const [index,o] of m.objects.entries()){
    if(!o||!Object.prototype.hasOwnProperty.call(shapes,o.type)||!Number.isInteger(o.x)||!Number.isInteger(o.y))return 'Invalid object #'+(index+1)+'.';
    const label=o.type+' at column '+(o.x+1)+', row '+(o.y+1);
    if(Object.prototype.hasOwnProperty.call(numbers,o.type)&&o.number!==undefined){
      if(!Number.isInteger(o.number)||o.number<1)return 'Invalid marker number for '+label+'.';
      if(numbers[o.type].has(o.number))return 'Duplicate '+o.type+' marker number '+o.number+'.';
      numbers[o.type].add(o.number);
    }
    if(o.color!==undefined&&(!['wall','cover','hole','pillar','coverH','coverV'].includes(o.type)||!allowedColors.has(o.color)))return 'Invalid color on '+label+'.';
    const [width,height]=shapes[o.type];
    if(o.x<0||o.y<0||o.x+width>m.width||o.y+height>m.height)return 'Object outside map: '+label+'.';
    for(let y=o.y;y<o.y+height;y++)for(let x=o.x;x<o.x+width;x++){
      const k=x+','+y;
      if(taken.has(k))return 'Overlapping objects: '+label+' and '+taken.get(k)+' at column '+(x+1)+', row '+(y+1)+'.';
      taken.set(k,label);
    }
  }
  if(m.groups!==undefined){
    if(!Array.isArray(m.groups)||m.groups.length>900)return 'Invalid obstacle groups.';
    const used=new Set<string>();
    for(const [index,g] of m.groups.entries()){
      if(!g||typeof g.id!=='string'||!Array.isArray(g.cells)||g.cells.length>900)return 'Invalid obstacle group #'+(index+1)+'.';
      for(const k of g.cells){
        if(typeof k!=='string'||!taken.has(k))return 'Obstacle group #'+(index+1)+' refers to an empty or invalid cell '+String(k)+'.';
        if(used.has(k))return 'Obstacle cell '+k+' belongs to more than one group.';
        used.add(k);
      }
    }
  }
  return null;
}
function validMap(value:unknown):value is Layout{return mapValidationError(value)===null;}

const labels: Record<string,string>={wall:'■',cover:'▰',hole:'◌'};
type Unit = { key:string; label:string; type:'player'|'enemy'|'target'|'objective'; x:number; y:number };
function unitsForMap(map:Layout):Unit[]{
 const counters={player:0,enemy:0,poi:0,target:0};
 return map.objects.filter(o=>['player','enemy','poi','target'].includes(o.type)).map(o=>{
  const type=o.type as 'player'|'enemy'|'poi'|'target';
  const number=o.number??++counters[type];
  if(o.number!==undefined)counters[type]=Math.max(counters[type],o.number);
  const label=({player:'P',enemy:'E',poi:'T',target:'O'}[type])+number;
  const markerType:Unit['type']=type==='poi'?'target':type==='target'?'objective':type;
  return {key:type+':'+number,label,type:markerType,x:o.x,y:o.y};
 }).sort((a,b)=>a.type===b.type?Number(a.label.slice(1))-Number(b.label.slice(1)):a.label.localeCompare(b.label));
}
type LiveUnit = Unit & {characterId?:string|null;name?:string;visible:boolean;manualReveal?:Record<string,'hidden'|'direction'|'revealed'>};
type LiveState = {mapId:string;broadcasting:boolean;units:LiveUnit[];visibilityMode:'full'|'dark'|'light';visibilityRadius:number;revealMode:'automatic'|'manual'};
type CampaignCharacter = {id:string;name:string};
function MapGrid({map,units,onMove}:{map:Layout;units:LiveUnit[];onMove:(key:string,x:number,y:number)=>void}){
 const occupied=new Map<string,{type:string;color?:string}>();
 for(const o of map.objects){if(['player','enemy','target','poi'].includes(o.type))continue;const [w,h]=shapes[o.type]||[1,1];for(let y=o.y;y<o.y+h;y++)for(let x=o.x;x<o.x+w;x++)occupied.set(x+','+y,{type:terrainKind(o.type),color:o.color});}
 const cellSize=44;const gates=map.gates||[];
 const stacks=new Map<string,LiveUnit[]>();for(const u of units){const k=u.x+','+u.y;stacks.set(k,[...(stacks.get(k)||[]),u]);}
 return <div className="combat-map-scroll"><div className="combat-map-boundary" style={{width:map.width*cellSize+20,height:map.height*cellSize+20}}>
  <div className="combat-map-grid" style={{position:'absolute',left:10,top:10,gridTemplateColumns:`repeat(${map.width},42px)`}}>{Array.from({length:map.width*map.height},(_,i)=>{const x=i%map.width,y=Math.floor(i/map.width),tile=occupied.get(x+','+y),kind=tile?.type||'',customColor=tile?.color||(!tile?map.floorColors?.[x+','+y]:undefined);return <div key={i} data-x={x} data-y={y} style={customColor?{backgroundColor:customColor}:undefined} className={'combat-map-cell '+kind} title={`Column ${x+1}, row ${y+1}`}>{labels[kind]||''}</div>})}</div>
  {units.map(u=>{const stack=stacks.get(u.x+','+u.y)||[u];const index=stack.findIndex(v=>v.key===u.key);const spread=stack.length>1;const dx=spread?(index%2===0?-7:7):0;const dy=spread?(Math.floor(index/2)*12+(index%2===0?-7:7)):0;return <button type="button" key={u.key} className={'combat-live-marker '+u.type+(u.visible?'':' is-hidden')} title={u.label+(u.name?' — '+u.name:'')+(u.visible?'':' (hidden from players)')} style={{left:10+u.x*cellSize+5+dx,top:10+u.y*cellSize+5+dy,zIndex:spread?10+index:undefined}} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId)}} onPointerUp={e=>{const scroll=e.currentTarget.parentElement!.parentElement;const board=scroll?.getBoundingClientRect();if(!board)return;const x=Math.floor((e.clientX-board.left+scroll!.scrollLeft-10)/cellSize),y=Math.floor((e.clientY-board.top+scroll!.scrollTop-10)/cellSize);if(x>=0&&y>=0&&x<map.width&&y<map.height)u.type!=='objective'&&onMove(u.key,x,y)}}>{u.label}</button>})}
  {gates.map((g,i)=>{const horizontal=g.side==='top'||g.side==='bottom';return <div key={i} className={'combat-map-gate '+g.side} title={'Gate · '+g.length+' cell edges'} style={horizontal?{left:10+g.start*cellSize,width:g.length*cellSize-2,[g.side]:0}:{top:10+g.start*cellSize,height:g.length*cellSize-2,[g.side]:0}}/>})}
 </div></div>;
}
export default function CombatMaps({campaignId,mode,campaignName}:{campaignId:string;mode:'editor'|'combat';campaignName?:string}){
 const [maps,setMaps]=useState<SavedMap[]>([]);
 const [selected,setSelected]=useState('');
 const [name,setName]=useState('');
 const [loadedEditorId,setLoadedEditorId]=useState('');
 const [editorDirty,setEditorDirty]=useState(false);
 const [editorReady,setEditorReady]=useState(false);
 const [editorHelpOpen,setEditorHelpOpen]=useState(false);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [legendOpen,setLegendOpen]=useState(false);
  const [helpOpen,setHelpOpen]=useState(false);
  const [combatantsHelpOpen,setCombatantsHelpOpen]=useState(false);
  const [visibilityMode,setVisibilityMode]=useState<'full'|'dark'|'light'>('light');
  const [visibilityRadius,setVisibilityRadius]=useState(3);
  const [revealMode,setRevealMode]=useState<'automatic'|'manual'>('automatic');
 const [characters,setCharacters]=useState<CampaignCharacter[]>([]);
 const [live,setLive]=useState<LiveState|null>(null);
 const liveRef=useRef<LiveState|null>(null);
 const persistQueue=useRef(Promise.resolve());
 const [draftUnits,setDraftUnits]=useState<LiveUnit[]|null>(null);
 const draftRef=useRef<LiveUnit[]|null>(null);
 const [draftDirty,setDraftDirty]=useState(false);
 const dirtyRef=useRef(false);
 const pendingSaves=useRef(0);
 const refreshVersion=useRef(0);
 const lastMapId=useRef<string|null>(null);
 useEffect(()=>{liveRef.current=live},[live]);
 function clearDraft(){draftRef.current=null;dirtyRef.current=false;setDraftUnits(null);setDraftDirty(false)}
 function editCombatant(key:string,patch:Partial<LiveUnit>){
   const base=draftRef.current||liveRef.current?.units;
   if(!base)return;
   const next=base.map(u=>u.key===key?{...u,...patch}:u);
   draftRef.current=next;dirtyRef.current=true;setDraftUnits(next);setDraftDirty(true);
 }
 function applyCombatants(){
   const state=liveRef.current;
   if(!state||!draftRef.current||!dirtyRef.current)return;
   const edits=draftRef.current;
   const units=state.units.map(u=>{
     const draft=edits.find(d=>d.key===u.key&&d.type===u.type);
     if(!draft)return u;
     return u.type==='player'?{...u,characterId:draft.characterId,name:draft.name,manualReveal:draft.manualReveal}:{...u,name:draft.name,manualReveal:draft.manualReveal};
   });
   clearDraft();
   persist({...state,units});
 }
 const refreshLive=useCallback(async()=>{const request=++refreshVersion.current;const {data,error}=await supabase.from('combat_map_sessions').select('map_id,broadcasting,units,visibility_mode,visibility_radius,reveal_mode').eq('campaign_id',campaignId).maybeSingle();if(error){setMessage('Unable to load live combat: '+error.message);return}if(data){if(request!==refreshVersion.current||pendingSaves.current>0)return;const state={mapId:data.map_id,broadcasting:data.broadcasting,units:data.units as LiveUnit[],visibilityMode:data.visibility_mode==='dark'?'dark' as const:data.visibility_mode==='light'?'light' as const:'full' as const,visibilityRadius:data.visibility_radius||3,revealMode:data.reveal_mode==='manual'?'manual' as const:'automatic' as const};if(lastMapId.current!==state.mapId){lastMapId.current=state.mapId;clearDraft()}setLive(state);if(mode==='combat')setSelected(state.mapId);setVisibilityMode(state.visibilityMode);setVisibilityRadius(state.visibilityRadius);setRevealMode(state.revealMode)}},[campaignId,mode]);
 useEffect(()=>{void refreshLive();const channel=supabase.channel('combat-map-'+campaignId+'-'+crypto.randomUUID()).on('postgres_changes',{event:'*',schema:'public',table:'combat_map_sessions',filter:'campaign_id=eq.'+campaignId},()=>{void refreshLive()}).subscribe();return()=>{void supabase.removeChannel(channel)}},[campaignId,refreshLive]);
 useEffect(()=>{void supabase.from('characters').select('id,name').eq('campaign_id',campaignId).order('name').then(({data,error})=>{if(error)setMessage(error.message);else setCharacters(data||[])})},[campaignId]);
 function persist(state:LiveState){
   liveRef.current=state;setLive(state);pendingSaves.current++;
   persistQueue.current=persistQueue.current.then(async()=>{
     const {error}=await supabase.from('combat_map_sessions').upsert({campaign_id:campaignId,map_id:state.mapId,broadcasting:state.broadcasting,units:state.units,visibility_mode:state.visibilityMode,visibility_radius:state.visibilityRadius,reveal_mode:state.revealMode},{onConflict:'campaign_id'});
     if(error)throw error;
   }).catch(e=>{
     const detail=e&&typeof e==='object'?' '+[e.code,e.message,e.details].filter(Boolean).join(' — '):String(e);
     setMessage('Unable to save live session: '+detail);
   }).finally(()=>{pendingSaves.current--;});
 }
 function modifyUnit(key:string,patch:Partial<LiveUnit>){const state=liveRef.current;if(!state)return;persist({...state,units:state.units.map(u=>u.key===key?{...u,...(u.type==='objective'?Object.fromEntries(Object.entries(patch).filter(([k])=>k!=='x'&&k!=='y')):patch)}:u)})}
 function beginSession(map:SavedMap){if(!validMap(map.layout))return;clearDraft();const existing=liveRef.current;const initial=unitsForMap(map.layout).map(u=>({...u,visible:u.type==='player',manualReveal:{}}));const units=existing?.mapId===map.id?initial.map(u=>({...u,...existing.units.find(v=>v.key===u.key&&v.type===u.type)})):initial;persist({mapId:map.id,broadcasting:false,units,visibilityMode,visibilityRadius,revealMode});setMessage('Live map ready. Assign characters before broadcasting.')}
 function toggleBroadcast(){const state=liveRef.current;if(!state)return;if(dirtyRef.current){setMessage('Apply pending Combatants changes before changing the broadcast.');return;}if(!state.broadcasting&&state.units.some(u=>u.type==='player'&&!u.characterId)){setMessage('Assign a campaign character to every player marker before broadcasting.');return}persist({...state,broadcasting:!state.broadcasting,visibilityMode,visibilityRadius,revealMode});setMessage(state.broadcasting?'Broadcast stopped.':'Map broadcast enabled.')}
 function resetPositions(map:SavedMap){const state=liveRef.current;if(!state||state.mapId!==map.id)return;const initial=new Map(unitsForMap(map.layout).map(u=>[u.key,u]));persist({...state,units:state.units.map(u=>({...u,x:initial.get(u.key)?.x??u.x,y:initial.get(u.key)?.y??u.y}))});setMessage('Marker positions reset.')}

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
   if(event.data.action==='changed'&&mode==='editor')setEditorDirty(true);
   if(event.data.action==='export'&&pending.current){const resolve=pending.current;pending.current=null;resolve(event.data.layout);}
  };
  window.addEventListener('message',receive);
  return ()=>window.removeEventListener('message',receive);
 },[mode]);
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
   const validationError=mapValidationError(layout);if(validationError)throw new Error(validationError);
   if(!validMap(layout))throw new Error('Map validation failed.');
   const original=maps.find(m=>m.id===loadedEditorId);
   const sameName=!!original&&original.name===trimmed;
   const existing=maps.find(m=>m.name.toLocaleLowerCase()===trimmed.toLocaleLowerCase()&&m.id!==loadedEditorId);
   if(existing){setMessage('A map with this name already exists. Choose another name to avoid overwriting it.');return;}
   const payload={campaign_id:campaignId,name:trimmed,width:layout.width,height:layout.height,layout};
   const query=sameName?supabase.from('combat_maps').update(payload).eq('id',loadedEditorId).eq('campaign_id',campaignId):supabase.from('combat_maps').insert(payload);
   const {data,error}=await query.select('id').single();
   if(error)throw error;
   setLoadedEditorId(data.id);setSelected(data.id);setEditorDirty(false);await load();setMessage(sameName?'Map saved.':'New map saved.');
  }catch(e){setMessage(e instanceof Error?e.message:'Unable to save map.');}
  finally{setBusy(false);}
 }
 function confirmDiscard(){return !editorDirty||window.confirm('Discard unsaved map changes?');}
 function newEditorMap(){
  if(!confirmDiscard())return;
  setLoadedEditorId('');setSelected('');setName('');setEditorDirty(false);
  frame.current?.contentWindow?.postMessage({source:'cprpg-gm',action:'reset'},window.location.origin);
  setMessage('');
 }
 function loadEditorMap(){
  const map=maps.find(m=>m.id===selected);
  if(!map||!confirmDiscard())return;
  setLoadedEditorId(map.id);setName(map.name);setEditorDirty(false);
  frame.current?.contentWindow?.postMessage({source:'cprpg-gm',action:'import',layout:map.layout},window.location.origin);
  setMessage('');
 }
 function openMap(id:string){
  setSelected(id);
  if(mode==='combat')return;
 }
 const current=maps.find(m=>m.id===selected);
 return <section className="combat-maps-panel">{mode==='combat'&&<header className="tactical-gm-brand"><div className="tactical-gm-brand-identity"><img src="/tactical-feed-icon.svg" alt="" /><div><strong>TACTICAL//FEED</strong><small>A GHOST//LINK SYSTEMS DIVISION</small></div></div><div className="tactical-gm-network">● NETWORK TERMINAL <small>{campaignName}</small></div></header>}
  {mode==='editor'?<div className="combat-editor-toolbar-shell"><div className="combat-maps-toolbar">
<div className="combat-editor-field"><span>NEW MAP</span><button type="button" aria-label="New map" title="New map" disabled={!editorReady||busy} onClick={newEditorMap}><FilePlus2 size={19}/></button></div>
<label className="combat-editor-field combat-editor-picker"><span>SAVED MAPS</span><select aria-label="Saved maps" value={selected} onChange={e=>openMap(e.target.value)}><option value="">Select a map</option>{maps.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
<div className="combat-editor-field"><span>LOAD</span><button type="button" aria-label="Load selected map" title="Load selected map" disabled={!editorReady||!selected||busy} onClick={loadEditorMap}><FolderOpen size={19}/></button></div>
<label className="combat-editor-field combat-editor-name"><span>MAP NAME</span><input aria-label="Map name" value={name} maxLength={100} onChange={e=>{setName(e.target.value);setEditorDirty(true)}} placeholder="Enter map name"/></label>
<div className="combat-editor-field"><span>SAVE</span><button type="button" aria-label="Save map" title="Save / Save as" disabled={!editorReady||busy||!name.trim()} onClick={()=>void save()}><Save size={19}/></button></div>
<div className="combat-editor-field combat-editor-help"><span>HELP</span><button type="button" aria-label="Map editor instructions" title="Map editor instructions" aria-expanded={editorHelpOpen} onClick={()=>setEditorHelpOpen(v=>!v)}><CircleHelp size={19}/></button>{editorHelpOpen&&<div className="combat-editor-help-popup"><div className="combat-legend-heading"><strong>Map editor instructions</strong><button type="button" aria-label="Close instructions" onClick={()=>setEditorHelpOpen(false)}>×</button></div><p>New creates a blank map. Selecting a saved map does not load it; click the folder icon to load. Unsaved changes require confirmation before New or Load. Save updates the loaded map when its name is unchanged; changing the name creates a new copy (Save As). Names already used by other maps cannot be overwritten.</p></div>}</div>
</div></div>:<div className="tactical-command-bar">
<div className="tactical-command-field tactical-map-picker"><span>ACTIVE MAP</span><div className="tactical-map-picker-row"><select aria-label="Saved maps" value={selected} onChange={e=>openMap(e.target.value)}><option value="">Select map</option>{maps.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select><button type="button" className="tactical-load-button" disabled={!current||!validMap(current.layout)} title="Load selected map into the tactical session" onClick={()=>{if(current)beginSession(current)}}><FolderOpen size={16}/> Load</button></div></div>
<div className="tactical-command-field"><span>VISIBILITY</span><div className="tactical-segmented"><button type="button" aria-label="Dark map" title="Dark — limited radius" aria-pressed={visibilityMode==='dark'} className={visibilityMode==='dark'?'active':''} onClick={()=>{setVisibilityMode('dark');const state=liveRef.current;if(state)persist({...state,visibilityMode:'dark'})}}><Moon size={19}/></button><button type="button" aria-label="Light map" title="Light — visible areas respect walls" aria-pressed={visibilityMode==='light'} className={visibilityMode==='light'?'active':''} onClick={()=>{setVisibilityMode('light');const state=liveRef.current;if(state)persist({...state,visibilityMode:'light'})}}><Sun size={19}/></button><button type="button" aria-label="Reveal entire map" title="Full — reveal all map tiles" aria-pressed={visibilityMode==='full'} className={visibilityMode==='full'?'active':''} onClick={()=>{setVisibilityMode('full');const state=liveRef.current;if(state)persist({...state,visibilityMode:'full'})}}><ScanEye size={19}/></button></div></div>

<label className="tactical-command-field tactical-radius-field"><span>RADIUS</span><select value={visibilityRadius} onChange={e=>{const next=Number(e.target.value);setVisibilityRadius(next);const state=liveRef.current;if(state)persist({...state,visibilityRadius:next})}}>{Array.from({length:8},(_,i)=><option key={i+1} value={i+1}>{i+1} cells</option>)}</select></label>
<label className="tactical-command-field"><span>ENEMY REVEAL</span><select aria-label="Enemy reveal mode" value={revealMode} onChange={e=>{const next=e.target.value as 'automatic'|'manual';setRevealMode(next);const state=liveRef.current;if(state)persist({...state,revealMode:next})}}><option value="automatic">Automatic</option><option value="manual">Manual</option></select></label>
<div className="tactical-command-field tactical-position-field"><span>POSITION</span><button type="button" aria-label="Reset positions" title="Reset positions" disabled={!live||live.mapId!==selected} onClick={()=>{if(current)resetPositions(current)}}><RefreshCw size={19}/></button></div>
<div className="tactical-command-field tactical-broadcast-field"><span>BROADCAST</span><button type="button" className={live?.broadcasting?'broadcast-stop':'broadcast-start'} disabled={!live||live.mapId!==selected} onClick={toggleBroadcast}><RadioTower size={16}/>{live?.broadcasting?'Stop broadcast':'Start broadcast'}</button></div>
<div className="tactical-command-field tactical-status-field"><span>STATUS</span><div className={'tactical-fixed-status '+(live?.broadcasting?'is-live':'is-offline')}>{live?.broadcasting?<Wifi size={18}/>:<WifiOff size={18}/>}<span>{live?.broadcasting?'LIVE':'OFFLINE'}</span></div></div>
</div>}
{message&&!(mode==='combat'&&['Broadcast stopped.','Map broadcast enabled.','Live map ready. Assign characters before broadcasting.'].includes(message))&&<p role="status" className="combat-maps-message">{message}</p>}
{mode==='editor'?<><iframe ref={frame} title="Tactical map editor" src="/map-editor.html?embedded=1" className="combat-map-editor-frame" onLoad={()=>{frame.current?.contentWindow?.postMessage({source:'cprpg-gm',action:'reset'},window.location.origin);setEditorReady(true)}}/></>:
   current&&validMap(current.layout)?<><div className="combat-map-heading"><h3>{current.name}</h3><div className="combat-legend-anchor"><button type="button" className="combat-help-toggle" aria-label="Tactical feed instructions" title="Instructions" aria-expanded={helpOpen} onClick={()=>{setHelpOpen(v=>!v);setCombatantsHelpOpen(false);setLegendOpen(false)}}><CircleHelp size={18}/></button>{helpOpen&&<div className="combat-help-popup" role="region" aria-label="Tactical feed instructions"><div className="combat-legend-heading"><strong>Tactical//Feed instructions</strong><button type="button" aria-label="Close instructions" onClick={()=>setHelpOpen(false)}>×</button></div><p>Drag markers on the map to move combatants. Assign a character to each player marker before broadcasting. Use the eye icons to show or hide enemies, targets, and objectives from players. Targets move like enemies; objectives stay fixed. Load the map, select visibility settings, then start broadcasting. Dark Map limits the area players can see around their marker.</p></div>}<button type="button" className="combat-legend-toggle" aria-expanded={legendOpen} onClick={()=>{setLegendOpen(v=>!v);setHelpOpen(false);setCombatantsHelpOpen(false)}}>▤ Legend</button>{legendOpen&&<div className="combat-legend-popup"><div className="combat-legend-heading"><strong>Map legend</strong><button type="button" aria-label="Close legend" onClick={()=>setLegendOpen(false)}>×</button></div><div className="combat-legend-section">TERRAIN</div><div className="combat-legend-items">{[{type:'wall',symbol:'■',name:'Wall',desc:'Blocks movement & shots'},{type:'cover',symbol:'▰',name:'Cover',desc:'Jumpable · Defense bonus'},{type:'hole',symbol:'◌',name:'Hole',desc:'Jumpable · No standing'}].map(item=><div key={item.type}><i className={'combat-legend-icon '+item.type}>{item.symbol}</i><span><strong>{item.name}</strong><small>{item.desc}</small></span></div>)}</div><div className="combat-legend-section">MARKERS</div><div className="combat-legend-items">{[{type:'player',symbol:'P1',name:'Player',desc:'Player position'},{type:'enemy',symbol:'E1',name:'Enemy',desc:'Enemy position'},{type:'objective',symbol:'O1',name:'Objective',desc:'Item or location'},{type:'target',symbol:'T1',name:'Target',desc:'Person of interest'},{type:'gate',symbol:'━',name:'Gate',desc:'Entrance / exit'}].map(item=><div key={item.type}><i className={'combat-legend-icon '+item.type}>{item.symbol}</i><span><strong>{item.name}</strong><small>{item.desc}</small></span></div>)}</div></div>}</div></div>{live?.mapId===current.id?<div className="tactical-workspace"><MapGrid map={current.layout} units={live.units} onMove={(key,x,y)=>modifyUnit(key,{x,y})}/><div className="combat-map-roster"><div className="combat-roster-heading"><h3>Combatants</h3><button type="button" className="combat-help-toggle" aria-label="Manual reveal instructions" title="Manual reveal instructions" aria-expanded={combatantsHelpOpen} onClick={()=>{setCombatantsHelpOpen(v=>!v);setHelpOpen(false);setLegendOpen(false)}}><CircleHelp size={17}/></button>{combatantsHelpOpen&&<div className="combat-roster-help" role="region">Choose which scanner reveals each marker. Sonic cycles: hidden → 1 (direction only) → 2 (full position) → hidden. Combatants changes are sent only when you click Apply.</div>}</div><div className="combat-reveal-scroll" role="region" aria-label="Visibility matrix" tabIndex={0}><table className="combat-reveal-matrix"><thead><tr><th scope="col" aria-label="Character or enemy"></th>{([{key:'tactical',name:'Normal',Icon:Eye},{key:'night',name:'Night',Icon:Moon},{key:'thermal',name:'Thermal',Icon:Flame},{key:'acoustic',name:'Sonic',Icon:AudioLines},{key:'network',name:'Network',Icon:Network}] as const).map(({key,name,Icon})=><th scope="col" key={key} title={name}><Icon size={19}/><span>{name}</span></th>)}</tr></thead><tbody>{(draftUnits||live.units).map(u=><tr key={u.key}><th scope="row"><span className={'combat-map-unit-tag '+u.type}>{u.label}</span>{u.type==='player'?<select aria-label={u.label+' character'} value={u.characterId||''} disabled={live.broadcasting} onChange={e=>editCombatant(u.key,{characterId:e.target.value||null,name:characters.find(c=>c.id===e.target.value)?.name||''})}><option value="">Unassigned</option>{characters.filter(c=>c.id===u.characterId||!(draftUnits||live.units).some(other=>other.key!==u.key&&other.characterId===c.id)).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>:<input type="text" maxLength={100} aria-label={u.label+' name'} placeholder={u.type==='enemy'?'Enemy name':u.type==='target'?'Target name':'Objective name'} value={u.name||''} onChange={e=>editCombatant(u.key,{name:e.target.value})}/>}</th>{(['tactical','night','thermal','acoustic','network'] as const).map(key=>{const state=u.manualReveal?.[key]||'hidden';return <td key={key}><button type="button" disabled={live.revealMode!=='manual'} className={'combat-reveal-check '+(state!=='hidden'?'is-checked':'')} aria-label={u.label+' '+key+' '+state} aria-pressed={state!=='hidden'} title={key==='acoustic'?'Sonic: hidden → direction → full → hidden':state==='hidden'?'Hidden — click to reveal':'Revealed — click to hide'} onClick={()=>editCombatant(u.key,{manualReveal:{...u.manualReveal,[key]:key==='acoustic'?(state==='hidden'?'direction':state==='direction'?'revealed':'hidden'):(state==='hidden'?'revealed':'hidden')}})}>{key==='acoustic'?(state==='hidden'?null:state==='direction'?'1':'2'):(state==='revealed'?<Check size={19}/>:null)}</button></td>})}</tr>)}</tbody></table></div><div className="combat-apply-footer"><button type="button" className="combat-apply-button" disabled={!draftDirty} title="Apply Combatants changes" onClick={applyCombatants}><Check size={17}/> Apply</button></div></></div></div>:<p className="combat-maps-hint">Load this map to configure character assignments, marker visibility and GM movement.</p>}</>:<p className="combat-maps-hint">Choose a saved map to view its grid. Combat actions are not enabled yet.</p>}
 </section>;
}
