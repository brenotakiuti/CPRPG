import { useEffect, useState } from 'react';
import { supabase } from './supabase';

type Props = { token: string };

export default function CharacterCreation({ token }: Props) {
  const [status, setStatus] = useState('Connecting...');
  const [campaignName, setCampaignName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function connect() {
      const { data: existing, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) { if (active) setStatus(sessionError.message); return; }
      let session = existing.session;
      if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) { if (active) setStatus(error.message); return; }
        session = data.session;
      }
      if (!active) return;
      const { data, error } = await supabase.rpc('get_character_creation_campaign', {
        p_token: token,
      });
      if (!active) return;
      if (error) { setStatus(error.message); return; }
      if (!data?.[0]) { setStatus('Invalid character creation link.'); return; }
      // The GM may preview their own campaign even while creation is closed.
      const { data: ownedCampaign } = session.user.is_anonymous
        ? { data: null }
        : await supabase.from('campaigns').select('id')
            .eq('id', data[0].campaign_id)
            .eq('gm_id', session.user.id).maybeSingle();
      if (!active) return;
      if (!data[0].creation_enabled && !ownedCampaign) {
        setStatus('Character creation is disabled for this campaign.');
        return;
      }
      setCampaignName(data[0].campaign_name);
      setStatus('');
    }
    void connect();
    return () => { active = false; };
  }, [token]);

  return (
    <div className="bank">
      <h1>Character Creation</h1>
      {campaignName && <h2>{campaignName}</h2>}
      {status && <p role="status">{status}</p>}
    </div>
  );
}
