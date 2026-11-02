import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Brain, Check, Dumbbell, Eye, Fingerprint, Minus, Plus, RotateCcw, ScanFace, SlidersHorizontal, Wrench, Zap } from 'lucide-react';
import { supabase } from './supabase';
import './CharacterCreation.css';

type Props = { token: string };
const ATTRIBUTES = [
  { name: 'Body', description: 'Strength, endurance and physical resilience', Icon: Dumbbell },
  { name: 'Reflexes', description: 'Speed, coordination and reaction time', Icon: Zap },
  { name: 'Technical Ability', description: 'Engineering, repairs and technical expertise', Icon: Wrench },
  { name: 'Intelligence', description: 'Analysis, hacking and problem-solving', Icon: Brain },
  { name: 'Cool', description: 'Composure, stealth and pressure control', Icon: Eye },
];
const DEFAULT_VALUES = [3, 3, 3, 3, 3];
const BUDGET = 30;
function tier(value: number) {
  if (value >= 20) return { name: 'Legendary', color: '#f59e0b' };
  if (value >= 15) return { name: 'Elite', color: '#bd7bea' };
  if (value >= 10) return { name: 'Expert', color: '#32c5c5' };
  if (value >= 5) return { name: 'Trained', color: '#4ade80' };
  return { name: 'Basic', color: '#8b95a4' };
}

export default function CharacterCreation({ token }: Props) {
  const [status, setStatus] = useState('Connecting...');
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [values, setValues] = useState([...DEFAULT_VALUES]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [created, setCreated] = useState(false);
  const remaining = BUDGET - values.reduce((sum, value) => sum + value, 0);

  useEffect(() => {
    let active = true;
    async function connect() {
      const { data: existing, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) { if (active) setStatus(sessionError.message); return; }
      let session = existing.session;
      if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) { if (active) setStatus(error.message); return; }
        session = data.session;
      }
      if (!active) return;
      if (!session?.user.is_anonymous) {
        setStatus('Open this link in a separate browser or private window.');
        return;
      }
      // Existing anonymous players should never be asked to recreate a character.
      // RLS already allows players to read their own character.
      const { data: ownedCharacter, error: ownershipError } = await supabase
        .from('characters')
        .select('id')
        .eq('player_id', session.user.id)
        .limit(1)
        .maybeSingle();
      if (!active) return;
      if (ownershipError) { setStatus(ownershipError.message); return; }
      if (ownedCharacter) {
        window.location.replace(window.location.pathname + window.location.search + '#player');
        return;
      }
      const { data, error } = await supabase.rpc('get_character_creation_campaign', {
        p_token: token,
      });
      if (!active) return;
      if (error) { setStatus(error.message); return; }
      if (!data?.[0]) { setStatus('Invalid character creation link.'); return; }
      if (!data[0].creation_enabled) {
        setStatus('Character creation is disabled for this campaign.');
        return;
      }
      setCampaignName(data[0].campaign_name);
      setStatus('');
    }
    void connect();
    return () => { active = false; };
  }, [token]);

  async function createCharacter() {
    if (submitting || created || !name.trim() || remaining !== 0 || status) return;
    setSubmitting(true);
    setSubmitError('');
    const { data, error } = await supabase.rpc('create_player_character', {
      p_token: token,
      p_name: name.trim(),
      p_attributes: Object.fromEntries(ATTRIBUTES.map((attribute, i) => [attribute.name, values[i]])),
    });
    if (error) {
      setSubmitError(error.message);
      setSubmitting(false);
      return;
    }
    if (!data) {
      setSubmitError('Character creation did not return an identifier.');
      setSubmitting(false);
      return;
    }
    setCreated(true);
    setSubmitting(false);

  }

  function adjust(index: number, delta: number) {
    setValues((current) => {
      const next = current[index] + delta;
      if (next < 1 || next > 20 || (delta > 0 && remaining <= 0)) return current;
      return current.map((value, i) => i === index ? next : value);
    });
  }

  return (
    <main className="cc-page">
      <div className="cc-shell">
        <header className="cc-header">
          <div><div className="cc-eyebrow">{campaignName ?? 'NIGHT CITY'} // CHARACTER SYSTEM</div><h1>New Identity</h1></div>
          <div className="cc-header-icon"><ScanFace size={27} /></div>
        </header>
        {status ? <section className="cc-card"><p role="status">{status}</p></section> : <>
          <div className="cc-steps" aria-label="Character creation progress">
            {['IDENTITY', 'ATTRIBUTES', 'REVIEW'].map((label, i) => (
              <div className="cc-step" key={label}><div className={i <= step ? 'cc-step-line active' : 'cc-step-line'} /><span className={i === step ? 'current' : ''}>0{i + 1} {label}</span></div>
            ))}
          </div>
          {step === 0 && <section className="cc-card cc-identity">
            <div className="cc-section-label"><Fingerprint size={19} /> IDENTITY REGISTRATION</div>
            <p>Welcome to Night City. Choose the name your character will be known by.</p>
            <label htmlFor="cc-name">Character name</label>
            <input id="cc-name" maxLength={60} autoComplete="off" placeholder="e.g. V, Jackie, Rogue..." value={name} onChange={(event) => setName(event.target.value)} />
            <small>Additional character details can be added later.</small>
          </section>}
          {step === 0 && <button className="cc-primary" disabled={!name.trim()} onClick={() => setStep(1)}>Continue <ArrowRight size={19} /></button>}
          {step === 1 && <>
            <section className="cc-card cc-budget">
              <div className="cc-budget-top"><div><div className="cc-muted-label">ATTRIBUTE POINTS</div><div className="cc-remaining">{remaining} <span>remaining</span></div></div><SlidersHorizontal size={23} /></div>
              <div className="cc-progress"><div style={{ width: `${(BUDGET - remaining) / BUDGET * 100}%` }} /></div>
              <small>30 total points · Default 3 · Minimum 1 · Maximum 20</small>
              <button className="cc-reset" onClick={() => setValues([...DEFAULT_VALUES])}><RotateCcw size={15} /> Reset</button>
            </section>
            {ATTRIBUTES.map(({ name: label, description, Icon }, i) => {
              const currentTier = tier(values[i]);
              return <section className="cc-card cc-attribute" key={label}>
                <div className="cc-attribute-head"><div className="cc-attribute-icon"><Icon size={23} strokeWidth={1.9} /></div><div><strong>{label}</strong><p>{description}</p></div></div>
                <div className="cc-attribute-actions"><div className="cc-stat-value" style={{ color: currentTier.color }}>{values[i]} <span>{currentTier.name}</span></div><div className="cc-buttons">
                  <button aria-label={`Decrease ${label}`} disabled={values[i] <= 1} onClick={() => adjust(i, -1)}><Minus size={20} /></button>
                  <button aria-label={`Increase ${label}`} disabled={values[i] >= 20 || remaining <= 0} onClick={() => adjust(i, 1)}><Plus size={20} /></button>
                </div></div>
                <div className="cc-progress cc-stat-progress"><div style={{ width: `${values[i] / 20 * 100}%`, background: currentTier.color }} /></div>
              </section>;
            })}
            <div className="cc-footer"><button className="cc-secondary" onClick={() => setStep(0)}><ArrowLeft size={17} /> Back</button><button className="cc-primary" disabled={remaining !== 0} onClick={() => setStep(2)}>Review <ArrowRight size={17} /></button></div>
          </>}
          {created ? <section className="cc-card cc-review"><div className="cc-section-label"><Check size={20} /> CHARACTER CREATED</div><h2>{name.trim()}</h2><p>Your character is ready. You can now open your player dashboard.</p><button className="cc-primary" onClick={() => { window.location.hash = "player"; window.location.reload(); }}>Open player dashboard <ArrowRight size={17} /></button></section> : step === 2 && <>
            <section className="cc-card cc-review"><div className="cc-section-label"><Check size={20} /> CHARACTER PROFILE</div><h2>{name.trim()}</h2><div className="cc-review-list">{ATTRIBUTES.map((attribute, i) => <div className="cc-review-row" key={attribute.name}><span>{attribute.name}</span><span style={{ color: tier(values[i]).color }}>{tier(values[i]).name} <strong>{values[i]}</strong></span></div>)}</div><div className="cc-review-row"><strong>Total points</strong><strong>30 / 30</strong></div></section>
            <div className="cc-footer"><button className="cc-secondary" onClick={() => setStep(1)}><ArrowLeft size={17} /> Edit</button><button className="cc-primary" disabled={submitting || remaining !== 0} onClick={() => void createCharacter()}>{submitting ? "Creating..." : "Create character"} <Check size={17} /></button></div>
            {submitError && <p className="cc-error" role="alert">{submitError}</p>}
          </>}
        </>}
      </div>
    </main>
  );
}
