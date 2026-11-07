import { useEffect } from 'react';
import { tarotCardNames } from './tarotData';
import './TarotCardViewer.css';
export default function TarotCardViewer({ index, reversed, onClose }: { index: number; reversed: boolean; onClose: () => void }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return <div className="tarot-viewer-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="tarot-viewer" role="dialog" aria-modal="true" aria-label="Tarot card artwork">
      <h2>{tarotCardNames[index]}</h2>
      <img src={`/tarot/tarot${index}.webp`} alt={tarotCardNames[index]} style={{ transform: reversed ? 'rotate(180deg)' : undefined }} />
      <p>{reversed ? 'Reversed' : 'Upright'}</p>
      <button type="button" onClick={onClose}>Close</button>
    </section>
  </div>;
}
