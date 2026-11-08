import { useState } from 'react';
import { Cookie, Dices, SunMoon } from 'lucide-react';
import './SessionToolSettings.css';

export type Delivery = { audience: 'all' | 'character'; characterId: string | null };
export type ToolConfig =
  | { tool: 'dice'; sides: number; rolls: number; forced: number[] | null }
  | { tool: 'tarot'; forced: { index: number; reversed: boolean } | null; delivery: Delivery }
  | { tool: 'fortune'; forcedMessage: number | null; forcedNumbers: number[] | null; delivery: Delivery };

const cards = ['The Fool','The Magician','The High Priestess','The Empress','The Emperor','The Hierophant','The Lovers','The Chariot','Strength','The Hermit','Wheel of Fortune','Justice','The Hanged Man','Death','Temperance','The Devil','The Tower','The Star','The Moon','The Sun','Judgement','The World'];

export default function SessionToolSettings({ onOpen, characters }: { onOpen: (config: ToolConfig) => void; characters: { id: string; name: string }[] }) {
  const [audience, setAudience] = useState<'all' | 'character'>('all');
  const [characterId, setCharacterId] = useState('');
  const [tool, setTool] = useState<'dice'|'tarot'|'fortune'>('dice');
  const [rig, setRig] = useState(false);
  const [sides, setSides] = useState(20);
  const [rolls, setRolls] = useState(1);
  const [forcedDice, setForcedDice] = useState('20');
  const [card, setCard] = useState(0);
  const [reversed, setReversed] = useState(false);
  const [fortune, setFortune] = useState(0);
  const [luckyNumbers, setLuckyNumbers] = useState('7, 13, 21, 42, 77');
  const [error, setError] = useState('');
  const toolLabels = { dice: 'DICE', tarot: 'TAROT', fortune: 'FORTUNE COOKIE' } as const;
  function launch() {
    setError('');
    if (tool !== 'dice' && audience === 'character' && !characters.some(c => c.id === characterId)) { setError('Select a character.'); return; }
    const delivery: Delivery = { audience, characterId: audience === 'character' ? characterId : null };
    if (tool === 'dice') {
      if (!Number.isInteger(rolls) || rolls < 1 || rolls > 100) { setError('Choose 1–100 rolls.'); return; }
      let forced: number[] | null = null;
      if (rig) {
        forced = forcedDice.split(',').map(v => Number(v.trim()));
        if (forced.length !== rolls || forced.some(v => !Number.isInteger(v) || v < 1 || v > sides)) {
          setError('Enter exactly ' + rolls + ' results between 1 and ' + sides + ', separated by commas.');
          return;
        }
      }
      onOpen({ tool, sides, rolls, forced });
    } else if (tool === 'tarot') {
      onOpen({ tool, forced: rig ? { index: card, reversed } : null, delivery });
    } else {
      const numbers = luckyNumbers.split(',').map(v => Number(v.trim()));
      if (rig && (numbers.length !== 5 || numbers.some(v => !Number.isInteger(v) || v < 1 || v > 99) || new Set(numbers).size !== 5)) {
        setError('Enter five different lucky numbers from 1 to 99, separated by commas.'); return;
      }
      onOpen({ tool, forcedMessage: rig ? fortune : null, forcedNumbers: rig ? numbers : null, delivery });
    }
    setRig(false);
  }
  return <div className="session-tool-settings">
    <div className="session-tool-heading"><strong>SELECT TOOL</strong><span>● TOOL SELECTED</span></div>
    <div className="live-tools">
      <button type="button" aria-pressed={tool === 'dice'} className={'live-roll-open' + (tool === 'dice' ? ' selected' : '')} onClick={() => { setTool('dice'); setError(''); }}><Dices size={22}/>DICE ROLL</button>
      <button type="button" aria-pressed={tool === 'tarot'} className={'live-roll-open' + (tool === 'tarot' ? ' selected' : '')} onClick={() => { setTool('tarot'); setError(''); }}><SunMoon size={22}/>TAROT</button>
      <button type="button" aria-pressed={tool === 'fortune'} className={'live-roll-open' + (tool === 'fortune' ? ' selected' : '')} onClick={() => { setTool('fortune'); setError(''); }}><Cookie size={22}/>FORTUNE COOKIE</button>
    </div>
    <div className="session-selected-heading">{toolLabels[tool]} SETTINGS <span>READY</span></div>
    {tool === 'dice' && <div className="session-settings-row">
      <label>Die type<select value={sides} onChange={e => setSides(Number(e.target.value))}>{[6,10,20,100].map(n => <option key={n} value={n}>D{n}</option>)}</select></label>
      <label>Number of rolls<input type="number" min={1} max={100} value={rolls} onChange={e => setRolls(Number(e.target.value))}/></label>
    </div>}
    {tool !== "dice" && <div className="session-settings-row"><label>Send to<select value={audience} onChange={e => setAudience(e.target.value as "all" | "character")}><option value="all">All players</option><option value="character">One character</option></select></label>{audience === "character" && <label>Character<select value={characterId} onChange={e => setCharacterId(e.target.value)}><option value="">Select character...</option>{characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}</div>}
    <label className="session-rig-toggle"><input type="checkbox" checked={rig} onChange={e => setRig(e.target.checked)}/> Rig next outcome (single use)</label>
    {rig && <div className="session-rig-fields">
      {tool === 'dice' ? <label>Forced results, in order<input value={forcedDice} onChange={e => setForcedDice(e.target.value)} placeholder="4, 17, 20"/></label>
      : tool === 'tarot' ? <><label>Card<select value={card} onChange={e => setCard(Number(e.target.value))}>{cards.map((name,i) => <option key={i} value={i}>{name}</option>)}</select></label><label>Orientation<select value={reversed ? 'reversed' : 'upright'} onChange={e => setReversed(e.target.value === 'reversed')}><option value="upright">Upright</option><option value="reversed">Reversed</option></select></label></>
      : <label>Fortune message<select value={fortune} onChange={e => setFortune(Number(e.target.value))}>{['The door you fear opening has already been unlocked.','Not every warning comes from an enemy.','A familiar face will bring unfamiliar news.','The quietest voice may carry the greatest truth.','Someone remembers a promise you have forgotten.','What you lose today may save you tomorrow.','The shortest path is not always the safest.',"Tomorrow's danger wears yesterday's smile.",'Fortune favors those who know when to walk away.','The answer you seek is hiding in plain sight.'].map((f,i) => <option key={i} value={i}>{f}</option>)}</select></label>}
      {tool === 'fortune' && <label>Lucky numbers (five unique values, 1–99)<input value={luckyNumbers} onChange={e => setLuckyNumbers(e.target.value)} placeholder="7, 13, 21, 42, 77"/></label>}
    </div>}
    {error && <p className="session-settings-error" role="alert">{error}</p>}
    <div className="session-ready-label">Ready to execute: <strong>{toolLabels[tool]}</strong></div>
    <button type="button" className="session-open-button" onClick={launch}>EXECUTE {toolLabels[tool]}</button>
    <small>Tarot and Fortune Cookie are delivered to selected player HUDs.</small>
  </div>;
}
