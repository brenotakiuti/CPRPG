import { useEffect, useRef, useState } from 'react';
import { Dices, X, Minus, Plus } from 'lucide-react';
import { supabase } from './supabase';
import './DiceSpotlight.css';

const SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
type DiceResult = { values: number[]; total: number; sides: number; count: number };
const rollDice = (count: number, sides: number) => {
  const values = Array.from({ length: count }, () => {
    const random = new Uint32Array(1);
    const ceiling = Math.floor(4294967296 / sides) * sides;
    do { crypto.getRandomValues(random); } while (random[0] >= ceiling);
    return (random[0] % sides) + 1;
  });
  return { values, total: values.reduce((a, b) => a + b, 0), sides, count };
};

export default function DiceSpotlight({ characterId, characterName, campaignId, onClose }: {
  characterId: string; characterName: string; campaignId: string | null; onClose: () => void;
}) {
  const [sides, setSides] = useState<number>(6);
  const [count, setCount] = useState(1);
  const [result, setResult] = useState<DiceResult | null>(null);
  const [rolling, setRolling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rollIndex, setRollIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function roll() {
    if (busy.current || !campaignId) return;
    busy.current = true;
    setError('');
    const next = rollDice(count, sides);
    setResult(null);
    setRolling(true);
    setSaving(true);
    setRollIndex(previous => previous + 1);
    // Persist the outcome before displaying it; failures are never silently treated as recorded.
    const { error: saveError } = await supabase.from('dice_rolls').insert({
      campaign_id: campaignId, character_id: characterId,
      dice_count: count, dice_sides: sides, results: next.values, total: next.total,
    });
    setSaving(false);
    if (saveError) {
      setError('Roll not recorded: ' + saveError.message + '. Please retry.');
      setRolling(false);
      busy.current = false;
      return;
    }
    timer.current = setTimeout(() => {
      setResult(next);
      setRolling(false);
      busy.current = false;
    }, 1100);
  }

  return <div className="dice-overlay" role="dialog" aria-modal="true" aria-label="Dice rolling spotlight">
    <section className="dice-scene">
      <header className="dice-heading">
        <div><span className="dice-eyebrow">NIGHT CITY // RANDOMIZER</span><h2><Dices size={22}/> DICE ROLL</h2></div>
        <button type="button" onClick={onClose} disabled={rolling || saving} aria-label="Close dice spotlight"><X size={22}/></button>
      </header>
      <div className="dice-character">{characterName}</div>
      <div className="dice-selector">
        <span>DICE TYPE</span>
        <div className="dice-types">{SIDES.map(n => <button key={n} type="button" className={sides === n ? 'selected' : ''} disabled={rolling || saving} onClick={() => { setSides(n); setResult(null); }}>d{n}</button>)}</div>
        <span>QUANTITY</span>
        <div className="dice-quantity">
          <button type="button" aria-label="Remove one die" disabled={count <= 1 || rolling || saving} onClick={() => { setCount(n => Math.max(1, n - 1)); setResult(null); }}><Minus size={18}/></button>
          <strong>{count}</strong>
          <button type="button" aria-label="Add one die" disabled={count >= 20 || rolling || saving} onClick={() => { setCount(n => Math.min(20, n + 1)); setResult(null); }}><Plus size={18}/></button>
        </div>
      </div>
      <div className="dice-arena">
        <div className="dice-spec">{count}d{sides}</div>
        <div className="dice-tray" key={rollIndex}>
          {rolling ? Array.from({ length: count }, (_, i) => <div key={i} className="dice-face dice-tumbling" style={{ animationDelay: (i % 5) * 55 + 'ms' }}><Dices size={25}/></div>)
            : result ? result.values.map((value, i) => <div key={i} className="dice-face dice-landed" style={{ animationDelay: (i % 8) * 45 + 'ms' }}>{value}</div>)
            : <div className="dice-idle"><Dices size={54} strokeWidth={1.2}/><span>TAP ROLL TO BEGIN</span></div>}
        </div>
        {result && !rolling && <div className="dice-total">TOTAL <strong>{result.total}</strong></div>}
      </div>
      {error && <p className="dice-error" role="alert">{error}</p>}
      <button className="dice-roll-action" type="button" onClick={() => void roll()} disabled={rolling || saving || !campaignId}>
        {rolling || saving ? 'ROLLING...' : result ? 'ROLL AGAIN' : 'ROLL'}
      </button>
      {!campaignId && <p className="dice-error">Waiting for campaign connection.</p>}
      <p className="dice-note">Every roll is saved. GM approval and shared transmissions will be added later.</p>
    </section>
  </div>;
}
