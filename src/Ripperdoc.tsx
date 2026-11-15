import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, ImageIcon } from 'lucide-react';
import { supabase } from './supabase';
import { anatomicalPositions } from './anatomicalPositions';
import './Ripperdoc.css';

type Character = { id: string; name: string };
type Implant = { id: string; name: string; rarity: string; price: number; description: string | null; properties: { image?: string } | null };
type Procedure = { characterName: string; implantName: string; implantDescription: string; positionLabel: string; image: string | null };
export default function Ripperdoc({ characters }: { characters: Character[] }) {
  const [characterId, setCharacterId] = useState('');
  const [implantId, setImplantId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [implants, setImplants] = useState<Implant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [procedure, setProcedure] = useState<Procedure | null>(null);
  const [procedureStarted, setProcedureStarted] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      const { data, error: queryError } = await supabase.from('items')
        .select('id, name, rarity, price, description, properties').eq('category', 'Cyberware').order('name');
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
  const isCustom = implantId === 'custom';
  const implantName = isCustom ? customName.trim() : chosenImplant?.name ?? '';
  const implantDescription = isCustom ? customDescription.trim() : chosenImplant?.description ?? '';
  const chosenPosition = anatomicalPositions.find(p => p.id === positionId);
  const chosenCharacter = characters.find(c => c.id === characterId);
  const startProcedure = () => {
    if (!chosenCharacter || !implantName || !chosenPosition || (isCustom && !implantDescription)) return;
    // UI-only phase: no installation, database write, or player communication yet.
    setProcedure({ characterName: chosenCharacter.name, implantName, implantDescription, positionLabel: chosenPosition.label + ' (' + chosenPosition.id + ')', image: isCustom ? null : chosenImplant?.properties?.image ?? null });
    setProcedureStarted(false);
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
        <div className="rd-items">
          <div className="rd-item-entry">
            <button type="button" className={'rd-item rd-custom-choice' + (isCustom ? ' selected' : '')}
              aria-pressed={isCustom} aria-expanded={isCustom}
              onClick={() => { setImplantId(isCustom ? '' : 'custom'); setProcedure(null); }}>
              <span><b>+ Custom Cyberware</b><small>Invent a new implant for this procedure</small></span>
            </button>
            {isCustom && <div className="rd-inline-detail rd-custom-fields">
              <label className="rd-field">CYBERWARE NAME
                <input type="text" maxLength={120} value={customName} placeholder="Enter implant name"
                  onChange={e => { setCustomName(e.target.value); setProcedure(null); }}/>
              </label>
              <label className="rd-field">DESCRIPTION
                <textarea rows={4} maxLength={2000} value={customDescription} placeholder="Describe the implant and its effects"
                  onChange={e => { setCustomDescription(e.target.value); setProcedure(null); }}/>
              </label>
            </div>}
          </div>
          {loading ? <p>Loading cyberware…</p> : error ? <p role="alert">{error}</p> : implants.length === 0 ? <p>No catalog cyberware found.</p> :
            implants.map(i => <div className="rd-item-entry" key={i.id}>
              <button type="button" className={'rd-item' + (implantId === i.id ? ' selected' : '')}
                aria-pressed={implantId === i.id} aria-expanded={implantId === i.id}
                onClick={() => { setImplantId(implantId === i.id ? '' : i.id); setProcedure(null); }}>
                <span><b>{i.name}</b><small>{i.rarity}</small></span>
                <strong>€${Number(i.price).toLocaleString('en-US')}</strong>
              </button>
              {implantId === i.id && <div className="rd-inline-detail">
                <p className="rd-description">{i.description || 'No description available.'}</p>
              </div>}
            </div>)}
        </div>
        <div className="rd-next-action">
          <button type="button" disabled={!chosenCharacter || !implantName || !chosenPosition || (isCustom && !implantDescription)}
            onClick={startProcedure}>REVIEW PROCEDURE</button>
        </div>
      </div>
    </div>
    {procedure && <div className="rd-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setProcedure(null); }}>
      <section className="rd-modal" role="dialog" aria-modal="true" aria-label="Procedure overview">
        <div className="rd-modal-header"><div><small>RIPPERDOC // PREOPERATIVE ASSESSMENT</small><h3>PROCEDURE OVERVIEW</h3></div>
        </div>
        <div className="rd-modal-body">
          <div className="rd-artwork" aria-label="Implant artwork">
            {procedure.image ? <img src={procedure.image} alt={procedure.implantName + ' artwork'}/> :
              <div className="rd-artwork-placeholder"><ImageIcon size={30}/><span>IMPLANT ARTWORK</span><small>NO IMAGE AVAILABLE</small></div>}
          </div>
          <div className="rd-modal-details">
            <div><small>PATIENT</small><strong>{procedure.characterName}</strong></div>
            <div><small>CYBERWARE</small><strong>{procedure.implantName}</strong></div>
            <div><small>INSTALLATION SITE</small><strong>{procedure.positionLabel}</strong></div>
            {procedure.implantDescription && <div><small>DESCRIPTION</small><p>{procedure.implantDescription}</p></div>}
          </div>
        </div>
        <div className="rd-modal-footer">
          {procedureStarted && <p role="status" className="rd-confirmation"><CheckCircle2 size={16}/> Procedure initiated in preview mode. No installation has been saved.</p>}
          <button type="button" className="rd-modal-cancel" onClick={() => setProcedure(null)}>BACK</button>
          <button type="button" className="rd-modal-start" disabled={procedureStarted}
            onClick={() => setProcedureStarted(true)}>{procedureStarted ? 'PROCEDURE INITIATED' : 'INITIATE PROCEDURE'}</button>
        </div>
      </section>
    </div>}
  </section>;
}
