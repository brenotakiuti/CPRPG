import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Campaign } from './CampaignSelection';
import { supabase } from './supabase';
import Bank from './Bank';

type GMConsoleProps = {
  session: Session;
  campaign: Campaign;
  onSwitchCampaign: () => void;
};

export default function GMConsole({
  session,
  campaign,
  onSwitchCampaign,
}: GMConsoleProps) {
  const [page, setPage] = useState<'home' | 'bank' | 'characters'>(() => {
    const savedPage = sessionStorage.getItem('gm-page');
    return savedPage === 'bank' || savedPage === 'characters' ? savedPage : 'home';
  });

  type CharacterOption = {
    id: string;
    name: string;
    player_id: string | null;
  };

  const [characters, setCharacters] = useState<CharacterOption[]>([]);

  const [invitations, setInvitations] = useState<Record<string, string>>({});

  const [inviteMessage, setInviteMessage] = useState('');
  const [resettingCharacterId, setResettingCharacterId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadCharacters() {
      const { data, error } = await supabase
        .from('characters')
        .select('id, name, player_id')
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

  // Shared page shell for GM tools. Future tools can reuse this layout.
  function toolPage(title: string, content: ReactNode) {
    return (
      <div className="bank gm-tool-page">
        <button className="gm-back-button" onClick={() => setPage('home')}>
          ← Back to GM Console
        </button>
        <h1>{title}</h1>
        {content}
      </div>
    );
  }

  if (page === 'bank') {
    return toolPage('Bank', <Bank campaignId={campaign.id} />);
  }

  if (page === 'characters') {
    return toolPage('Character Assignment', (
      <>
      {characters.map((character) => (
        <div className="campaign-item" key={character.id}>
          <p>{character.name}</p>

          {character.player_id ? (
            <>
              <div className="character-assignment-row">
                <span className="character-assignment-status">
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Already assigned to a player
                </span>
                <button
                  type="button"
                  className="revoke-access-button"
                  title="Revoke player access"
                  aria-label={`Revoke player access for ${character.name}`}
                  disabled={resettingCharacterId !== null}
                  onClick={() => resetPlayerAccess(character.id, character.name)}
                >
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" />
                    <path d="M21 3v5h-5" />
                    <path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" />
                    <path d="M8 16H3v5" />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <>
              <button onClick={() => generateInvitation(character.id)}>
                Generate Invitation
              </button>

              {invitations[character.id] && (
                <>
                  <input readOnly value={invitations[character.id]} />

                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(invitations[character.id])
                    }
                  >
                    Copy Link
                  </button>
                </>
              )}
            </>
          )}
        </div>
      ))}

        {inviteMessage && <p className="transfer-message" role="alert">{inviteMessage}</p>}
      </>
    ));
  }

  return (
    <div className="bank">
      <h1>GM Console</h1>
      <h2>{campaign.name}</h2>
      <p>Logged in as: {session.user.email}</p>

      <button className="gm-feature-button" onClick={() => setPage('bank')}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 8V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V6" />
          <path d="M18 12h4" />
        </svg>
        Open Bank
      </button>

      <button className="gm-feature-button" onClick={() => setPage('characters')}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <path d="M5.5 16c.7-2 6.3-2 7 0M15 9h4M15 13h4M15 17h3" />
        </svg>
        Character Assignment
      </button>

      <button onClick={onSwitchCampaign}>Switch Campaign</button>
      <button onClick={() => supabase.auth.signOut()}>Log out</button>
    </div>
  );
}
