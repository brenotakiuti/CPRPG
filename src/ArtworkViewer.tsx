import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';

type Props = { src: string; alt: string };

export function ArtworkZoomButton({ src, alt }: Props) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" aria-label={`Inspect ${alt} artwork`} title="Inspect artwork"
      onClick={() => setOpen(true)}
      style={{ position: 'absolute', right: 10, bottom: 10, zIndex: 2, display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 8, border: '1px solid #e8bd4a', background: '#10151de8', color: '#e8bd4a', cursor: 'pointer' }}>
      <Search size={21} aria-hidden="true" />
    </button>
    {open && <ArtworkViewer src={src} alt={alt} onClose={() => setOpen(false)} />}
  </>;
}

function ArtworkViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const viewport = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; scale: number } | null>(null);
  const transformRef = useRef(transform);
  transformRef.current = transform;

  function clamp(x: number, y: number, scale: number) {
    const box = viewport.current?.getBoundingClientRect();
    const img = image.current;
    if (!box || !img) return { x, y, scale };
    const fit = Math.min(box.width / (img.naturalWidth || box.width), box.height / (img.naturalHeight || box.height));
    const halfX = Math.max(0, ((img.naturalWidth || box.width) * fit * scale - box.width) / 2);
    const halfY = Math.max(0, ((img.naturalHeight || box.height) * fit * scale - box.height) / 2);
    return { x: Math.max(-halfX, Math.min(halfX, x)), y: Math.max(-halfY, Math.min(halfY, y)), scale };
  }
  function update(next: { x: number; y: number; scale: number }) {
    setTransform(clamp(next.x, next.y, next.scale));
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: transformRef.current.scale };
    }
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(e.pointerId);
    if (!previous) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture.current?.distance) {
        const scale = Math.max(1, Math.min(6, gesture.current.scale * distance / gesture.current.distance));
        update({ ...transformRef.current, scale });
      }
    } else if (pointers.current.size === 1) {
      const current = transformRef.current;
      update({ ...current, x: current.x + e.clientX - previous.x, y: current.y + e.clientY - previous.y });
    }
  }
  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    gesture.current = null;
  }
  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const current = transformRef.current;
    update({ ...current, scale: Math.max(1, Math.min(6, current.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15))) });
  }
  function onDoubleClick() {
    const current = transformRef.current;
    update(current.scale > 1 ? { x: 0, y: 0, scale: 1 } : { ...current, scale: 2.5 });
  }
  return <div role="dialog" aria-modal="true" aria-label={`Inspect ${alt} artwork`}
    style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(2,4,10,.96)', color: '#f0e5cc', padding: 'max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom))', boxSizing: 'border-box' }}>
    <div ref={viewport} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onLostPointerCapture={onPointerEnd}
      onWheel={onWheel} onDoubleClick={onDoubleClick}
      style={{ flex: 1, width: '100%', minHeight: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', cursor: transform.scale > 1 ? 'grab' : 'zoom-in', userSelect: 'none' }}>
      <img ref={image} src={src} alt={alt} draggable={false} onLoad={() => update(transformRef.current)}
        style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`, transformOrigin: 'center', pointerEvents: 'none' }} />
    </div>
    <div style={{ flexShrink: 0, padding: '14px 0 4px', display: 'flex', justifyContent: 'center', width: '100%' }}>
      <button type="button" onClick={onClose}
        style={{ border: '1px solid #c4a261', borderRadius: 7, background: '#d3aa5c', color: '#16120b', padding: '12px 38px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
        CLOSE
      </button>
    </div>
  </div>;
}
