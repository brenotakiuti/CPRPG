import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';

/* Cyberware-only portal viewer: leaves the inventory artwork component unchanged. */
export function CyberwareArtworkZoom({ src, alt, compact = false }: { src: string; alt: string; compact?: boolean }) {
 const [open, setOpen] = useState(false);
 const viewerKey = useRef('cyberware-artwork:' + Math.random().toString(36).slice(2));
 const openRef = useRef(false);
 const closeViewer = () => { if (openRef.current) window.history.back(); };
 const openViewer = () => {
  setTransform({x:0,y:0,scale:1});
  window.history.pushState({ ...window.history.state, cyberwareViewerKey: viewerKey.current }, '');
  openRef.current = true;
  setOpen(true);
 };
 useEffect(() => {
  const onPop = (event: PopStateEvent) => {
   if (event.state?.cyberwareViewerKey !== viewerKey.current) { openRef.current = false; setOpen(false); }
  };
  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
 }, []);
 const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
 const viewport = useRef<HTMLDivElement>(null);
 const image = useRef<HTMLImageElement>(null);
 const pointers = useRef(new Map<number, { x: number; y: number }>());
 const gesture = useRef<{ distance: number; scale: number } | null>(null);
 const current = useRef(transform);
 current.current = transform;
 useEffect(() => {
  if (!open) return;
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeViewer(); };
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
  <button type="button" aria-label={`Inspect ${alt} artwork`} title="Inspect artwork" onClick={openViewer}
   style={{position:'absolute',right:compact?5:10,bottom:compact?5:10,zIndex:2,display:'flex',alignItems:'center',justifyContent:'center',padding:0,lineHeight:0,width:compact?24:40,height:compact?24:40,borderRadius:8,border:'1px solid #e8bd4a',background:'#10151de8',color:'#e8bd4a',cursor:'pointer'}}>
   <Search size={compact?14:21} aria-hidden="true"/>
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
    <button type="button" onClick={closeViewer} style={{border:'1px solid #c4a261',borderRadius:7,background:'#d3aa5c',color:'#16120b',padding:'12px 38px',fontWeight:700,fontSize:15,cursor:'pointer'}}>CLOSE</button>
   </div>
  </div>, document.body)}
 </>;
}

