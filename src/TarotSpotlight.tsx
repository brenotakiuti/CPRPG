import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import './TarotSpotlight.css';

const CARD_NAMES = ["The Fool","The Magician","The High Priestess","The Empress","The Emperor","The Hierophant","The Lovers","The Chariot","Strength","The Hermit","Wheel of Fortune","Justice","The Hanged Man","Death","Temperance","The Devil","The Tower","The Star","The Moon","The Sun","Judgement","The World"];
type Draw = { index: number; reversed: boolean };
export default function TarotSpotlight({ onClose, forced }: { onClose: () => void; forced?: Draw | null }) {
  const [draw, setDraw] = useState<Draw>(() => forced ?? ({
    index: Math.floor(Math.random() * CARD_NAMES.length),
    reversed: Math.random() < 0.5,
  }));
  const [revealed, setRevealed] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clear() {
    if (timer.current) clearTimeout(timer.current);
    if (finishTimer.current) clearTimeout(finishTimer.current);
  }
  useEffect(() => () => clear(), []);
  function reveal() {
    if (revealed || flipping) return;
    setFlipping(true);
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
      <button className="tarot-close" type="button" aria-label="Close tarot spotlight" onClick={onClose} disabled={flipping}><X size={22}/></button>
      <div className="tarot-card-stage">
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
      <div className="tarot-result" aria-live="polite">
        {revealed && <><strong>{CARD_NAMES[draw.index]}</strong>
          <span className={draw.reversed ? 'tarot-negative' : 'tarot-positive'}>
            {draw.reversed ? <ArrowDown size={18} aria-label="Reversed"/> : <ArrowUp size={18} aria-label="Upright"/>}
            {draw.reversed ? 'Reversed' : 'Upright'}
          </span></>}
      </div>
      <div className="tarot-actions">
        {!revealed ? <button type="button" onClick={reveal} disabled={flipping}>Reveal</button>
          : <button type="button" onClick={redraw}>Redraw</button>}
        <button type="button" className="tarot-secondary" onClick={onClose} disabled={flipping}>Close</button>
      </div>
    </div>
  </div>;
}
