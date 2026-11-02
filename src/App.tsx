import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import PlayerView from './PlayerView';
import CharacterCreation from './CharacterCreation';
import { supabase } from './supabase';
import CampaignSelection from './CampaignSelection';
import type { Campaign } from './CampaignSelection';
import GMConsole from './GMConsole';

import './App.css';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);

  const [creationToken] = useState(() => window.location.hash.startsWith('#create=')
    ? window.location.hash.slice('#create='.length) : null);

  const [playerRoute] = useState(() => {
    const hash = window.location.hash;

    if (hash === '#player') {
      return { isPlayer: true, token: null };
    }

    if (hash.startsWith('#player=')) {
      return {
        isPlayer: true,
        token: hash.slice('#player='.length),
      };
    }

    return { isPlayer: false, token: null };
  });

  useEffect(() => {
    let active = true;

    async function initialize() {
      const { data } = await supabase.auth.getSession();

      if (!active) return;

      setSession(data.session);

      if (data.session) {
        const savedId = sessionStorage.getItem('active-campaign');
        const savedUser = sessionStorage.getItem('campaign-user');

        if (savedId && savedUser === data.session.user.id) {
          const { data: savedCampaign } = await supabase
            .from('campaigns')
            .select('id, name, gm_id')
            .eq('id', savedId)
            .single();

          if (!active) return;

          if (savedCampaign) {
            setCampaign(savedCampaign);
          } else {
            sessionStorage.removeItem('active-campaign');
            sessionStorage.removeItem('campaign-user');
            sessionStorage.removeItem('gm-page');
          }
        }
      }

      if (active) setLoading(false);
    }

    initialize();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!active) return;

        setSession(newSession);

        if (event === 'SIGNED_OUT') {
          setCampaign(null);
          sessionStorage.removeItem('active-campaign');
          sessionStorage.removeItem('campaign-user');
          sessionStorage.removeItem('gm-page');
        }
      }
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleLogin() {
    setLoggingIn(true);
    setMessage('');

    // A new login always starts at campaign selection.
    setCampaign(null);
    sessionStorage.removeItem('active-campaign');
    sessionStorage.removeItem('campaign-user');
    sessionStorage.removeItem('gm-page');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setPassword('');
    }

    setLoggingIn(false);
  }

  function selectCampaign(selected: Campaign) {
    setCampaign(selected);

    sessionStorage.setItem('active-campaign', selected.id);
    sessionStorage.setItem('campaign-user', session!.user.id);
    sessionStorage.setItem('gm-page', 'home');
  }

  function switchCampaign() {
    setCampaign(null);

    sessionStorage.removeItem('active-campaign');
    sessionStorage.removeItem('campaign-user');
    sessionStorage.removeItem('gm-page');
  }

  if (creationToken !== null) {
    return <CharacterCreation token={creationToken} />;
  }

  if (playerRoute.isPlayer) {
    return <PlayerView token={playerRoute.token} />;
  }

  if (loading) {
    return (
      <div className="bank">
        <p>Loading...</p>
      </div>
    );
  }

  // Screen 1: Login
  if (!session) {
    return (
      <div className="bank">
        <h1>Night City</h1>
        <h2>Game Master Login</h2>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="GM email"
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />

        <button onClick={handleLogin} disabled={loggingIn}>
          {loggingIn ? 'Logging in...' : 'Log in'}
        </button>

        <p className="transfer-message">{message}</p>
      </div>
    );
  }

  // Screen 2: Campaign selection
  if (!campaign) {
    return <CampaignSelection session={session} onSelect={selectCampaign} />;
  }

  // Screen 3: GM Main
  return (
    <GMConsole
      campaign={campaign}
      onSwitchCampaign={switchCampaign}
    />
  );
}

export default App;
