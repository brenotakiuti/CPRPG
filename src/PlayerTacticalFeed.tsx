import './PlayerTacticalFeed.css';

export default function PlayerTacticalFeed({ onBack }: { onBack: () => void }) {
  return <section className="tactical-feed" aria-label="Tactical Feed">
    <div className="tactical-feed-accent" />
    <header className="tactical-feed-header">
      <div><div className="tactical-feed-brand"><img src="/ghost-link-icon.svg" alt="" /> GHOST // LINK — NET 07</div><h2>TACTICAL FEED</h2></div>
      <span className="tactical-feed-offline">○ OFFLINE</span>
    </header>
    <div className="tactical-feed-meta"><span>SECTOR <strong>UNAVAILABLE</strong></span><span>NO SIGNAL</span></div>
    <div className="tactical-feed-screen">
      <div className="tactical-feed-grid" /><div className="tactical-feed-radar"><div className="tactical-feed-sweep" /></div>
      <div className="tactical-feed-static" /><div className="tactical-feed-interference" />
      <div className="tactical-feed-screen-label">◈ AREA SURVEILLANCE // STANDBY</div>
      <div className="tactical-feed-center"><div className="tactical-feed-symbol">⌁</div><strong>NO TACTICAL FEED</strong><p>SIGNAL SOURCE NOT DETECTED<br />AWAITING GM TRANSMISSION</p><div className="tactical-feed-dots"><i /><i /><i /><i /><i /></div></div>
      <div className="tactical-feed-bottom"><span>SCAN ACTIVE</span><span>UPLINK STATUS: IDLE</span></div>
    </div>
    <footer className="tactical-feed-footer"><span>GHOSTLINK OS // 2077</span><button type="button" onClick={onBack}>← BACK</button></footer>
  </section>;
}
