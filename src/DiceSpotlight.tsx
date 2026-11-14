import { useEffect, useRef, useState } from 'react';
import { Dices } from 'lucide-react';
import { supabase } from './supabase';
import './LiveSession.css';
import './DiceSpotlight.css';

const SIDES = [2, 6, 8, 10, 12, 20, 100] as const;
const symbols = Array.from('アイウエオカキクケコサシスセソタナヌネノハヒフヘホマミムヤユヨラリルレロワヲン01');
const random = (max: number) => Math.floor(Math.random() * max) + 1;
const symbol = () => symbols[Math.floor(Math.random() * symbols.length)];
type Effect = 'normal' | 'jam' | 'blackout' | 'matrix';
type DieState = { face: string; style: string };
type Roll = { values: number[]; total: number; count: number; sides: number };
function generate(count: number, sides: number): Roll {
  const values = Array.from({ length: count }, () => {
    const buffer = new Uint32Array(1);
    const limit = Math.floor(4294967296 / sides) * sides;
    do { crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
    return buffer[0] % sides + (sides === 2 ? 0 : 1);
  });
  return { values, total: values.reduce((a,b) => a+b, 0), count, sides };
}
export default function DiceSpotlight({ characterId, campaignId, onClose }: {
  characterId: string; campaignId: string | null; onClose: () => void;
}) {
  const [sides, setSides] = useState(6);
  const [dice, setDice] = useState<DieState[]>([{ face: '?', style: 'idle' }]);
  const [sceneStyle, setSceneStyle] = useState('');
  const [phase, setPhase] = useState<'ready' | 'rolling' | 'revealed'>('ready');
  const [result, setResult] = useState<Roll | null>(null);
  const [error, setError] = useState('');
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const busy = useRef(false);
  const later = (callback: () => void, ms: number) => { timers.current.push(setTimeout(callback, ms)); };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => clearTimers(), []);

  function reset() {
    clearTimers();
    setDice([{ face: '?', style: 'idle' }]);
    setSceneStyle('');
    setResult(null);
    setPhase('ready');
  }
  function updateDie(index: number, patch: Partial<DieState>) {
    setDice(previous => previous.map((die, i) => i === index ? { ...die, ...patch } : die));
  }
  function animateDie(index: number, target: number, effect: Effect, done: () => void) {
    const frames = 6 + random(5);
    const jamStart = effect === 'jam' ? Math.floor(Math.random() * (frames + 1)) : -1;
    const matrixStart = effect === 'matrix' ? 2 + Math.floor(Math.random() * Math.max(1, frames - 3)) : -1;
    let i = 0, previous = 0;
    function finish() { updateDie(index, { face: String(target), style: 'final' }); done(); }
    function cycle() {
      if (i < frames) {
        if (effect === 'jam' && i >= jamStart) updateDie(index, { style: 'jammed' });
        if (effect === 'matrix' && i >= matrixStart) updateDie(index, { style: 'matrix' });
        let value: string;
        if (effect === 'matrix' && i >= matrixStart && Math.random() < .65) value = symbol();
        else { let n = random(sides); if (n === previous) n = n % sides + 1; previous = n; value = String(n); }
        updateDie(index, { face: value });
        later(cycle, 45 + Math.pow(i++, 1.65) * 15);
      } else if (effect === 'jam') {
        updateDie(index, { style: 'jammed' });
        let j = 0; const held = random(sides);
        function jam() {
          if (j < 3) {
            updateDie(index, { face: String(j % 2 ? held : random(sides)) });
            j++; later(jam, 110 + j * 45);
          } else {
            updateDie(index, { face: String(target), style: 'cyan' });
            later(() => { updateDie(index, { style: 'glitchback' }); later(finish, 340); }, 360);
          }
        }
        jam();
      } else if (effect === 'blackout') {
        updateDie(index, { face: String(target), style: 'idle' });
        setSceneStyle('blackout');
        later(() => { setSceneStyle('reboot'); later(finish, 800); }, 600 + random(5) * 160);
      } else if (effect === 'matrix') {
        updateDie(index, { face: symbol(), style: 'matrix' });
        later(() => {
          updateDie(index, { style: 'decrypt' }); let j = 0;
          function decrypt() {
            if (j < 11) {
              updateDie(index, { face: String(j > 7 && Math.random() < .35 ? target : symbol()) });
              later(decrypt, 35 + j * 13); j++;
            } else { updateDie(index, { face: String(target), style: 'matrix' }); later(finish, 220); }
          }
          decrypt();
        }, 380);
      } else finish();
    }
    cycle();
  }

  async function roll() {
    if (busy.current || !campaignId) return;
    busy.current = true;
    setError('');
    const next = generate(1, sides);
    // One database transaction saves the structured roll and GM-visible history.
    const { error: saveError } = await supabase.rpc('record_player_dice_roll', {
      p_character_id: characterId, p_campaign_id: campaignId,
      p_dice_sides: sides, p_results: next.values,
    });
    if (saveError) {
      setError('Roll could not be recorded: ' + saveError.message + '. Apply the dice migration in Supabase and retry.');
      busy.current = false;
      return;
    }
    clearTimers();
    setResult(null);
    setPhase('rolling');
    setSceneStyle('');
    setDice(next.values.map(() => ({ face: '?', style: 'rolling' })));
    const effect: Effect = (['normal','normal','normal','jam','blackout','matrix'] as const)[Math.floor(Math.random() * 6)];
    let finished = 0;
    next.values.forEach((value, index) => {
      if (sides === 2) {
        later(() => {
          updateDie(index, { face: String(value), style: 'coin-final' });
          setResult(next);
          setPhase('revealed');
          busy.current = false;
        }, 1700);
        return;
      }
      animateDie(index, value, effect, () => {
        finished++;
        if (finished === next.values.length) {
          setSceneStyle('');
          setResult(next);
          setPhase('revealed');
          busy.current = false;
        }
      });
    });
  }
  return <div className="dice-overlay" role="dialog" aria-modal="true" aria-label="Dice rolling spotlight">
    <section className="dice-scene">
      <header className="dice-heading">
        <div><h2><Dices size={22}/> DICE ROLL</h2></div>
      </header>
      <div className="dice-selector">
        <span>DICE TYPE</span>
        <div className="dice-types">{SIDES.map(n => <button key={n} type="button" className={sides === n ? 'selected' : ''} disabled={busy.current} onClick={() => { setSides(n); reset(); }}>d{n}</button>)}</div>
      </div>
      <div className="dice-arena live-dice-scene">
        <div className="dice-spec">D{sides}</div>
        <div className="dice-tray">{dice.map((die, index) => <button key={index} type="button" className={sides === 2 ? 'dice-coin ' + (phase === 'rolling' ? 'coin-flipping' : die.style) : 'live-die ' + die.style} disabled={busy.current} onClick={() => void roll()} aria-label={'Roll die ' + (index + 1)}>
          {sides === 2 ? <span className="dice-coin-rim" aria-hidden="true" /> : <svg viewBox="0 0 200 200" aria-hidden="true"><polygon className="live-die-outline" points="100,8 178,66 148,170 52,170 22,66"/></svg>}
          <span className="live-die-face" data-number={die.face}>{die.face}</span>
        </button>)}</div>
        <div className="live-dice-status">{phase === 'ready' ? 'TAP THE DIE TO ROLL' : phase === 'rolling' ? 'ROLLING…' : 'RESULT: ' + result?.values.join(' + ')}</div>
      </div>
      {error && <p className="dice-error" role="alert">{error}</p>}
      <div className="dice-actions"><button className="dice-roll-action" type="button" onClick={() => void roll()} disabled={busy.current || !campaignId}>{phase === 'rolling' ? 'ROLLING...' : result ? 'ROLL AGAIN' : 'ROLL'}</button><button className="dice-close-action" type="button" onClick={onClose} disabled={busy.current}>Close</button></div>
      {!campaignId && <p className="dice-error">Waiting for campaign connection.</p>}
      <p className="dice-note">Rolls appear in your history and the GM campaign log. Approval and sharing come later.</p>
      <div className="dice-sponsor"><span className="dice-sponsor-label">SPONSORED BY</span><img src="/ads/kiroshi-optics.webp" alt="Kiroshi Optics — See more than reality" /></div>
    </section>
    {(sceneStyle === 'blackout' || sceneStyle === 'reboot') && <div className={'dice-screen-blackout ' + sceneStyle} aria-hidden="true" />}
  </div>;
}
