import { useState } from 'react';
import './FortuneCookieSpotlight.css';

const fortunes = [
  'The door you fear opening has already been unlocked.',
  'Not every warning comes from an enemy.',
  'A familiar face will bring unfamiliar news.',
  'The quietest voice may carry the greatest truth.',
  'Someone remembers a promise you have forgotten.',
  'What you lose today may save you tomorrow.',
  'The shortest path is not always the safest.',
  "Tomorrow's danger wears yesterday's smile.",
  'Fortune favors those who know when to walk away.',
  'The answer you seek is hiding in plain sight.',
];

type Fortune = { message: string; numbers: number[] };

function crackFortune(messageIndex?: number | null, luckyNumbers?: number[] | null): Fortune {
  const numbers = new Set<number>();
  while (numbers.size < 5) numbers.add(Math.floor(Math.random() * 99) + 1);
  return {
    message: fortunes[messageIndex ?? Math.floor(Math.random() * fortunes.length)],
    numbers: luckyNumbers ?? [...numbers].sort((a, b) => a - b),
  };
}

export default function FortuneCookieSpotlight({ onClose, messageIndex, luckyNumbers }: { onClose: () => void; messageIndex?: number | null; luckyNumbers?: number[] | null }) {
  const [fortune, setFortune] = useState<Fortune | null>(null);
  return (
    <div className="fortune-overlay" role="dialog" aria-modal="true" aria-label="Fortune Cookie spotlight">
      <div className="fortune-scene">
        <div className="fortune-title">FORTUNE COOKIE</div>
        <div className="fortune-result" aria-live="polite">
          {fortune ? (
            <>
              <p className="fortune-message">“{fortune.message}”</p>
              <div className="fortune-divider" />
              <div className="fortune-label">LUCKY NUMBERS</div>
              <div className="fortune-numbers">{fortune.numbers.join(' · ')}</div>
            </>
          ) : <p className="fortune-waiting">Your fortune awaits.</p>}
        </div>
        <div className="fortune-actions">
          <button type="button" className="fortune-secondary" onClick={onClose}>Close</button>
          <button type="button" onClick={() => setFortune(crackFortune(messageIndex, luckyNumbers))}>Crack</button>
        </div>
      </div>
    </div>
  );
}
