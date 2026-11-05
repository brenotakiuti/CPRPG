import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

type PlayerCharacter = {
  id: string;
  name: string;
  balance: number;
  current_hp: number | null;
};

type PlayerViewProps = {
  token: string | null;
};

export default function PlayerView({ token }: PlayerViewProps) {
  const [character, setCharacter] = useState<PlayerCharacter | null>(null);
  const [body, setBody] = useState<number | null>(null);
  const characterLoaded = useRef(false);
  const [message, setMessage] = useState('Connecting...');

  useEffect(() => {
    let active = true;

    async function connectPlayer() {
      // Reuse the existing anonymous account if possible.
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (!active) return;

      if (sessionError) {
        setMessage(sessionError.message);
        return;
      }

      let session = sessionData.session;

      if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously();

        if (!active) return;

        if (error) {
          setMessage(error.message);
          return;
        }

        session = data.session;
      }

      if (!session) {
        setMessage('Could not establish a player session.');
        return;
      }

      if (!session.user.is_anonymous) {
        setMessage(
          'This browser is signed in with a regular account. ' +
            'Open the invitation in a separate browser or private window.'
        );
        return;
      }

      if (token) {
        const { error } = await supabase.rpc('claim_character', {
          p_token: token,
        });

        if (!active) return;

        if (error) {
          setMessage(error.message);
          return;
        }

        // Remove the one-time token from the address bar.
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search + '#player'
        );
      }

      await loadCharacter();
    }

    async function loadCharacter() {
      const { data, error } = await supabase
        .from('characters')
        .select('id, name, balance')
        .eq('player_id', (await supabase.auth.getUser()).data.user?.id)
        .maybeSingle();

      if (!active) return;

      if (error) {
        setCharacter(null);
        setMessage(error.message);
      } else if (!data) {
        // A GM may revoke access while this browser remains signed in.
        setCharacter(null);
        setMessage('No character assigned. Ask your GM for a new invitation.');
      } else {
        // HP is optional until the database migration has been applied.
        const { data: hpData } = await supabase.from('characters')
          .select('current_hp').eq('id', data.id).maybeSingle();
        if (!active) return;
        setCharacter({ ...data, current_hp: hpData?.current_hp ?? null });
        const { data: bodyStat } = await supabase.from('character_stats').select('value, stat_definitions!inner(name)').eq('character_id', data.id).eq('stat_definitions.name', 'Body').maybeSingle();
        if (!active) return;
        setBody(bodyStat ? Number(bodyStat.value) : null);
        setMessage('');
      }
      characterLoaded.current = true;
    }

    connectPlayer();

    // Simple balance synchronization for our prototype.
    const interval = setInterval(() => {
      if (active && characterLoaded.current) {
        loadCharacter();
      }
    }, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [token]);

  return (
    <div className="bank">
      <h1>Night City</h1>

      {character ? (
        <>
          <h2>{character.name}</h2>
          <p>Balance</p>
          <h1>{character.balance} €$</h1>
          {body !== null && character.current_hp !== null && <section aria-label="Character health">
            <p>HP: {character.current_hp} / {10 + 5 * body}</p>
            <div role="progressbar" aria-label="HP" aria-valuemin={0} aria-valuemax={10 + 5 * body} aria-valuenow={character.current_hp} style={{ height: 12, background: '#354456', borderRadius: 8, overflow: 'hidden' }}><div style={{ height: '100%', width: `${100 * character.current_hp / (10 + 5 * body)}%`, background: '#d84d59' }} /></div>
          </section>}
        </>
      ) : (
        <p>{message}</p>
      )}
    </div>
  );
}
