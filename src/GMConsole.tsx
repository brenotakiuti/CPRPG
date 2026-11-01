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

      <button onClick={() => setPage('bank')}>Open Bank</button>

      <h2>Player Invitations</h2>

      {characters.map((character) => (
        <div className="campaign-item" key={character.id}>
          <p>{character.name}</p>

          {character.player_id ? (
            <p>Already assigned to a player</p>
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
