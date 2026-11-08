import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Brain, Dumbbell, Eye, Landmark, LayoutDashboard, Copy, ScrollText, Package, Shield, Users, Wrench, Zap } from 'lucide-react';
import type { Campaign } from './CampaignSelection';
import { supabase } from './supabase';
import Bank from './Bank';
import LiveSession from './LiveSession';
import CampaignLogs from './CampaignLogs';

// Temporary visual thresholds; can later be supplied by campaign stat-tier records.
const DEFAULT_STAT_TIERS = [
  { min: 0, name: 'Basic', color: '#8b95a4' },
  { min: 5, name: 'Trained', color: '#4ade80' },
  { min: 10, name: 'Expert', color: '#32c5c5' },
  { min: 15, name: 'Elite', color: '#bd7bea' },
  { min: 20, name: 'Legendary', color: '#f59e0b' },
] as const;

function statTier(value: number) {
  return [...DEFAULT_STAT_TIERS].reverse().find((tier) => value >= tier.min)
    ?? DEFAULT_STAT_TIERS[0];
}

function StatIcon({ number }: { number: number }) {
  const iconProps = { size: 23, strokeWidth: 1.9, 'aria-hidden': true as const };
  switch (number) {
    case 1: return <Dumbbell {...iconProps} />;
    case 2: return <Zap {...iconProps} />;
    case 3: return <Wrench {...iconProps} />;
    case 4: return <Brain {...iconProps} />;
    case 5: return <Eye {...iconProps} />;
    default: return <span className="gm-stat-number-icon">{number}</span>;
  }
}

type StatDefinition = {
  id: string;
  name: string;
  description: string;
  display_order: number;
  stat_number: number;
  max_value: number;
};

// Cache shared definitions per campaign for the lifetime of this browser session.
// Cache the in-flight promise as well, so rapid character changes share one request.
const statDefinitionCache = new Map<string, Promise<StatDefinition[]>>();

function getStatDefinitions(campaignId: string): Promise<StatDefinition[]> {
  const cached = statDefinitionCache.get(campaignId);
  if (cached) return cached;

  const request = (async () => {
    const { data, error } = await supabase
      .from('stat_definitions')
      .select('id, name, description, display_order, stat_number, max_value')
      .eq('campaign_id', campaignId)
      .order('display_order')
      .order('stat_number');
    if (error) throw error;
    return (data ?? []) as StatDefinition[];
  })();
  statDefinitionCache.set(campaignId, request);
  // Failed requests should be retried next time, not cached indefinitely.
  void request.catch(() => {
    if (statDefinitionCache.get(campaignId) === request) statDefinitionCache.delete(campaignId);
  });
  return request;
}

type GMConsoleProps = {
  campaign: Campaign;
  onSwitchCampaign: () => void;
};

export default function GMConsole({
  campaign,
  onSwitchCampaign,
}: GMConsoleProps) {
  const [page, setPage] = useState<'live' | 'overview' | 'bank' | 'characters' | 'inventory' | 'factions' | 'logs'>(() => {
    const saved = sessionStorage.getItem('gm-page');
    return saved === 'live' || saved === 'bank' || saved === 'characters' || saved === 'inventory' || saved === 'factions' || saved === 'logs' ? saved : 'live';
  });
  const [selectedId, setSelectedId] = useState('');
  const [detailTab, setDetailTab] = useState<'stats' | 'cyberware' | 'inventory' | 'access'>('stats');
  const [search, setSearch] = useState('');

  type CharacterOption = {
    id: string;
    name: string;
    player_id: string | null;
    balance: number;
    body: number | null;
    current_hp: number | null;
  };

  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [stats, setStats] = useState<{ id: string; name: string; value: number; statNumber: number; description: string; maxValue: number }[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');

  const [invitations, setInvitations] = useState<Record<string, string>>({});

  const [inviteMessage, setInviteMessage] = useState('');
  const [resettingCharacterId, setResettingCharacterId] = useState<string | null>(null);

  const [creationQrVisible, setCreationQrVisible] = useState(false);
  const [creationToken, setCreationToken] = useState('');
  const [creationEnabled, setCreationEnabled] = useState(false);
  const [creationSaving, setCreationSaving] = useState(false);
  const [creationError, setCreationError] = useState('');

  useEffect(() => {
    let active = true;
    setCreationQrVisible(false);
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

  // Creation QR is intentionally temporary; the reusable link remains available to the GM.
  useEffect(() => {
    if (!creationQrVisible) return;
    const timeout = setTimeout(() => setCreationQrVisible(false), 30000);
    return () => clearTimeout(timeout);
  }, [creationQrVisible]);

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
        const rows = data ?? [];
        // HP is optional: an unapplied migration must never hide the roster.
        setCharacters(previous => rows.map(row => {
          const existing = previous.find(character => character.id === row.id);
          return { ...row, body: existing?.body ?? null, current_hp: existing?.current_hp ?? null };
        }));
        const { data: hpValues, error: hpError } = await supabase
          .from('characters')
          .select('id, current_hp')
          .eq('campaign_id', campaign.id);
        if (!active) return;
        const hpByCharacter = new Map((hpError ? [] : hpValues ?? []).map(row => [row.id, row.current_hp]));
        // Resolve BODY through the same stat definitions used by the Characters page.
        // Do not rely on a PostgREST embedded join, which may fail under RLS.
        let bodyByCharacter = new Map<string, number>();
        let bodyError: string | null = null;
        try {
          const definitions = await getStatDefinitions(campaign.id);
          const bodyDefinition = definitions.find(d => d.name.trim().toLowerCase() === 'body');
          if (bodyDefinition) {
            const { data: bodyValues, error: valuesError } = await supabase
              .from('character_stats')
              .select('character_id, value')
              .eq('campaign_id', campaign.id)
              .eq('stat_id', bodyDefinition.id);
            if (valuesError) throw valuesError;
            bodyByCharacter = new Map((bodyValues ?? []).map(row => [row.character_id, Number(row.value)]));
          } else {
            bodyError = 'BODY definition not found';
          }
        } catch (err) {
          bodyError = err instanceof Error ? err.message : 'Unable to load BODY';
        }
        if (!active) return;
        if (hpError) console.warn('[GM] HP loading:', hpError.message);
        if (bodyError) console.warn('[GM] BODY loading:', bodyError);
        setCharacters(previous => rows.map(row => {
          const existing = previous.find(character => character.id === row.id);
          return {
            ...row,
            body: bodyError ? (existing?.body ?? null) : (bodyByCharacter.get(row.id) ?? existing?.body ?? null),
            current_hp: hpError ? (existing?.current_hp ?? null) : (hpByCharacter.get(row.id) == null ? null : Number(hpByCharacter.get(row.id))),
          };
        }));
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
  useEffect(() => {
    let active = true;
    setStats([]);
    setStatsError('');
    if (!selected) return;

    async function loadStats() {
      setStatsLoading(true);
      try {
        // Definitions are shared by all characters; values are character-specific.
        // Run both independently so network latency doesn't accumulate.
        const [definitions, { data: values, error: valuesError }] = await Promise.all([
          getStatDefinitions(campaign.id),
          supabase
            .from('character_stats')
            .select('stat_id, value')
            .eq('campaign_id', campaign.id)
            .eq('character_id', selected!.id),
        ]);
        if (!active) return;
        if (valuesError) throw valuesError;

        const byId = new Map((values ?? []).map((entry) => [entry.stat_id, entry.value]));
        setStats(definitions
          .filter((definition) => byId.has(definition.id))
          .map((definition) => ({
            id: definition.id,
            name: definition.name,
            value: byId.get(definition.id)!,
            statNumber: definition.stat_number,
            description: definition.description,
            maxValue: definition.max_value,
          })));
      } catch (error) {
        if (active) setStatsError(error instanceof Error ? error.message : 'Could not load stats');
      } finally {
        if (active) setStatsLoading(false);
      }
    }

    void loadStats();
    return () => { active = false; };
  }, [campaign.id, selected?.id]);

  const visible = characters.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  const navigation = [
    { id: 'live', label: 'Live Session', icon: LayoutDashboard },
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'characters', label: 'Characters', icon: Users },
    { id: 'bank', label: 'Bank', icon: Landmark },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'factions', label: 'Factions', icon: Shield },
    { id: 'logs', label: 'Logs', icon: ScrollText },
  ] as const;
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
      <button type="button" disabled={!creationLink || !creationEnabled}
        onClick={() => setCreationQrVisible(visible => !visible)}>
        {creationQrVisible ? 'Hide QR Code' : 'Show QR Code'}
      </button>
      {creationQrVisible && creationEnabled && creationLink && (
        <div className="gm-qr-panel">
          <QRCodeSVG value={creationLink} size={220} marginSize={2} bgColor="#ffffff" fgColor="#111111" />
          <span>Scan to create a character · hides after 30 seconds</span>
        </div>
      )}
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
            <item.icon size={19} strokeWidth={1.9} aria-hidden="true" />
            <span className="gm-sr-only">{item.label}</span>
          </button>
        ))}
      </nav>
      <h2 className="gm-page-title">
        {(() => {
          const current = navigation.find((item) => item.id === page)!;
          return <><current.icon size={19} strokeWidth={1.9} aria-hidden="true" />{current.label}</>;
        })()}
      </h2>
      {page === 'live' ? (
        <LiveSession campaignId={campaign.id} characters={characters} onHPChanged={(id, hp) => setCharacters(previous => previous.map(c => c.id === id ? { ...c, current_hp: hp } : c))} onBalanceChanged={(id, balance) => setCharacters(previous => previous.map(c => c.id === id ? { ...c, balance } : c))} />
      ) : page === 'characters' ? (
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
                  <div className="gm-character-stats">
                    {statsLoading ? <p className="gm-muted">Loading stats...</p>
                      : statsError ? <p className="gm-stats-error" role="alert">{statsError}</p>
                      : stats.length === 0 ? <p className="gm-muted">No stats assigned to this character yet.</p>
                      : <div className="gm-stats-list">
                          {stats.map((stat) => {
                            const tier = statTier(stat.value);
                            const maximum = Math.max(stat.maxValue, 1);
                            const percent = Math.max(0, Math.min(100, (stat.value / maximum) * 100));
                            return (
                              <div className="gm-stat-row" key={stat.id}>
                                <div className="gm-stat-row-main">
                                  <div className="gm-stat-icon"><StatIcon number={stat.statNumber} /></div>
                                  <div className="gm-stat-label">
                                    <strong>{stat.name}</strong>
                                    {stat.description && <small>{stat.description}</small>}
                                  </div>
                                  <div className="gm-stat-value" style={{ color: tier.color }}>
                                    <strong>{stat.value}</strong>
                                    <small>{tier.name}</small>
                                  </div>
                                </div>
                                <div className="gm-stat-track" role="meter" aria-label={stat.name}
                                  aria-valuemin={0} aria-valuemax={maximum}
                                  aria-valuenow={Math.max(0, Math.min(maximum, stat.value))}
                                  aria-valuetext={`${stat.value} — ${tier.name}`}>
                                  <div className="gm-stat-fill" style={{ width: `${percent}%`, backgroundColor: tier.color }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>}
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
                        {!invitations[selected.id] && (
                          <button type="button" onClick={() => void generateInvitation(selected.id)}>Generate Invitation</button>
                        )}
                        {invitations[selected.id] && (
                          <div className="gm-invitation">
                            <div className="gm-qr-panel">
                              <QRCodeSVG value={invitations[selected.id]} size={220} marginSize={2} bgColor="#ffffff" fgColor="#111111" />
                              <span>Scan to access {selected.name} · valid until claimed</span>
                            </div>
                            <div className="gm-invitation-link-row">
                              <input readOnly aria-label="Character invitation" value={invitations[selected.id]} />
                              <button type="button" className="gm-invitation-copy-button"
                                aria-label="Copy character invitation link" title="Copy character invitation link"
                                onClick={() => void navigator.clipboard.writeText(invitations[selected.id])}>
                                <Copy size={23} aria-hidden="true" />
                              </button>
                            </div>
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
      ) : page === 'logs' ? (
        <CampaignLogs campaignId={campaign.id} characters={characters} />
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
