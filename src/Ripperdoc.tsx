import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, CheckCircle2, ImageIcon, Search } from 'lucide-react';
import { supabase } from './supabase';
import { anatomicalPositions } from './anatomicalPositions';
import './Ripperdoc.css';

/* Identical cyberware full-screen viewer as the player interface. */
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

type Character = { id: string; name: string };
type Implant = { id: string; name: string; rarity: string; price: number; description: string | null; properties: { image?: string } | null };
type Procedure = { characterId: string; itemId: string | null; positionId: string; characterName: string; implantName: string; implantDescription: string; positionLabel: string; image: string | null };
export default function Ripperdoc({ characters }: { characters: Character[] }) {
  const [characterId, setCharacterId] = useState('');
  const [implantId, setImplantId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [implants, setImplants] = useState<Implant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [procedure, setProcedure] = useState<Procedure | null>(null);
  const [procedureStarted, setProcedureStarted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [procedureError, setProcedureError] = useState('');
  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      const { data, error: queryError } = await supabase.from('items')
        .select('id, name, rarity, price, description, properties').eq('category', 'Cyberware').order('name');
      if (!active) return;
      setImplants((data ?? []) as Implant[]);
      setError(queryError?.message ?? '');
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!characters.some(c => c.id === characterId)) setCharacterId('');
  }, [characters, characterId]);
  const chosenImplant = implants.find(i => i.id === implantId);
  const isCustom = implantId === 'custom';
  const implantName = isCustom ? customName.trim() : chosenImplant?.name ?? '';
  const implantDescription = isCustom ? customDescription.trim() : chosenImplant?.description ?? '';
  const chosenPosition = anatomicalPositions.find(p => p.id === positionId);
  const chosenCharacter = characters.find(c => c.id === characterId);
  const startProcedure = () => {
    if (!chosenCharacter || !implantName || !chosenPosition || (isCustom && !implantDescription)) return;
    setProcedure({ characterId, itemId: isCustom ? null : chosenImplant?.id ?? null, positionId, characterName: chosenCharacter.name, implantName, implantDescription, positionLabel: chosenPosition.label + ' (' + chosenPosition.id + ')', image: isCustom ? null : chosenImplant?.properties?.image ?? null });
    setProcedureStarted(false);
    setProcedureError('');
  };
  const initiateProcedure = async () => {
    if (!procedure || saving || procedureStarted) return;
    setSaving(true);
    setProcedureError('');
    try {
      const { error: insertError } = await supabase.from('character_cyberware').insert({
        character_id: procedure.characterId,
        item_id: procedure.itemId,
        name: procedure.implantName,
        description: procedure.implantDescription,
        position_id: procedure.positionId,
        image_url: procedure.image,
      });
      if (insertError) throw insertError;
      setProcedureStarted(true);
    } catch (cause) {
      setProcedureError(cause instanceof Error ? cause.message : 'Could not save the installation. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  return <section className="rd-page" aria-label="Ripperdoc">
    <div className="rd-heading"><Activity size={21}/><div><strong>RIPPERDOC // OPERATING ROOM</strong><p>Prepare a cyberware procedure. Install cyberware on a selected character.</p></div></div>
    <div className="rd-workspace">
      <div className="rd-scan-panel">
        <label className="rd-field">PATIENT
          <select value={characterId} onChange={e => { setCharacterId(e.target.value); setProcedure(null); }}>
            <option value="">Select character</option>
            {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="rd-diagram">
          <img src="/cyberware/cyberware-anatomical-scan.webp" alt="Full-body cybernetic anatomical scan"/>
          {anatomicalPositions.map(p => <button type="button" key={p.id}
            style={{ left: p.x + '%', top: p.y + '%' }}
            className={'rd-position' + (positionId === p.id ? ' selected' : '')}
            aria-label={p.label + ' (' + p.id + ')'} aria-pressed={positionId === p.id}
            title={p.label + ' (' + p.id + ')'}
            onClick={() => { setPositionId(p.id); setProcedure(null); }}><span>{p.id}</span></button>)}
        </div>
        <div className="rd-position-caption">{chosenPosition ? chosenPosition.id + ' // ' + chosenPosition.label : 'SELECT ANATOMICAL POSITION'}</div>
      </div>
      <div className="rd-catalog-panel">
        <strong>CYBERWARE CATALOG</strong>
        <div className="rd-items">
          <div className="rd-item-entry">
            <button type="button" className={'rd-item rd-custom-choice' + (isCustom ? ' selected' : '')}
              aria-pressed={isCustom} aria-expanded={isCustom}
              onClick={() => { setImplantId(isCustom ? '' : 'custom'); setProcedure(null); }}>
              <span><b>+ Custom Cyberware</b><small>Invent a new implant for this procedure</small></span>
            </button>
            {isCustom && <div className="rd-inline-detail rd-custom-fields">
              <label className="rd-field">CYBERWARE NAME
                <input type="text" maxLength={120} value={customName} placeholder="Enter implant name"
                  onChange={e => { setCustomName(e.target.value); setProcedure(null); }}/>
              </label>
              <label className="rd-field">DESCRIPTION
                <textarea rows={4} maxLength={2000} value={customDescription} placeholder="Describe the implant and its effects"
                  onChange={e => { setCustomDescription(e.target.value); setProcedure(null); }}/>
              </label>
            </div>}
          </div>
          {loading ? <p>Loading cyberware…</p> : error ? <p role="alert">{error}</p> : implants.length === 0 ? <p>No catalog cyberware found.</p> :
            implants.map(i => <div className="rd-item-entry" key={i.id}>
              <button type="button" className={'rd-item' + (implantId === i.id ? ' selected' : '')}
                aria-pressed={implantId === i.id} aria-expanded={implantId === i.id}
                onClick={() => { setImplantId(implantId === i.id ? '' : i.id); setProcedure(null); }}>
                <span><b>{i.name}</b><small>{i.rarity}</small></span>
                <strong>€${Number(i.price).toLocaleString('en-US')}</strong>
              </button>
              {implantId === i.id && <div className="rd-inline-detail">
                <div className="rd-implant-detail">{i.properties?.image && <div style={{ position: 'relative', width: '100%' }}><img className="rd-implant-image" src={i.properties.image} alt={i.name + ' artwork'}/><CyberwareArtworkZoom src={i.properties.image} alt={i.name}/></div>}<p className="rd-description">{i.description || 'No description available.'}</p></div>
              </div>}
            </div>)}
        </div>
        <div className="rd-next-action">
          <button type="button" disabled={!chosenCharacter || !implantName || !chosenPosition || (isCustom && !implantDescription)}
            onClick={startProcedure}>REVIEW PROCEDURE</button>
        </div>
      </div>
    </div>
    {procedure && <div className="rd-modal-backdrop" onMouseDown={e => { if (!saving && e.target === e.currentTarget) setProcedure(null); }}>
      <section className="rd-modal" role="dialog" aria-modal="true" aria-label="Procedure overview">
        <div className="rd-modal-header"><div><small>RIPPERDOC // PREOPERATIVE ASSESSMENT</small><h3>PROCEDURE OVERVIEW</h3></div>
        </div>
        <div className="rd-modal-body">
          <div className="rd-artwork" aria-label="Implant artwork">
            {procedure.image ? <div style={{ position: 'relative', width: '100%', height: '100%' }}><img src={procedure.image} alt={procedure.implantName + ' artwork'}/><CyberwareArtworkZoom src={procedure.image} alt={procedure.implantName}/></div> :
              <div className="rd-artwork-placeholder"><ImageIcon size={30}/><span>IMPLANT ARTWORK</span><small>NO IMAGE AVAILABLE</small></div>}
          </div>
          <div className="rd-modal-details">
            <div><small>PATIENT</small><strong>{procedure.characterName}</strong></div>
            <div><small>CYBERWARE</small><strong>{procedure.implantName}</strong></div>
            <div><small>INSTALLATION SITE</small><strong>{procedure.positionLabel}</strong></div>
            {procedure.implantDescription && <div><small>DESCRIPTION</small><p>{procedure.implantDescription}</p></div>}
          </div>
        </div>
        <div className="rd-modal-footer">
          {procedureStarted && <p role="status" className="rd-confirmation"><CheckCircle2 size={16}/> Cyberware installation saved successfully.</p>}
          {procedureError && <p role="alert" className="rd-procedure-error">{procedureError}</p>}
          <button type="button" className="rd-modal-cancel" disabled={saving} onClick={() => setProcedure(null)}>BACK</button>
          <button type="button" className="rd-modal-start" disabled={saving || procedureStarted}
            onClick={() => void initiateProcedure()}>{saving ? 'INSTALLING...' : procedureStarted ? 'PROCEDURE COMPLETED' : 'INITIATE PROCEDURE'}</button>
        </div>
      </section>
    </div>}
  </section>;
}
