import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, ImageIcon, Search, X } from 'lucide-react';
import { CyberwareArtworkZoom } from './CyberwareArtworkZoom';
import { supabase } from './supabase';
import { anatomicalPositions } from './anatomicalPositions';
import './Ripperdoc.css';


declare const __GM_ARTWORK_MANIFEST__: { url: string; sha: string }[];
const cyberwareArtwork = __GM_ARTWORK_MANIFEST__
  .map(entry => entry.url)
  .filter(url => /^\/cyberware\/[^/]+\.webp$/i.test(url) && !url.toLowerCase().includes('anatomical-scan'))
  .map(url => ({ url, name: decodeURIComponent(url.split('/').pop() ?? '').replace(/\.webp$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2') }))
  .sort((a, b) => a.name.localeCompare(b.name));
type Character = { id: string; name: string };
type Implant = { id: string; name: string; rarity: string; price: number; description: string | null; properties: { image?: string } | null };
type Procedure = { characterId: string; itemId: string | null; positionId: string; characterName: string; implantName: string; implantDescription: string; positionLabel: string; image: string | null };
export default function Ripperdoc({ characters }: { characters: Character[] }) {
  const [characterId, setCharacterId] = useState('');
  const [implantId, setImplantId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customArtwork, setCustomArtwork] = useState('');
  const [artworkPickerOpen, setArtworkPickerOpen] = useState(false);
  const [artworkSearch, setArtworkSearch] = useState('');
  const [implants, setImplants] = useState<Implant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [procedure, setProcedure] = useState<Procedure | null>(null);
  const [procedureStarted, setProcedureStarted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [procedureError, setProcedureError] = useState('');
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
  const visibleArtwork = cyberwareArtwork.filter(image => image.name.toLowerCase().includes(artworkSearch.trim().toLowerCase()));
  const isCustom = implantId === 'custom';
  const implantName = isCustom ? customName.trim() : chosenImplant?.name ?? '';
  const implantDescription = isCustom ? customDescription.trim() : chosenImplant?.description ?? '';
  const chosenPosition = anatomicalPositions.find(p => p.id === positionId);
  const chosenCharacter = characters.find(c => c.id === characterId);
  const startProcedure = () => {
    if (!chosenCharacter || !implantName || !chosenPosition || (isCustom && (!implantDescription || !customArtwork))) return;
    setProcedure({ characterId, itemId: isCustom ? null : chosenImplant?.id ?? null, positionId, characterName: chosenCharacter.name, implantName, implantDescription, positionLabel: chosenPosition.label + ' (' + chosenPosition.id + ')', image: isCustom ? customArtwork : chosenImplant?.properties?.image ?? null });
    setProcedureStarted(false);
    setProcedureError('');
  };
  const initiateProcedure = async () => {
    if (!procedure || saving || procedureStarted) return;
    setSaving(true);
    setProcedureError('');
    try {
      const { error: insertError } = await supabase.from('character_cyberware').insert({
        character_id: procedure.characterId,
        item_id: procedure.itemId,
        name: procedure.implantName,
        description: procedure.implantDescription,
        position_id: procedure.positionId,
        image_url: procedure.image,
      });
      if (insertError) throw insertError;
      setProcedureStarted(true);
    } catch (cause) {
      setProcedureError(cause instanceof Error ? cause.message : 'Could not save the installation. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  return <section className="rd-page" aria-label="Ripperdoc">
    <div className="rd-heading"><Activity size={21}/><div><strong>RIPPERDOC // OPERATING ROOM</strong><p>Prepare a cyberware procedure. Install cyberware on a selected character.</p></div></div>
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
              <div className="rd-implant-detail rd-custom-artwork-detail">
                <button type="button" className="rd-artwork-select" onClick={() => { setArtworkSearch(''); setArtworkPickerOpen(true); }} aria-label={customArtwork ? 'Change custom implant artwork' : 'Select custom implant artwork'}>
                  {customArtwork ? <img className="rd-implant-image" src={customArtwork} alt="Selected custom implant artwork"/> :
                    <span className="rd-artwork-select-placeholder"><ImageIcon size={23}/><span>CLICK TO SELECT ARTWORK</span></span>}
                </button>
                <div className="rd-custom-artwork-description">
                  <label className="rd-field">CYBERWARE NAME
                    <input type="text" maxLength={120} value={customName} placeholder="Enter implant name"
                      onChange={e => { setCustomName(e.target.value); setProcedure(null); }}/>
                  </label>
                  <label className="rd-field">DESCRIPTION
                    <textarea rows={4} maxLength={2000} value={customDescription} placeholder="Describe the implant and its effects"
                      onChange={e => { setCustomDescription(e.target.value); setProcedure(null); }}/>
                  </label>
                  {!customArtwork && <small>Artwork is required to review this procedure.</small>}
                </div>
              </div>
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
                <div className="rd-implant-detail">{i.properties?.image && <div style={{ position: 'relative', width: '100%' }}><img className="rd-implant-image" src={i.properties.image} alt={i.name + ' artwork'}/><CyberwareArtworkZoom src={i.properties.image} alt={i.name} compact/></div>}<p className="rd-description">{i.description || 'No description available.'}</p></div>
              </div>}
            </div>)}
        </div>
        <div className="rd-next-action">
          <button type="button" disabled={!chosenCharacter || !implantName || !chosenPosition || (isCustom && (!implantDescription || !customArtwork))}
            onClick={startProcedure}>REVIEW PROCEDURE</button>
        </div>
      </div>
    </div>
    {artworkPickerOpen && <div className="rd-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setArtworkPickerOpen(false); }}>
      <section className="rd-modal rd-artwork-picker" role="dialog" aria-modal="true" aria-label="Cyberware artwork library">
        <div className="rd-modal-header"><div><small>RIPPERDOC // CUSTOM CYBERWARE</small><h3>SELECT ARTWORK</h3></div>
          <button type="button" className="rd-modal-close" aria-label="Close artwork gallery" onClick={() => setArtworkPickerOpen(false)}><X size={19}/></button>
        </div>
        <label className="rd-artwork-search"><Search size={17}/><input value={artworkSearch} onChange={e => setArtworkSearch(e.target.value)} placeholder="Search cyberware artwork..." aria-label="Search cyberware artwork"/></label>
        <div className="rd-artwork-grid">
          {visibleArtwork.map(art => <button type="button" key={art.url} className={'rd-artwork-option' + (customArtwork === art.url ? ' selected' : '')}
            onClick={() => { setCustomArtwork(art.url); setArtworkPickerOpen(false); setProcedure(null); }}>
            <img src={art.url} alt={art.name} loading="lazy"/><span>{art.name}</span>
          </button>)}
          {visibleArtwork.length === 0 && <p className="rd-artwork-empty">No matching artwork.</p>}
        </div>
      </section>
    </div>}
    {procedure && <div className="rd-modal-backdrop" onMouseDown={e => { if (!saving && e.target === e.currentTarget) setProcedure(null); }}>
      <section className="rd-modal" role="dialog" aria-modal="true" aria-label="Procedure overview">
        <div className="rd-modal-header"><div><small>RIPPERDOC // PREOPERATIVE ASSESSMENT</small><h3>PROCEDURE OVERVIEW</h3></div>
        </div>
        <div className="rd-modal-body">
          <div className="rd-artwork" aria-label="Implant artwork">
            {procedure.image ? <div style={{ position: 'relative', width: '100%', height: '100%' }}><img src={procedure.image} alt={procedure.implantName + ' artwork'}/><CyberwareArtworkZoom src={procedure.image} alt={procedure.implantName} compact/></div> :
              <div className="rd-artwork-placeholder"><ImageIcon size={30}/><span>IMPLANT ARTWORK</span><small>NO IMAGE AVAILABLE</small></div>}
          </div>
          <div className="rd-modal-details">
            <div><small>PATIENT</small><strong>{procedure.characterName}</strong></div>
            <div><small>CYBERWARE</small><strong>{procedure.implantName}</strong>{procedure.itemId === null && <small style={{ color: '#d5a5ff', marginTop: 4 }}>CUSTOM MADE</small>}</div>
            <div><small>INSTALLATION SITE</small><strong>{procedure.positionLabel}</strong></div>
            {procedure.implantDescription && <div><small>DESCRIPTION</small><p>{procedure.implantDescription}</p></div>}
          </div>
        </div>
        <div className="rd-modal-footer">
          {procedureStarted && <p role="status" className="rd-confirmation"><CheckCircle2 size={16}/> Cyberware installation saved successfully.</p>}
          {procedureError && <p role="alert" className="rd-procedure-error">{procedureError}</p>}
          <button type="button" className="rd-modal-cancel" disabled={saving} onClick={() => setProcedure(null)}>BACK</button>
          <button type="button" className="rd-modal-start" disabled={saving || procedureStarted}
            onClick={() => void initiateProcedure()}>{saving ? 'INSTALLING...' : procedureStarted ? 'PROCEDURE COMPLETED' : 'INITIATE PROCEDURE'}</button>
        </div>
      </section>
    </div>}
  </section>;
}
