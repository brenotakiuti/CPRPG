import { useEffect, useState } from 'react';
import type { Campaign } from './CampaignSelection';
import { supabase } from './supabase';
import Bank from './Bank';

type GMConsoleProps = {
  campaign: Campaign;
  onSwitchCampaign: () => void;
};

export default function GMConsole({
  campaign,
  onSwitchCampaign,
}: GMConsoleProps) {
  const [page, setPage] = useState<'overview' | 'bank' | 'characters' | 'inventory' | 'factions'>(() => {
    const saved = sessionStorage.getItem('gm-page');
    return saved === 'bank' || saved === 'characters' || saved === 'inventory' || saved === 'factions' ? saved : 'overview';
  });
  const [selectedId, setSelectedId] = useState('');
  const [detailTab, setDetailTab] = useState<'stats' | 'cyberware' | 'inventory' | 'access'>('stats');
  const [search, setSearch] = useState('');

  type CharacterOption = {
    id: string;
    name: string;
    player_id: string | null;
    balance: number;
  };

  const [characters, setCharacters] = useState<CharacterOption[]>([]);

  const [invitations, setInvitations] = useState<Record<string, string>>({});

  const [inviteMessage, setInviteMessage] = useState('');
  const [resettingCharacterId, setResettingCharacterId] = useState<string | null>(null);

  const [creationToken, setCreationToken] = useState('');
  const [creationEnabled, setCreationEnabled] = useState(false);
  const [creationSaving, setCreationSaving] = useState(false);
  const [creationError, setCreationError] = useState('');

  useEffect(() => {
    let active = true;
    setCreationToken('');
    setCreationEnabled(false);
    setCreationError('');
    async function loadSettings() {
      const { data, error } = await supabase.rpc('get_character_creation_settings', {
        p_campaign_id: campaign.id,
      });
      if (!active) return;
      if (error) setCreationError(error.message);
      else if (data?.[0]) {
        setCreationToken(data[0].creation_token);
        setCreationEnabled(data[0].creation_enabled);
      }
    }
    void loadSettings();
    return () => { active = false; };
  }, [campaign.id]);

  async function toggleCreation() {
    if (!creationToken || creationSaving) return;
    setCreationSaving(true);
    setCreationError('');
    const { data, error } = await supabase.rpc('set_character_creation_enabled', {
      p_campaign_id: campaign.id,
      p_enabled: !creationEnabled,
    });
    if (error) setCreationError(error.message);
    else setCreationEnabled(data);
    setCreationSaving(false);
  }

  const creationLink = creationToken
    ? window.location.origin + window.location.pathname + window.location.search + '#create=' + creationToken
    : '';


  useEffect(() => {
    let active = true;

    async function loadCharacters() {
      const { data, error } = await supabase
        .from('characters')
        .select('id, name, player_id, balance')
        .eq('campaign_id', campaign.id)
        .order('name');

      if (!active) return;

      if (error) {
        setInviteMessage(error.message);
      } else {
        setCharacters(data ?? []);
        // Once claimed, an invitation is no longer usable; hide its old link.
        setInvitations((previous) => {
          const next = { ...previous };
          for (const character of data ?? []) {
            if (character.player_id) delete next[character.id];
          }
          return next;
        });
      }
    }

    // Listen to successful database assignments, not merely link visits.
    const channel = supabase
      .channel(`gm-character-assignments-${campaign.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'characters',
          filter: `campaign_id=eq.${campaign.id}`,
        },
        () => {
          void loadCharacters();
        }
      )
      .subscribe();

    // Fetch after subscribing to minimize the claim-between-steps race.
    void loadCharacters();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [campaign.id]);

  async function generateInvitation(characterId: string) {
    setInviteMessage('');

    const { data: token, error } = await supabase.rpc(
      'create_character_invitation',
      { p_character_id: characterId }
    );

    if (error) {
      setInviteMessage(error.message);
      return;
    }

    const url = new URL(window.location.href);
    url.hash = `player=${token}`;

    setInvitations((previous) => ({
      ...previous,
      [characterId]: url.toString(),
    }));
  }

  async function resetPlayerAccess(characterId: string, characterName: string) {
    if (!window.confirm(
      `Revoke access to ${characterName}? The previous player will lose access. You can generate a new invitation later.`
    )) return;

    setInviteMessage('');
    setResettingCharacterId(characterId);

    try {
      // Revoke access only; invitation generation remains a separate GM action.
      const { error } = await supabase.rpc(
        'reset_character_player_access',
        { p_character_id: characterId }
      );

      if (error) {
        setInviteMessage(error.message);
        return;
      }
      setCharacters((previous) =>
        previous.map((character) =>
          character.id === characterId ? { ...character, player_id: null } : character
        )
      );
      setInvitations((previous) => {
        const next = { ...previous };
        delete next[characterId];
        return next;
      });
      // Keep successful revocations in the developer console, not the GM UI.
      console.debug('[GM Console] Player access revoked', { characterId, characterName });
    } catch {
      setInviteMessage('Could not reset player access. Please try again.');
    } finally {
      setResettingCharacterId(null);
    }
  }

  useEffect(() => {
    sessionStorage.setItem('gm-page', page);
  }, [page]);

  const selected = characters.find((c) => c.id === selectedId) ?? characters[0];
  const visible = characters.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  const navigation: { id: typeof page; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'characters', label: 'Characters' },
    { id: 'bank', label: 'Bank' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'factions', label: 'Factions' },
  ];
  const creationControls = (
    <section className="creation-link-section" aria-label="Character creation">
      <div className="creation-link-heading">
        <span>Character Creation Link</span>
        <div className="creation-toggle-group">
          <span>{creationEnabled ? 'Enabled' : 'Disabled'}</span>
          <button type="button" className={creationEnabled ? 'creation-switch is-enabled' : 'creation-switch'}
            role="switch" aria-checked={creationEnabled} aria-label="Enable character creation"
            disabled={!creationToken || creationSaving} onClick={() => void toggleCreation()}>
            <span className="creation-switch-thumb" />
          </button>
        </div>
      </div>
      <div className="creation-link-row">
        <input readOnly aria-label="Character creation link" value={creationLink}
          placeholder="Loading link..." title={creationLink} />
        <button type="button" className="creation-copy-button" aria-label="Copy character creation link"
          title="Copy character creation link" disabled={!creationLink}
          onClick={() => void navigator.clipboard.writeText(creationLink)}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="8" y="8" width="13" height="13" rx="2" />
            <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
          </svg>
        </button>
      </div>
      {creationError && <p className="creation-error" role="alert">{creationError}</p>}
    </section>
  );

  return (
    <div className="gm-dashboard">
      <header className="gm-dashboard-header">
        <div>
          <div className="gm-eyebrow">CYBERPUNK RPG · GM TERMINAL</div>
          <h1>{campaign.name}</h1>
        </div>
        <span className="gm-online">◉ &nbsp; GM Online</span>
      </header>
      <nav className="gm-tabs" aria-label="GM tools">
        {navigation.map((item) => (
          <button key={item.id} type="button" className={page === item.id ? 'gm-tab active' : 'gm-tab'}
            aria-current={page === item.id ? 'page' : undefined} onClick={() => setPage(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>
      {page === 'characters' ? (
        <div className="gm-characters-layout">
          <aside className="gm-roster">
            <div className="gm-roster-heading"><strong>Roster</strong><span>{characters.length}</span></div>
            <input aria-label="Search characters" placeholder="Search..." value={search}
              onChange={(e) => setSearch(e.target.value)} />
            {visible.map((character) => (
              <button type="button" key={character.id}
                className={selected?.id === character.id ? 'gm-roster-card selected' : 'gm-roster-card'}
                onClick={() => { setSelectedId(character.id); setDetailTab('stats'); setInviteMessage(''); }}>
                <span className="gm-roster-card-top">
                  <span className="gm-avatar" aria-hidden="true">♙</span>
                  <span><strong>{character.name}</strong><small>Character</small></span>
                </span>
                <small className={character.player_id ? 'gm-assigned' : 'gm-unassigned'}>
                  {character.player_id ? '● Assigned to player' : '○ Unassigned'}
                </small>
              </button>
            ))}
            {visible.length === 0 && <p className="gm-muted">No matching characters.</p>}
          </aside>
          <main className="gm-character-details">
            {selected ? (
              <>
                <div className="gm-character-header">
                  <div><h2>{selected.name}</h2><p>Character</p></div>
                  <div className="gm-character-balance">
                    <strong>{selected.balance.toLocaleString('en-US')} E$</strong>
                    <small className={selected.player_id ? 'gm-assigned' : 'gm-unassigned'}>
                      {selected.player_id ? 'Assigned to player' : 'Unassigned'}
                    </small>
                  </div>
                </div>
                <div className="gm-detail-tabs" role="tablist" aria-label="Character details">
                  {(['stats', 'cyberware', 'inventory', 'access'] as const).map((tab) => (
                    <button key={tab} role="tab" aria-selected={detailTab === tab}
                      className={detailTab === tab ? 'selected' : ''}
                      onClick={() => setDetailTab(tab)}>{tab[0].toUpperCase() + tab.slice(1)}</button>
                  ))}
                </div>
                {detailTab === 'stats' && (
                  <div className="gm-placeholder-stats">
                    <p>Stats will appear here when character attributes are added.</p>
                  </div>
                )}
                {detailTab === 'cyberware' && <div className="gm-empty-detail">No cyberware installed</div>}
                {detailTab === 'inventory' && <div className="gm-empty-detail">Inventory is empty</div>}
                {detailTab === 'access' && (
                  <div className="gm-access-panel">
                    {selected.player_id ? (
                      <div className="character-assignment-row">
                        <span className="character-assignment-status">Assigned to player</span>
                        <button type="button" className="revoke-access-button"
                          title="Revoke player access" aria-label={`Revoke player access for ${selected.name}`}
                          disabled={resettingCharacterId !== null}
                          onClick={() => void resetPlayerAccess(selected.id, selected.name)}>↻</button>
                      </div>
                    ) : (
                      <>
                        <button onClick={() => void generateInvitation(selected.id)}>Generate Invitation</button>
                        {invitations[selected.id] && (
                          <div className="gm-invitation">
                            <input readOnly aria-label="Character invitation" value={invitations[selected.id]} />
                            <button onClick={() => void navigator.clipboard.writeText(invitations[selected.id])}>Copy Link</button>
                          </div>
                        )}
                      </>
                    )}
                    {inviteMessage && <p className="transfer-message" role="alert">{inviteMessage}</p>}
                  </div>
                )}
              </>
            ) : <p className="gm-muted">No characters in this campaign yet.</p>}
          </main>
        </div>
      ) : page === 'bank' ? (
        <div className="gm-dashboard-panel"><Bank campaignId={campaign.id} /></div>
      ) : page === 'overview' ? (
        <div className="gm-dashboard-panel gm-overview">
          <h2>Campaign Overview</h2>
          <p>{characters.length} characters in this campaign</p>
          {creationControls}
          <div className="gm-account-actions">
            <button onClick={onSwitchCampaign}>Switch Campaign</button>
            <button onClick={() => void supabase.auth.signOut()}>Log out</button>
          </div>
        </div>
      ) : (
        <div className="gm-dashboard-panel gm-empty-detail">
          {page === 'inventory' ? 'Inventory' : 'Factions'} — coming later
        </div>
      )}
    </div>
  );
}
