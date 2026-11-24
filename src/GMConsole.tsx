import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useGMArtworkCache } from './useGMArtworkCache';
import { GMControlDock, GMUtilityWindow, type UtilityId } from './GMControlDock';
import { QRCodeSVG } from 'qrcode.react';
import { Brain, Dumbbell, Eye, Landmark, LayoutDashboard, Settings, LockKeyhole, Copy, Settings2, ScrollText, Package, Users, Wrench, Zap, Slice, ChevronsUpDown, Check } from 'lucide-react';
import type { Campaign } from './CampaignSelection';
import { supabase } from './supabase';
import Bank from './Bank';
import GMInventory from './GMInventory';
import LiveSession from './LiveSession';
import CampaignLogs from './CampaignLogs';
import Ripperdoc from './Ripperdoc';
import GMPhone from './GMPhone';
import GMCallSpotlight from './GMCallSpotlight';
import CombatMaps from './CombatMaps';

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
  useGMArtworkCache();
  const [page, setPage] = useState<'live' | 'overview' | 'bank' | 'characters' | 'inventory' | 'ripperdoc' | 'logs' | 'phone' | 'combat'>(() => {
    const saved = sessionStorage.getItem('gm-page:' + campaign.id);
    return saved === 'map-editor' ? 'combat' : saved === 'overview' || saved === 'live' || saved === 'bank' || saved === 'characters' || saved === 'inventory' || saved === 'ripperdoc' || saved === 'logs' || saved === 'phone' || saved === 'combat' ? saved : 'phone';
  });
  // Mount data-heavy tools on first visit, then retain their data and Realtime subscriptions.
  const [visitedTools, setVisitedTools] = useState<string[]>(() => {
    const saved = sessionStorage.getItem('gm-page:' + campaign.id) ?? 'phone';
    return ['live', 'bank', 'logs', 'inventory', 'ripperdoc', 'phone', 'combat', 'map-editor'].includes(saved) ? [saved === 'map-editor' ? 'combat' : saved] : [];
  });
  const openPage = (next: typeof page) => {
    setPage(next);
    if (['live', 'bank', 'logs', 'inventory', 'ripperdoc', 'phone', 'combat'].includes(next)) {
      setVisitedTools(previous => previous.includes(next) ? previous : [...previous, next]);
    }
  };
  const [appSwitcherOpen, setAppSwitcherOpen] = useState(false);
  const [utilityWindows, setUtilityWindows] = useState<UtilityId[]>([]);
  const [focusedUtility, setFocusedUtility] = useState<UtilityId | null>(null);
  const openUtility = (id: UtilityId) => {
    setUtilityWindows(previous => previous.includes(id) ? previous : [...previous, id]);
    setFocusedUtility(id);
    if (['bank', 'inventory', 'ripperdoc'].includes(id)) setVisitedTools(previous => previous.includes(id) ? previous : [...previous, id]);
  };
  const closeUtility = (id: UtilityId) => {
    setUtilityWindows(previous => previous.filter(item => item !== id));
    setFocusedUtility(previous => previous === id ? null : previous);
  };
  const utilityWindow = (id: UtilityId, children: ReactNode) => utilityWindows.includes(id) ? (
    <GMUtilityWindow key={id} title={{bank:'Bank',ripperdoc:'Ripperdoc',inventory:'Inventory',overview:'Campaign Settings'}[id]} active={focusedUtility === id} onFocus={() => setFocusedUtility(id)} onClose={() => closeUtility(id)} offset={utilityWindows.indexOf(id)}>{children}</GMUtilityWindow>
  ) : null;
  const [tacticalTab, setTacticalTab] = useState<'broadcast' | 'editor'>('broadcast');
  const [editorVisited, setEditorVisited] = useState(false);
  const [phoneUnread, setPhoneUnread] = useState(0);
  const refreshPhoneUnread = useCallback(async () => {
    const result = await supabase.rpc('phone_gm_unread', { p_campaign_id: campaign.id });
    if (result.error) {
      console.warn('[Ghost//Link] GM unread count unavailable:', result.error.message);
      return;
    }
    const rows = (result.data || []) as Array<{ unread_count: number }>;
    setPhoneUnread(rows.reduce((sum, row) => sum + Number(row.unread_count || 0), 0));
  }, [campaign.id]);
  useEffect(() => {
    void refreshPhoneUnread();
    const channel = supabase.channel('gm-phone-badge-' + campaign.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'phone_messages', filter: 'campaign_id=eq.' + campaign.id }, () => { void refreshPhoneUnread(); })
      .subscribe();
    const focus = () => { void refreshPhoneUnread(); };
    window.addEventListener('focus', focus);
    return () => { window.removeEventListener('focus', focus); void supabase.removeChannel(channel); };
  }, [campaign.id, refreshPhoneUnread]);
  const [selectedId, setSelectedId] = useState(() => sessionStorage.getItem('gm-selected-character:' + campaign.id) || '');
  const [detailTab, setDetailTab] = useState<'stats' | 'cyberware' | 'inventory' | 'access'>(() => {
    const saved = sessionStorage.getItem('gm-character-tab:' + campaign.id);
    return saved === 'cyberware' || saved === 'inventory' || saved === 'access' ? saved : 'stats';
  });
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
  const [creationQrSeconds, setCreationQrSeconds] = useState(30);
  const [creationToken, setCreationToken] = useState('');
  const [creationEnabled, setCreationEnabled] = useState(false);
  const [creationSaving, setCreationSaving] = useState(false);
  const [creationError, setCreationError] = useState('');
  const [startingPoints, setStartingPoints] = useState(30);
  const [startingMoney, setStartingMoney] = useState('0');
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesMessage, setRulesMessage] = useState('');

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

  useEffect(() => {
    let active = true;
    setRulesLoading(true);
    setRulesMessage('');
    async function loadRules() {
      const { data, error } = await supabase.from('campaigns')
        .select('starting_attribute_points, starting_money')
        .eq('id', campaign.id).single();
      if (!active) return;
      if (error) setRulesMessage(error.message);
      else {
        setStartingPoints(data.starting_attribute_points);
        setStartingMoney(String(data.starting_money));
      }
      setRulesLoading(false);
    }
    void loadRules();
    return () => { active = false; };
  }, [campaign.id]);

  async function saveCreationRules() {
    const amount = Number(startingMoney);
    if (rulesSaving || rulesLoading || !Number.isInteger(startingPoints) ||
      startingPoints < 15 || startingPoints > 100 ||
      !/^\d+$/.test(startingMoney.trim()) || !Number.isSafeInteger(amount) || amount < 0) return;
    setRulesSaving(true);
    setRulesMessage('');
    const { data, error } = await supabase.from('campaigns')
      .update({ starting_attribute_points: startingPoints, starting_money: amount })
      .eq('id', campaign.id).eq('gm_id', campaign.gm_id)
      .select('starting_attribute_points, starting_money').single();
    if (error) setRulesMessage(error.message);
    else {
      setStartingPoints(data.starting_attribute_points);
      setStartingMoney(String(data.starting_money));
      setRulesMessage('Settings saved. New characters will use these values.');
    }
    setRulesSaving(false);
  }

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
    const expiresAt = Date.now() + 30000;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setCreationQrSeconds(remaining);
      if (remaining === 0) setCreationQrVisible(false);
    }, 250);
    return () => clearInterval(interval);
  }, [creationQrVisible]);

  function toggleCreationQr() {
    if (!creationQrVisible) setCreationQrSeconds(30);
    setCreationQrVisible(previous => !previous);
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
    sessionStorage.setItem('gm-page:' + campaign.id, page);
  }, [page, campaign.id]);
  useEffect(() => { sessionStorage.setItem('gm-selected-character:' + campaign.id, selectedId); }, [campaign.id, selectedId]);
  useEffect(() => { sessionStorage.setItem('gm-character-tab:' + campaign.id, detailTab); }, [campaign.id, detailTab]);

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
    { id: 'characters', label: 'Characters', icon: Users },
    { id: 'bank', label: 'Bank', icon: Landmark },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'phone', label: 'Ghost//Link', icon: null },
    { id: 'ripperdoc', label: 'Ripperdoc', icon: Slice },
    { id: 'combat', label: 'Tactical//Feed', icon: null },
    { id: 'overview', label: 'Campaign Settings', icon: Settings },
  ] as const;
  const creationControls = (
    <div className="gm-invitations-layout">
      <section className="gm-invitations-access" aria-label="Character creation access">
        <div className="gm-invitations-access-header">
          <div>
            <h3>Character Creation Access</h3>
            <p>Share this link to let players create a new character.</p>
          </div>
          <div className="creation-toggle-group">
            <span>{creationEnabled ? 'Enabled' : 'Disabled'}</span>
            <button type="button" className={creationEnabled ? 'creation-switch is-enabled' : 'creation-switch'}
              role="switch" aria-checked={creationEnabled} aria-label="Enable character creation"
              disabled={!creationToken || creationSaving} onClick={() => void toggleCreation()}>
              <span className="creation-switch-thumb" />
            </button>
          </div>
        </div>
        <label className="gm-invitations-link-label" htmlFor="gm-creation-link">INVITATION LINK</label>
        <div className="creation-link-row">
          <input id="gm-creation-link" readOnly aria-label="Character creation link" value={creationLink}
            placeholder="Loading link..." title={creationLink} />
          <button type="button" className="creation-copy-button" aria-label="Copy character creation link"
            title="Copy character creation link" disabled={!creationLink}
            onClick={() => void navigator.clipboard.writeText(creationLink)}>
            <Copy size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="gm-invitations-link-help">Anyone with this link can create a character while access is enabled.</p>
        <button type="button" className="gm-invitations-qr-toggle" disabled={!creationLink || !creationEnabled}
          onClick={toggleCreationQr}>
          {creationQrVisible ? 'Hide QR Code' : 'Show QR Code'}
        </button>
        {creationError && <p className="creation-error" role="alert">{creationError}</p>}
      </section>
      <section className="gm-invitations-qr" aria-label="QR Code">
        <h3>QR Code</h3>
        <div className="gm-invitations-qr-body">
          <div className="gm-invitations-qr-image">
            {creationQrVisible && creationEnabled && creationLink ? (
              <QRCodeSVG value={creationLink} size={126} marginSize={2} bgColor="#ffffff" fgColor="#111111" />
            ) : (
              <LockKeyhole size={38} strokeWidth={1.6} aria-label="QR code locked" />
            )}
          </div>
          <div className="gm-invitations-qr-countdown" aria-live="off">
            {creationQrVisible && creationEnabled && creationLink ? `00:${String(creationQrSeconds).padStart(2, '0')}` : '\u00a0'}
          </div>
        </div>
      </section>
    </div>
  );

  const campaignSettingsContent = (
        <div className="gm-dashboard-panel gm-overview">
          <section className="gm-campaign-identity"><h3>Campaign</h3><strong>{campaign.name}</strong><small>GM control system · Active campaign</small></section>
          <section className="gm-campaign-shortcuts"><h3>Campaign tools</h3><p>Open other GM tools without the old top navigation.</p><div>{navigation.filter(item=>item.id!=='phone'&&item.id!=='combat'&&item.id!=='overview').map(item=><button type="button" key={item.id} onClick={()=>{if(item.id==='bank'||item.id==='inventory'||item.id==='ripperdoc'){openUtility(item.id)}else{openPage(item.id)}closeUtility('overview')}}>{item.icon&&<item.icon size={17}/>} {item.label}</button>)}<button type="button" onClick={()=>{openPage('logs');closeUtility('overview')}}><ScrollText size={17}/> Logs</button></div></section>
          {creationControls}
          <section className="gm-invitations-settings" aria-label="Character creation settings">
            <div className="gm-invitations-settings-heading">
              <h3><Settings2 size={18} aria-hidden="true" /> Character Creation Settings</h3>
              <p>Starting conditions for new characters in this campaign.</p>
            </div>
            <div className="gm-invitations-settings-fields">
              <label>
                <span>Attribute Point Pool</span>
                <div className="gm-invitations-points-row">
                  <input type="range" min="15" max="100" value={startingPoints}
                    disabled={rulesLoading || rulesSaving}
                    onChange={e => { setStartingPoints(Number(e.target.value)); setRulesMessage(''); }} />
                  <strong>{startingPoints}</strong>
                </div>
                <small>Total points available across five attributes.</small>
              </label>
              <label>
                <span>Starting Money</span>
                <div className="gm-invitations-money-row">
                  <input type="number" min="0" step="1" value={startingMoney}
                    disabled={rulesLoading || rulesSaving}
                    onChange={e => { setStartingMoney(e.target.value); setRulesMessage(''); }} />
                  <strong>E$</strong>
                </div>
                <small>Initial balance assigned when a character is created.</small>
              </label>
            </div>
            <div className="gm-invitations-settings-footer">
              {rulesMessage && <p role="status">{rulesMessage}</p>}
              <button type="button" disabled={rulesLoading || rulesSaving ||
                !/^\d+$/.test(startingMoney.trim()) ||
                !Number.isSafeInteger(Number(startingMoney)) || Number(startingMoney) < 0}
                onClick={() => void saveCreationRules()}>
                {rulesSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </section>
          <section className="gm-invitations-controls">
            <div><h3>Campaign Controls</h3><p>Switch campaigns or end your GM session</p></div>
            <div className="gm-account-actions">
              <button onClick={onSwitchCampaign}>Switch Campaign</button>
              <button onClick={() => void supabase.auth.signOut()}>Log Out</button>
            </div>
          </section>
        </div>
      );
  return (
    <div className="gm-dashboard">
      <header className="gm-app-header">
        <div className="gm-app-switcher">
          <button type="button" className="gm-app-switcher-trigger" aria-label="Switch application" aria-expanded={appSwitcherOpen} onClick={()=>setAppSwitcherOpen(v=>!v)}>
            <img src={page==='combat'?'/tactical-feed-icon.svg':'/ghost-link-icon.svg'} alt="" />
            <span className="gm-app-brand-copy"><strong>{page==='combat'?'TACTICAL//FEED':'GHOST//LINK'}</strong><small>{page==='combat'?'A GHOST//LINK SYSTEMS DIVISION':'GM COMMUNICATIONS WORKSTATION'}</small></span>
            <ChevronsUpDown size={17} aria-hidden="true"/>
          </button>
          {appSwitcherOpen && <div className="gm-app-switcher-menu" role="menu" aria-label="Applications">
            {([{id:'phone',name:'Ghost//Link',desc:'Communications workstation',image:'/ghost-link-icon.svg'},{id:'combat',name:'Tactical//Feed',desc:'Combat management',image:'/tactical-feed-icon.svg'}] as const).map(app=><button key={app.id} type="button" role="menuitem" onClick={()=>{openPage(app.id);setAppSwitcherOpen(false)}}><img src={app.image} alt=""/><span><strong>{app.name}{app.id==='phone' && phoneUnread>0 && <b className="gm-app-unread" aria-label={`${phoneUnread} unread messages`}>{phoneUnread>99?'99+':phoneUnread}</b>}</strong><small>{app.desc}</small></span>{page===app.id&&<Check size={17}/>}</button>)}
          </div>}
        </div>
        <div className="gm-app-header-actions">
          <button type="button" className="gm-app-log-button" onClick={()=>openPage('logs')} title="Campaign Logs" aria-label="Campaign Logs"><ScrollText size={19}/><span>Log</span></button>
          <span className="gm-app-online">● <span>GM ONLINE</span></span>
        </div>
      </header>
      {page !== 'phone' && page !== 'combat' && <h2 className="gm-page-title">
        {(() => {
          const current = page === 'logs' ? {id:'logs',label:'Logs',icon:ScrollText} : navigation.find((item) => item.id === page)!;
          return <>{current.icon ? <current.icon size={19} strokeWidth={1.9} aria-hidden="true" /> : null}{current.label}</>;
        })()}
      </h2>}
      {page === 'live' ? null : page === 'characters' ? (
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
      ) : page === 'bank' || page === 'logs' ? null : page === 'overview' ? (utilityWindows.includes('overview') ? null : campaignSettingsContent) : page === 'inventory' || page === 'ripperdoc' || page === 'phone' ? null : null}
      {<div style={{ display: page === 'live' ? undefined : 'none' }}><LiveSession campaignId={campaign.id} characters={characters} onHPChanged={(id, hp) => setCharacters(previous => previous.map(c => c.id === id ? { ...c, current_hp: hp } : c))} onBalanceChanged={(id, balance) => setCharacters(previous => previous.map(c => c.id === id ? { ...c, balance } : c))} /></div>}
      {visitedTools.includes('bank') && (utilityWindows.includes('bank') ? utilityWindow('bank', <div className="gm-dashboard-panel"><Bank campaignId={campaign.id} /></div>) : <div style={{ display: page === 'bank' ? undefined : 'none' }}><div className="gm-dashboard-panel"><Bank campaignId={campaign.id} /></div></div>)}
      {visitedTools.includes('logs') && <div style={{ display: page === 'logs' ? undefined : 'none' }}><CampaignLogs campaignId={campaign.id} characters={characters} /></div>}
      {visitedTools.includes('inventory') && (utilityWindows.includes('inventory') ? utilityWindow('inventory', <GMInventory campaignId={campaign.id} />) : <div style={{ display: page === 'inventory' ? undefined : 'none' }}><GMInventory campaignId={campaign.id} /></div>)}
      {visitedTools.includes('phone') && <div style={{ display: page === 'phone' ? undefined : 'none' }}><GMPhone campaignId={campaign.id} onRead={refreshPhoneUnread} /></div>}
      {visitedTools.includes('ripperdoc') && (utilityWindows.includes('ripperdoc') ? utilityWindow('ripperdoc', <Ripperdoc characters={characters} />) : <div style={{ display: page === 'ripperdoc' ? undefined : 'none' }}><Ripperdoc characters={characters} /></div>)}
      {visitedTools.includes('combat') && <div style={{ display: page === 'combat' ? undefined : 'none' }}>
        
        <div className="gm-tactical-mode-tabs" role="tablist" aria-label="Tactical Feed mode">
          <button type="button" role="tab" aria-selected={tacticalTab === 'broadcast'} className={tacticalTab === 'broadcast' ? 'active' : ''} onClick={() => setTacticalTab('broadcast')}>Map Broadcast</button>
          <button type="button" role="tab" aria-selected={tacticalTab === 'editor'} className={tacticalTab === 'editor' ? 'active' : ''} onClick={() => { setEditorVisited(true); setTacticalTab('editor'); }}>Map Editor</button>
        </div>
        <div role="tabpanel" aria-label="Map Broadcast" style={{ display: tacticalTab === 'broadcast' ? undefined : 'none' }}><CombatMaps key={'combat-'+campaign.id} campaignId={campaign.id} mode="combat" /></div>
        {editorVisited && <div role="tabpanel" aria-label="Map Editor" style={{ display: tacticalTab === 'editor' ? undefined : 'none' }}><CombatMaps key={'editor-'+campaign.id} campaignId={campaign.id} mode="editor" /></div>}
      </div>}
      <GMControlDock open={utilityWindows} onOpen={openUtility} />
      {utilityWindow('overview', campaignSettingsContent)}
      <GMCallSpotlight campaignId={campaign.id} />
    </div>
  );
}
