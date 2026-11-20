import './PlayerLoading.css';

type Props = { message?: string };

export default function PlayerLoading({ message = 'Retrieving data...' }: Props) {
  return <div className="player-loading" role="status" aria-live="polite" aria-label="Loading">
    <div className="player-loading-title">LOADING</div>
    <div className="player-loading-message">{message}</div>
    <div className="player-loading-segments" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <span key={index} />)}</div>
  </div>;
}
