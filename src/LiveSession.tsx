import { useEffect, useRef, useState } from 'react';
import './LiveSession.css';
import TarotSpotlight from './TarotSpotlight';
import FortuneCookieSpotlight from './FortuneCookieSpotlight';
import { Dices, SunMoon, Cookie } from 'lucide-react';

type Character = { id: string; name: string; balance: number };
type Effect = 'random' | 'normal' | 'jam' | 'blackout' | 'matrix';
type Phase = 'ready' | 'rolling' | 'revealed';
const NPCS = [
  { initials: 'R', name: 'Rogue', role: 'Fixer' },
  { initials: 'K', name: 'Kuroda', role: 'Security' },
  { initials: 'M', name: 'Mika', role: 'Contact' },
];
const symbols = Array.from('アイウエオカキクケコサシスセソタナヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン01');
const random = (max: number) => Math.floor(Math.random() * max) + 1;
const symbol = () => symbols[Math.floor(Math.random() * symbols.length)];

export default function LiveSession({ characters }: { characters: Character[] }) {
  const [npc, setNpc] = useState('Rogue');
  const [spotlight, setSpotlight] = useState(false);
  const [tarotOpen, setTarotOpen] = useState(false);
  const [fortuneOpen, setFortuneOpen] = useState(false);
  const [sides, setSides] = useState(20);
  const [mode, setMode] = useState<Effect>('random');
  const [phase, setPhase] = useState<Phase>('ready');
  const [face, setFace] = useState<string>('?');
  const [dieStyle, setDieStyle] = useState('idle');
  const [sceneStyle, setSceneStyle] = useState('');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rolling = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; timers.current.forEach(clearTimeout); };
  }, []);
  function clearTimers() { timers.current.forEach(clearTimeout); timers.current = []; }
  function later(fn: () => void, delay: number) {
    const id = setTimeout(() => { if (mounted.current) fn(); }, delay);
    timers.current.push(id);
  }
  function open() {
    clearTimers(); rolling.current = false;
    setPhase('ready'); setFace('?'); setDieStyle('idle'); setSceneStyle(''); setSpotlight(true);
  }
  function close() {
    if (rolling.current) return;
    clearTimers(); setSpotlight(false);
  }
  function finish(result: number) {
    setFace(String(result)); setSceneStyle(''); setDieStyle('final');
    rolling.current = false; setPhase('revealed');
  }
  function roll() {
    if (rolling.current) return;
    clearTimers(); rolling.current = true; setPhase('rolling');
    setDieStyle('rolling'); setSceneStyle('');
    const result = random(sides);
    const effect: Effect = mode === 'random'
      ? (['normal','normal','normal','jam','blackout','matrix'] as Effect[])[Math.floor(Math.random() * 6)]
      : mode;
    const count = 6 + random(5);
    const jamStart = effect === 'jam' ? Math.floor(Math.random() * (count + 1)) : -1;
    const matrixStart = effect === 'matrix' ? 2 + Math.floor(Math.random() * Math.max(1, count - 3)) : -1;
    let i = 0, previous = 0;
    function cycle() {
      if (i < count) {
        if (effect === 'jam' && i >= jamStart) setDieStyle('jammed');
        if (effect === 'matrix' && i >= matrixStart) setDieStyle('matrix');
        let value: string;
        if (effect === 'matrix' && i >= matrixStart && Math.random() < .65) value = symbol();
        else {
          let n = random(sides);
          if (n === previous) n = n % sides + 1;
          previous = n; value = String(n);
        }
        setFace(value);
        later(cycle, 45 + Math.pow(i++, 1.65) * 15);
      } else if (effect === 'jam') {
        setDieStyle('jammed');
        let j = 0; const held = random(sides);
        function jam() {
          if (j < 3) {
            setFace(String(j % 2 ? held : random(sides)));
            j++; later(jam, 110 + j * 45);
          } else {
            setFace(String(result)); setDieStyle('cyan');
            later(() => { setDieStyle('glitchback'); later(() => finish(result), 340); }, 360);
          }
        }
        jam();
      } else if (effect === 'blackout') {
        setFace(String(result)); setDieStyle('idle'); setSceneStyle('blackout');
        later(() => {
          setSceneStyle('reboot');
          later(() => finish(result), 800);
        }, 600 + random(5) * 160);
      } else if (effect === 'matrix') {
        setDieStyle('matrix'); setFace(symbol());
        later(() => {
          setDieStyle('decrypt'); let j = 0;
          function decrypt() {
            if (j < 11) {
              setFace(String(j > 7 && Math.random() < .35 ? result : symbol()));
              later(decrypt, 35 + j * 13); j++;
            } else {
              setFace(String(result)); setDieStyle('matrix');
              later(() => finish(result), 220);
            }
          }
          decrypt();
        }, 380);
      } else finish(result);
    }
    cycle();
  }
  return (
    <div className="live-session">
      <div className="live-session-grid">
        <div className="live-column">
          <section className="live-panel">
            <h2>PARTY MONITOR</h2>
            {characters.length ? characters.map(c => (
              <div className="live-character" key={c.id}>
                <strong>{c.name}</strong><span>{Number(c.balance).toLocaleString('en-US')} E$</span>
              </div>
            )) : <p className="live-empty">No characters in this campaign yet.</p>}
          </section>
          <section className="live-panel">
            <h2>ACTIVE MAP</h2>
            <div className="live-map-placeholder">MAP PLACEHOLDER</div>
          </section>
        </div>
        <div className="live-column">
          <section className="live-panel">
            <h2>NPC IDENTITY</h2>
            <div className="live-npcs">
              {NPCS.map(n => (
                <button type="button" key={n.name}
                  className={'live-npc' + (npc === n.name ? ' selected' : '')}
                  aria-pressed={npc === n.name} onClick={() => setNpc(n.name)}>
                  <span className="live-npc-initial">{n.initials}</span>
                  <strong>{n.name}</strong><small>{n.role}</small>
                </button>
              ))}
            </div>
          </section>
          <section className="live-panel">
            <h2>SESSION TOOLS</h2>
            <div className="live-tools">
              <button type="button" className="live-roll-open" onClick={open}><Dices size={22} aria-hidden="true" /> DICE ROLL</button>
              <button type="button" className="live-roll-open" onClick={() => setTarotOpen(true)}><SunMoon size={22} aria-hidden="true" /> TAROT</button>
              <button type="button" className="live-roll-open" onClick={() => setFortuneOpen(true)}><Cookie size={22} aria-hidden="true" /> FORTUNE COOKIE</button>
            </div>
          </section>
        </div>
      </div>
      {tarotOpen && <TarotSpotlight onClose={() => setTarotOpen(false)} />}
      {fortuneOpen && <FortuneCookieSpotlight onClose={() => setFortuneOpen(false)} />}
      {spotlight && <div className="live-spotlight" role="dialog" aria-modal="true" aria-label="Dice spotlight">
        <div className={'live-dice-scene ' + sceneStyle}>
          <div className="live-spotlight-title">DICE SPOTLIGHT</div>
          <div className="live-dice-controls">
            <select aria-label="Die type" value={sides} disabled={rolling.current}
              onChange={e => setSides(Number(e.target.value))}>
              {[6,10,20,100].map(n => <option value={n} key={n}>D{n}</option>)}
            </select>
            <select aria-label="Animation preview" value={mode} disabled={rolling.current}
              onChange={e => setMode(e.target.value as Effect)}>
              <option value="random">Random effects</option>
              <option value="normal">Normal Roll</option>
              <option value="jam">Signal Jam</option>
              <option value="blackout">System Blackout</option>
              <option value="matrix">Matrix Decode</option>
            </select>
          </div>
          <button type="button" className={'live-die ' + dieStyle}
            onClick={roll} disabled={phase === 'rolling'} aria-label="Roll die">
            <svg viewBox="0 0 200 200" aria-hidden="true">
              <polygon className="live-die-outline" points="100,8 178,66 148,170 52,170 22,66"/>
            </svg>
            <span className="live-die-face" data-number={face}>{face}</span>
          </button>
          <div className="live-dice-status">{phase === 'ready' ? 'CLICK THE DIE TO ROLL' : phase === 'rolling' ? 'ROLLING…' : 'RESULT: ' + face}</div>
          <small>{phase === 'revealed' ? 'CLICK THE DIE TO ROLL AGAIN' : 'Click the die to roll'}</small>
          <button type="button" className="live-spotlight-close" onClick={close} disabled={phase === 'rolling'}>Close spotlight</button>
        </div>
      </div>}
    </div>
  );
}
