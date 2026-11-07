import { useState } from 'react';
import './FortuneCookieSpotlight.css';

export const fortunes = [
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

export default function FortuneCookieSpotlight({ onClose, messageIndex, luckyNumbers, fixedFortune, onReveal, playerMode = false, initiallyRevealed = false }: { onClose: () => void; messageIndex?: number | null; luckyNumbers?: number[] | null; fixedFortune?: Fortune; onReveal?: () => Promise<void>; playerMode?: boolean; initiallyRevealed?: boolean }) {
  const [fortune, setFortune] = useState<Fortune | null>(initiallyRevealed ? fixedFortune ?? null : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function crack() {
    if (busy || (playerMode && fortune)) return;
    setBusy(true);
    try { if (onReveal) await onReveal(); setFortune(fixedFortune ?? crackFortune(messageIndex, luckyNumbers)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save fortune'); }
    finally { setBusy(false); }
  }
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
        {error && <p role="alert" style={{ color: "#ff9999" }}>{error}</p>}
        <div className="fortune-actions">
          <button type="button" className="fortune-secondary" disabled={busy || (playerMode && !fortune)} onClick={onClose}>Close</button>
          {(!playerMode || !fortune) && <button type="button" disabled={busy} onClick={() => void crack()}>{busy ? "Opening..." : "Crack"}</button>}
        </div>
      </div>
    </div>
  );
}
