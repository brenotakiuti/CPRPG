import { useEffect, useState } from 'react';
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
  const [page, setPage] = useState<'home' | 'bank'>(() => {
    return sessionStorage.getItem('gm-page') === 'bank' ? 'bank' : 'home';
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
    async function loadCharacters() {
      const { data, error } = await supabase
        .from('characters')
        .select('id, name, player_id')
        .eq('campaign_id', campaign.id)
        .order('name');

      if (error) {
        setInviteMessage(error.message);
      } else {
        setCharacters(data ?? []);
      }
    }

    loadCharacters();
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
      `Revoke access to ${characterName} and generate a new invitation? The previous player will lose access.`
    )) return;

    setInviteMessage('');
    setResettingCharacterId(characterId);

    try {
      // One atomic RPC revokes access and issues the replacement invitation.
      const { data: token, error } = await supabase.rpc(
        'reset_character_player_access',
        { p_character_id: characterId }
      );

      if (error) {
        setInviteMessage(error.message);
        return;
      }
      if (!token) {
        setInviteMessage('Could not generate a new invitation.');
        return;
      }

      const url = new URL(window.location.href);
      url.hash = `player=${token}`;
      setCharacters((previous) =>
        previous.map((character) =>
          character.id === characterId ? { ...character, player_id: null } : character
        )
      );
      setInvitations((previous) => ({ ...previous, [characterId]: url.toString() }));
      setInviteMessage(`Access revoked for ${characterName}. Copy the new invitation below.`);
    } catch {
      setInviteMessage('Could not reset player access. Please try again.');
    } finally {
      setResettingCharacterId(null);
    }
  }

  useEffect(() => {
    sessionStorage.setItem('gm-page', page);
  }, [page]);

  if (page === 'bank') {
    return (
      <div className="bank">
        <button onClick={() => setPage('home')}>← Back to GM Console</button>

        <Bank campaignId={campaign.id} />
      </div>
    );
  }

  return (
    <div className="bank">
      <h1>GM Console</h1>

      <h2>{campaign.name}</h2>

      <p>Logged in as: {session.user.email}</p>

      {/* ChatGPT's first GitHub integration test: Lucide-style Wallet icon on the Bank button. */}
      <button onClick={() => setPage('bank')}>
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ verticalAlign: 'middle', marginRight: '8px' }}
        >
          <path d="M20 8V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V6" />
          <path d="M18 12h4" />
        </svg>
        Open Bank
      </button>

      <h2>Player Invitations</h2>

      {characters.map((character) => (
        <div className="campaign-item" key={character.id}>
          <p>{character.name}</p>

          {character.player_id ? (
            <>
              <p>Already assigned to a player</p>
              <button
                disabled={resettingCharacterId !== null}
                onClick={() => resetPlayerAccess(character.id, character.name)}
              >
                {resettingCharacterId === character.id
                  ? 'Resetting...'
                  : 'Revoke Access & Generate New Link'}
              </button>
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

      <p className="transfer-message">{inviteMessage}</p>

      <button onClick={onSwitchCampaign}>Switch Campaign</button>

      <button onClick={() => supabase.auth.signOut()}>Log out</button>
    </div>
  );
}
