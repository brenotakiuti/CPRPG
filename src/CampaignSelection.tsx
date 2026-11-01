import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type Campaign = {
  id: string;
  name: string;
  gm_id: string;
};

type CampaignSelectionProps = {
  session: Session;
  onSelect: (campaign: Campaign) => void;
};

export default function CampaignSelection({
  session,
  onSelect,
}: CampaignSelectionProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignName, setCampaignName] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadCampaigns() {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name, gm_id')
        .order('created_at', { ascending: false });

      if (error) {
        setMessage(error.message);
      } else {
        setCampaigns(data ?? []);
      }
    }

    loadCampaigns();
  }, []);

  async function createCampaign() {
    const name = campaignName.trim();

    if (!name) {
      setMessage('Enter a campaign name.');
      return;
    }

    setSaving(true);
    setMessage('');

    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        name,
        gm_id: session.user.id,
      })
      .select('id, name, gm_id')
      .single();

    if (error) {
      setMessage(error.message);
    } else {
      setCampaigns((previous) => [data, ...previous]);
      setCampaignName('');
      setMessage('Campaign created.');
    }

    setSaving(false);
  }

  return (
    <div className="bank">
      <h1>Select Campaign</h1>

      <h2>Your Campaigns</h2>

      {campaigns.length === 0 ? (
        <p>No campaigns yet.</p>
      ) : (
        <div className="campaign-list">
          {campaigns.map((campaign) => (
            <button key={campaign.id} onClick={() => onSelect(campaign)}>
              {campaign.name}
            </button>
          ))}
        </div>
      )}

      <h2>Create Campaign</h2>

      <label htmlFor="campaign-name">Campaign name</label>

      <input
        id="campaign-name"
        value={campaignName}
        onChange={(e) => setCampaignName(e.target.value)}
        placeholder="e.g. Night City 2077"
      />

      <button onClick={createCampaign} disabled={saving}>
        {saving ? 'Creating...' : 'Create Campaign'}
      </button>

      <p className="transfer-message">{message}</p>

      <button onClick={() => supabase.auth.signOut()}>Log out</button>
    </div>
  );
}
