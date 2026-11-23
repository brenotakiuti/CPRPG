import { useState, type ReactNode } from 'react';
import { Landmark, Package, Settings, Slice, ChevronLeft, ChevronRight, PanelLeftClose, PanelRightClose, Minus, X } from 'lucide-react';
import './GMControlDock.css';

export type UtilityId = 'bank' | 'ripperdoc' | 'inventory' | 'overview';
const tools = [
  { id: 'bank', title: 'Bank', Icon: Landmark },
  { id: 'ripperdoc', title: 'Ripperdoc', Icon: Slice },
  { id: 'inventory', title: 'Inventory', Icon: Package },
  { id: 'overview', title: 'Campaign Settings', Icon: Settings },
] as const;

export function GMControlDock({ open, onOpen }: { open: UtilityId[]; onOpen: (id: UtilityId) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [side, setSide] = useState<'left' | 'right'>('right');
  return <aside className={`gm-control-dock ${side} ${collapsed ? 'collapsed' : ''}`} aria-label="GM utility control panel">
    <div className="gm-control-dock-head">
      <button type="button" title={collapsed ? 'Expand controls' : 'Retract controls'} aria-label={collapsed ? 'Expand controls' : 'Retract controls'} onClick={() => setCollapsed(v => !v)}>{collapsed ? (side === 'right' ? <ChevronLeft size={18}/> : <ChevronRight size={18}/>) : (side === 'right' ? <ChevronRight size={18}/> : <ChevronLeft size={18}/>)}</button>
      {!collapsed && <button type="button" title="Dock on opposite side" aria-label="Dock on opposite side" onClick={() => setSide(v => v === 'right' ? 'left' : 'right')}>{side === 'right' ? <PanelLeftClose size={18}/> : <PanelRightClose size={18}/>}</button>}
    </div>
    {!collapsed && <div className="gm-control-dock-tools">{tools.map(({ id, title, Icon }) => <button key={id} type="button" title={title} aria-label={title} className={open.includes(id) ? 'active' : ''} onClick={() => onOpen(id)}><Icon size={21}/><span>{title}</span></button>)}</div>}
  </aside>;
}

export function GMUtilityWindow({ title, children, onClose, active, onFocus, offset }: { title: string; children: ReactNode; onClose: () => void; active: boolean; onFocus: () => void; offset: number }) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [minimized, setMinimized] = useState(false);
  const [size, setSize] = useState({ width: 860, height: 620 });
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    if (event.button !== 0) return;
    onFocus();
    const x = event.clientX, y = event.clientY, initial = position;
    const move = (e: PointerEvent) => setPosition({ x: Math.max(-window.innerWidth / 2 + 120, Math.min(window.innerWidth / 2 - 120, initial.x + e.clientX - x)), y: Math.max(-80, Math.min(window.innerHeight - 140, initial.y + e.clientY - y)) });
    const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
  };
  return <section className={`gm-utility-window ${active ? 'focused' : ''} ${minimized ? 'minimized' : ''}`} style={{ width: `min(${size.width}px, calc(100vw - 40px))`, height: minimized ? 'auto' : `min(${size.height}px, calc(100vh - 70px))`, transform: `translate(calc(-50% + ${position.x + offset * 20}px), calc(-50% + ${position.y + offset * 20}px))`, zIndex: active ? 1102 : 1100 + offset }} onPointerDown={onFocus} aria-label={title}>
    <div className="gm-utility-window-titlebar" onPointerDown={startDrag}><strong>{title}</strong><div><button type="button" onClick={() => setMinimized(v => !v)} aria-label={minimized ? 'Restore window' : 'Minimize window'}><Minus size={17}/></button><button type="button" onClick={onClose} aria-label={`Close ${title}`}><X size={18}/></button></div></div>
    {!minimized && <div className="gm-utility-window-body">{children}</div>}
    {!minimized && <div className="gm-utility-resize" onPointerDown={e => {
      e.preventDefault(); e.stopPropagation(); onFocus();
      const x=e.clientX,y=e.clientY, initial=size;
      const move=(ev:PointerEvent)=>setSize({width:Math.max(480,initial.width+ev.clientX-x),height:Math.max(320,initial.height+ev.clientY-y)});
      const end=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);};
      window.addEventListener('pointermove',move);window.addEventListener('pointerup',end,{once:true});
    }} aria-hidden="true"/>}
  </section>;
}
