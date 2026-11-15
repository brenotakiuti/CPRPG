import { useEffect, useState } from 'react';
import { Activity, CheckCircle2 } from 'lucide-react';
import { supabase } from './supabase';
import { anatomicalPositions } from './anatomicalPositions';
import './Ripperdoc.css';

type Character = { id: string; name: string };
type Implant = { id: string; name: string; rarity: string; price: number; description: string | null };
type Procedure = { characterId: string; implantId: string; positionId: string };
export default function Ripperdoc({ characters }: { characters: Character[] }) {
  const [characterId, setCharacterId] = useState('');
  const [implantId, setImplantId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [implants, setImplants] = useState<Implant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [procedure, setProcedure] = useState<Procedure | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      const { data, error: queryError } = await supabase.from('items')
        .select('id, name, rarity, price, description').eq('category', 'Cyberware').order('name');
      if (!active) return;
      setImplants((data ?? []) as Implant[]);
      setError(queryError?.message ?? '');
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!characters.some(c => c.id === characterId)) setCharacterId('');
  }, [characters, characterId]);
  const chosenImplant = implants.find(i => i.id === implantId);
  const chosenPosition = anatomicalPositions.find(p => p.id === positionId);
  const chosenCharacter = characters.find(c => c.id === characterId);
  const startProcedure = () => {
    if (!chosenCharacter || !chosenImplant || !chosenPosition) return;
    // UI-only phase: no installation, database write, or player communication yet.
    setProcedure({ characterId, implantId, positionId });
  };
  return <section className="rd-page" aria-label="Ripperdoc">
    <div className="rd-heading"><Activity size={21}/><div><strong>RIPPERDOC // OPERATING ROOM</strong><p>Prepare a cyberware procedure. Installation is not connected yet.</p></div></div>
    <div className="rd-workspace">
      <div className="rd-scan-panel">
        <label className="rd-field">PATIENT
          <select value={characterId} onChange={e => { setCharacterId(e.target.value); setProcedure(null); }}>
            <option value="">Select character</option>
            {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="rd-diagram">
          <img src="/cyberware/cyberware-anatomical-scan.webp" alt="Full-body cybernetic anatomical scan"/>
          {anatomicalPositions.map(p => <button type="button" key={p.id}
            style={{ left: p.x + '%', top: p.y + '%' }}
            className={'rd-position' + (positionId === p.id ? ' selected' : '')}
            aria-label={p.label + ' (' + p.id + ')'} aria-pressed={positionId === p.id}
            title={p.label + ' (' + p.id + ')'}
            onClick={() => { setPositionId(p.id); setProcedure(null); }}><span>{p.id}</span></button>)}
        </div>
        <div className="rd-position-caption">{chosenPosition ? chosenPosition.id + ' // ' + chosenPosition.label : 'SELECT ANATOMICAL POSITION'}</div>
      </div>
      <div className="rd-catalog-panel">
        <strong>CYBERWARE CATALOG</strong>
        {loading ? <p>Loading cyberware…</p> : error ? <p role="alert">{error}</p> : implants.length === 0 ? <p>No cyberware found.</p> :
          <div className="rd-items">{implants.map(i => <button key={i.id} type="button" className={'rd-item' + (implantId === i.id ? ' selected' : '')}
            aria-pressed={implantId === i.id} onClick={() => { setImplantId(i.id); setProcedure(null); }}>
            <span><b>{i.name}</b><small>{i.rarity}</small></span><strong>€${Number(i.price).toLocaleString('en-US')}</strong>
          </button>)}</div>}
        {chosenImplant?.description && <p className="rd-description">{chosenImplant.description}</p>}
        <div className="rd-procedure">
          <strong>PROCEDURE PREVIEW</strong>
          <p>Patient: {chosenCharacter?.name ?? 'Not selected'}</p>
          <p>Cyberware: {chosenImplant?.name ?? 'Not selected'}</p>
          <p>Position: {chosenPosition ? chosenPosition.label + ' (' + chosenPosition.id + ')' : 'Not selected'}</p>
          <button type="button" disabled={!chosenCharacter || !chosenImplant || !chosenPosition} onClick={startProcedure}>START PROCEDURE</button>
          {procedure && <p className="rd-confirmation" role="status"><CheckCircle2 size={16}/> Procedure selected for {chosenCharacter?.name}. Preview only — installation and player synchronization will be added later.</p>}
        </div>
      </div>
    </div>
  </section>;
}
