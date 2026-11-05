import { useEffect, useRef, useState } from 'react';
import { Heart, Minus, Plus } from 'lucide-react';
import { supabase } from './supabase';
import './LiveSession.css';
import TarotSpotlight from './TarotSpotlight';
import FortuneCookieSpotlight from './FortuneCookieConfigured';
import SessionToolSettings, { type ToolConfig } from './SessionToolSettings';

type Character = { id: string; name: string; balance: number; body: number | null; current_hp: number | null };
const maxHP = (body: number) => 10 + 5 * body;
const hpLevel = (current: number, maximum: number) => current / maximum <= 0.25 ? 'critical' : current / maximum <= 0.5 ? 'low' : current / maximum <= 0.75 ? 'moderate' : 'healthy';
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

export default function LiveSession({ characters, onHPChanged }: { characters: Character[]; onHPChanged: (id: string, hp: number) => void }) {
  const [hpError, setHpError] = useState('');
  const [hpOverrides, setHpOverrides] = useState<Record<string, number>>({});
  const hpOverridesRef = useRef<Record<string, number>>({});
  const hpJobs = useRef(new Map<string, { confirmed: number; desired: number; sending: boolean; timer?: ReturnType<typeof setTimeout>; clearTimer?: ReturnType<typeof setTimeout> }>());
  function setLocalHP(id: string, hp: number | null) {
    const next = { ...hpOverridesRef.current };
    if (hp === null) delete next[id]; else next[id] = hp;
    hpOverridesRef.current = next;
    setHpOverrides(next);
  }
  async function flushHP(id: string) {
    const job = hpJobs.current.get(id);
    if (!job || job.sending || job.desired === job.confirmed) return;
    job.sending = true;
    const delta = job.desired - job.confirmed;
    const { data, error } = await supabase.rpc('gm_adjust_character_hp', { p_character_id: id, p_delta: delta });
    if (!mounted.current || hpJobs.current.get(id) !== job) return;
    job.sending = false;
    if (error) {
      setHpError(error.message);
      job.desired = job.confirmed;
      setLocalHP(id, job.confirmed);
    } else {
      job.confirmed = Number(data);
      onHPChanged(id, job.confirmed);
    }
    if (job.desired !== job.confirmed) {
      job.timer = setTimeout(() => void flushHP(id), 400);
    } else {
      job.clearTimer = setTimeout(() => {
        if (hpJobs.current.get(id) !== job || job.desired !== job.confirmed) return;
        hpJobs.current.delete(id);
        setLocalHP(id, null);
      }, 1200);
    }
  }
  function adjustHP(character: Character, delta: number) {
    const shown = hpOverridesRef.current[character.id] ?? character.current_hp;
    if (character.body === null || shown === null) return;
    const next = Math.max(0, Math.min(maxHP(character.body), shown + delta));
    if (next === shown) return;
    let job = hpJobs.current.get(character.id);
    if (!job) {
      job = { confirmed: character.current_hp ?? shown, desired: shown, sending: false };
      hpJobs.current.set(character.id, job);
    }
    if (job.timer) clearTimeout(job.timer);
    if (job.clearTimer) clearTimeout(job.clearTimer);
    job.desired = next;
    setHpError('');
    setLocalHP(character.id, next);
    if (!job.sending) job.timer = setTimeout(() => void flushHP(character.id), 400);
  }
  const [npc, setNpc] = useState('Rogue');
  const [spotlight, setSpotlight] = useState(false);
  const [tarotOpen, setTarotOpen] = useState(false);
  const [fortuneOpen, setFortuneOpen] = useState(false);
  const [config, setConfig] = useState<ToolConfig | null>(null);
  const [history, setHistory] = useState<number[]>([]);
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
    return () => { mounted.current = false; timers.current.forEach(clearTimeout); hpJobs.current.forEach(job => { if (job.timer) clearTimeout(job.timer); if (job.clearTimer) clearTimeout(job.clearTimer); }); };
  }, []);
  function clearTimers() { timers.current.forEach(clearTimeout); timers.current = []; }
  function later(fn: () => void, delay: number) {
    const id = setTimeout(() => { if (mounted.current) fn(); }, delay);
    timers.current.push(id);
  }
  function launch(next: ToolConfig) {
    setConfig(next);
    if (next.tool === 'dice') { setSides(next.sides); setHistory([]); open(); }
    else if (next.tool === 'tarot') setTarotOpen(true);
    else setFortuneOpen(true);
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
    setHistory(prev => [...prev, result]);
  }
  function roll() {
    if (rolling.current || (config?.tool === 'dice' && history.length >= config.rolls)) return;
    clearTimers(); rolling.current = true; setPhase('rolling');
    setDieStyle('rolling'); setSceneStyle('');
    const result = config?.tool === 'dice' ? (config.forced?.[history.length] ?? random(sides)) : random(sides);
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
            {hpError && <p className="live-hp-error" role="alert">{hpError}</p>}
            {characters.length ? characters.map(c => { const hp = hpOverrides[c.id] ?? c.current_hp; return (
              <div className="live-character" key={c.id}>
                <div className="live-character-main"><strong>{c.name}</strong><span>{Number(c.balance).toLocaleString('en-US')} E$</span></div>
                {c.body !== null && hp !== null ? <div className="live-character-vitals">
                  <div className="live-hp-info"><span>HP</span><span>{hp} / {maxHP(c.body)}</span></div>
                  <div className="live-hp-row"><div className="live-hp-track" role="progressbar" aria-label={c.name + ' HP'} aria-valuemin={0} aria-valuemax={maxHP(c.body)} aria-valuenow={hp}><div className={"live-hp-fill " + hpLevel(hp, maxHP(c.body))} style={{ width: (100 * hp / maxHP(c.body)) + '%' }} /></div>
                    <div className="live-hp-actions"><button type="button" title="Remove 5 HP" aria-label={'Remove 5 HP from ' + c.name} disabled={hp <= 0} onClick={() => void adjustHP(c, -5)}><Heart size={14}/><Minus size={13}/></button><button type="button" className="live-hp-heal" title="Restore 5 HP" aria-label={'Restore 5 HP to ' + c.name} disabled={hp >= maxHP(c.body)} onClick={() => void adjustHP(c, 5)}><Heart size={14}/><Plus size={13}/></button></div>
                  </div>
                </div> : <small className="live-hp-unavailable">HP unavailable</small>}
              </div>
             ); }) : <p className="live-empty">No characters in this campaign yet.</p>}
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
            <SessionToolSettings onOpen={launch}/>
          </section>
        </div>
      </div>
      {tarotOpen && <TarotSpotlight forced={config?.tool === 'tarot' ? config.forced : null} onClose={() => setTarotOpen(false)} />}
      {fortuneOpen && <FortuneCookieSpotlight messageIndex={config?.tool === 'fortune' ? config.forcedMessage : null} luckyNumbers={config?.tool === 'fortune' ? config.forcedNumbers : null} onClose={() => setFortuneOpen(false)} />}
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
            onClick={roll} disabled={phase === 'rolling' || (config?.tool === 'dice' && history.length >= config.rolls)} aria-label="Roll die">
            <svg viewBox="0 0 200 200" aria-hidden="true">
              <polygon className="live-die-outline" points="100,8 178,66 148,170 52,170 22,66"/>
            </svg>
            <span className="live-die-face" data-number={face}>{face}</span>
          </button>
          <div className="live-dice-status">{phase === 'ready' ? 'CLICK THE DIE TO ROLL' : phase === 'rolling' ? 'ROLLING…' : 'RESULT: ' + face}</div>
          <div className="live-dice-history">{history.length ? history.join(' · ') : 'No rolls yet'}</div>
          <small>{config?.tool === 'dice' ? `${history.length} / ${config.rolls} rolls` : 'Click the die to roll'}</small>
          <button type="button" className="live-spotlight-close" onClick={close} disabled={phase === 'rolling'}>Close spotlight</button>
        </div>
      </div>}
    </div>
  );
}
