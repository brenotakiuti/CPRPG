import { useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { Landmark, Package, Settings, Slice, ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from 'lucide-react';
import './GMControlDock.css';

export type UtilityId = 'bank' | 'ripperdoc' | 'inventory' | 'overview';
const tools = [
  { id: 'bank', title: 'Bank', Icon: Landmark },
  { id: 'ripperdoc', title: 'Ripperdoc', Icon: Slice },
  { id: 'inventory', title: 'Inventory', Icon: Package },
  { id: 'overview', title: 'Campaign Settings', Icon: Settings },
] as const;

export function GMControlDock({ open, onOpen }: { open: UtilityId[]; onOpen: (id: UtilityId) => void }) {
  const [collapsed, setCollapsed] = useState(true);
  return <aside className={`gm-control-dock right ${collapsed ? 'collapsed' : ''}`} aria-label="GM utility control panel">
    <button className="gm-control-dock-retract" type="button" title={collapsed ? 'Expand controls' : 'Retract controls'} aria-label={collapsed ? 'Expand controls' : 'Retract controls'} onClick={() => setCollapsed(v => !v)}>{collapsed ? <ChevronLeft size={18}/> : <ChevronRight size={18}/>}</button>
    {!collapsed && <div className="gm-control-dock-tools">{tools.map(({ id, title, Icon }) => <button key={id} type="button" title={title} aria-label={title} className={open.includes(id) ? 'active' : ''} onClick={() => onOpen(id)}><Icon size={21}/></button>)}</div>}
  </aside>;
}

export function GMUtilityWindow({ title, children, onClose, active, onFocus, offset }: { title: string; children: ReactNode; onClose: () => void; active: boolean; onFocus: () => void; offset: number }) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [maximized, setMaximized] = useState(false);
  const ToolIcon = tools.find(tool => tool.title === title)?.Icon;
  const [size, setSize] = useState({ width: 860, height: 620 });
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (maximized || (event.target as HTMLElement).closest('button')) return;
    if (event.button !== 0) return;
    onFocus();
    const x = event.clientX, y = event.clientY, initial = position;
    const move = (e: PointerEvent) => setPosition({ x: Math.max(-window.innerWidth / 2 + 120, Math.min(window.innerWidth / 2 - 120, initial.x + e.clientX - x)), y: Math.max(-80, Math.min(window.innerHeight - 140, initial.y + e.clientY - y)) });
    const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
  };
  return <section className={`gm-utility-window ${active ? 'focused' : ''} ${maximized ? 'maximized' : ''}`} style={maximized ? {width:'100vw',height:'100dvh',maxWidth:'100vw',maxHeight:'100dvh',left:0,top:0,transform:'none',zIndex:active?1102:1100+offset} : { width: `min(${size.width}px, calc(100vw - 40px))`, height: `min(${size.height}px, calc(100vh - 70px))`, transform: `translate(calc(-50% + ${position.x + offset * 20}px), calc(-50% + ${position.y + offset * 20}px))`, zIndex: active ? 1102 : 1100 + offset }} onPointerDown={onFocus} aria-label={title}>
    <div className="gm-utility-window-titlebar" onPointerDown={startDrag}><strong className="gm-utility-title">{ToolIcon && <ToolIcon size={18} aria-hidden="true"/>}{title}</strong><div><button type="button" onClick={() => setMaximized(v => !v)} aria-label={maximized ? 'Restore window' : 'Maximize window'} title={maximized ? 'Restore window' : 'Maximize window'}>{maximized ? <Minimize2 size={17}/> : <Maximize2 size={17}/>}</button><button type="button" onClick={onClose} aria-label={`Close ${title}`}><X size={18}/></button></div></div>
    {<div className="gm-utility-window-body">{children}</div>}
    {!maximized && <div className="gm-utility-resize" onPointerDown={e => {
      e.preventDefault(); e.stopPropagation(); onFocus();
      const x=e.clientX,y=e.clientY, initial=size;
      const move=(ev:PointerEvent)=>setSize({width:Math.max(480,initial.width+ev.clientX-x),height:Math.max(320,initial.height+ev.clientY-y)});
      const end=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);};
      window.addEventListener('pointermove',move);window.addEventListener('pointerup',end,{once:true});
    }} aria-hidden="true"/>}
  </section>;
}
