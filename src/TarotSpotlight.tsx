import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import './TarotSpotlight.css';
import { tarotMessages } from './tarotData';

const CARD_NAMES = ["The Fool","The Magician","The High Priestess","The Empress","The Emperor","The Hierophant","The Lovers","The Chariot","Strength","The Hermit","Wheel of Fortune","Justice","The Hanged Man","Death","Temperance","The Devil","The Tower","The Star","The Moon","The Sun","Judgement","The World"];
type Draw = { index: number; reversed: boolean };
export default function TarotSpotlight({ onClose, forced, onReveal, playerMode = false, initiallyRevealed = false }: { onClose: () => void; forced?: Draw | null; onReveal?: (draw: Draw) => Promise<void>; playerMode?: boolean; initiallyRevealed?: boolean }) {
  const [intro] = useState(() => tarotMessages[Math.floor(Math.random() * tarotMessages.length)]);
  const [draw, setDraw] = useState<Draw>(() => forced ?? ({
    index: Math.floor(Math.random() * CARD_NAMES.length),
    reversed: Math.random() < 0.5,
  }));
  const [revealed, setRevealed] = useState(initiallyRevealed);
  const [flipping, setFlipping] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clear() {
    if (timer.current) clearTimeout(timer.current);
    if (finishTimer.current) clearTimeout(finishTimer.current);
  }
  useEffect(() => () => clear(), []);
  async function reveal() {
    if (revealed || flipping) return;
    setFlipping(true);
    if (onReveal) {
      try { await onReveal(draw); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save reveal'); setFlipping(false); return; }
    }
    finishTimer.current = setTimeout(() => { setFlipping(false); setRevealed(true); }, 900);
  }
  function redraw() {
    if (flipping) return;
    clear();
    setFlipping(false);
    setRevealed(false);
    setDraw({ index: Math.floor(Math.random() * CARD_NAMES.length), reversed: Math.random() < 0.5 });
  }
  return <div className="tarot-overlay" role="dialog" aria-modal="true" aria-label="Tarot spotlight">
    <div className="tarot-scene">
      <div className="live-spotlight-title">TAROT READING</div>
      <strong className="tarot-intro">{intro}</strong>
      <div className="tarot-card-stage" role="button" tabIndex={revealed || flipping ? -1 : 0} aria-label="Flip tarot card" onClick={reveal} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); reveal(); } }}>
        <div className={'tarot-card-surface' + (flipping || revealed ? ' tarot-flipped' : '')}>
          <div className="tarot-card-face tarot-card-back">
            <img src="/tarot/back.webp" alt="Tarot card back" draggable={false} />
          </div>
          <div className="tarot-card-face tarot-card-front">
            <img src={'/tarot/tarot' + draw.index + '.webp'}
              alt={CARD_NAMES[draw.index]}
              className={draw.reversed ? 'tarot-reversed' : ''}
              draggable={false} />
          </div>
        </div>
      </div>
      {!revealed && <span className="tarot-tap">TAP TO REVEAL</span>}
      <div className="tarot-result" aria-live="polite">
        {revealed && <><strong>{CARD_NAMES[draw.index]}</strong>
          <span className={draw.reversed ? 'tarot-negative' : 'tarot-positive'}>
            {draw.reversed ? <ArrowDown size={18} aria-label="Reversed"/> : <ArrowUp size={18} aria-label="Upright"/>}
            {draw.reversed ? 'Reversed' : 'Upright'}
          </span></>}
      </div>
      {error && <p role="alert" style={{ color: "#ff9999" }}>{error}</p>}
      <div className="tarot-actions">
        <button type="button" className="tarot-secondary" onClick={onClose} disabled={flipping || (playerMode && !revealed)}>Close</button>
        {revealed && !playerMode && <button type="button" onClick={redraw}>Redraw</button>}
      </div>
    </div>
  </div>;
}
