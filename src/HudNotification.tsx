import { Dices, Gift, Megaphone, MessageSquare, Package, PhoneMissed, UserRoundPlus, Wallet, RadioTower } from 'lucide-react';

export type HudNotice = { id: string; text: string; kind?: 'ghostlink'; sender?: string; artworkUrl?: string };

function content(notice: HudNotice) {
  const message = notice.text;
  if (notice.kind === 'ghostlink') return { category: 'ghostlink', title: 'GHOST//LINK', subtitle: 'NEW MESSAGE', source: notice.sender || 'Unknown Number', detail: message, icon: MessageSquare };
  if (/^\[GHOST\/\/LINK CONTACT RECEIVED\]\s*/i.test(message)) return { category: 'ghostlink', title: 'GHOST//LINK', subtitle: 'CONTACT RECEIVED', source: message.replace(/^\[GHOST\/\/LINK CONTACT RECEIVED\]\s*/i, ''), detail: 'Added to your contacts', icon: UserRoundPlus };
  if (/^\[GHOST\/\/LINK.*(?:MISSED CALL|CALL MISSED)/i.test(message)) return { category: 'ghostlink', title: 'GHOST//LINK', subtitle: 'MISSED CALL', source: message.replace(/^\[GHOST\/\/LINK[^\]]*\]\s*/i, '') || 'Unknown Number', detail: 'Unanswered call', icon: PhoneMissed };
  const dice = message.match(/^(.*?)\s+ROLLED\s+(\d*D\d+)\s*(?:→|->|:)\s*(.+)$/i);
  if (dice) return { category: 'dice', title: 'DICE ROLL', subtitle: dice[1].trim() || 'GM', source: dice[2].toUpperCase(), detail: dice[3], icon: Dices };
  const money = message.match(/^(RECEIVED|SENT|DEDUCTED)\s+([\d.,]+)\s*E\$?(?:\s+(FROM|TO)\s+(.+))?$/i);
  if (money) return { category: 'money', title: money[1].toUpperCase() === 'RECEIVED' ? 'FUNDS RECEIVED' : money[1].toUpperCase() === 'SENT' ? 'FUNDS SENT' : 'FUNDS DEDUCTED', subtitle: money[3] ? money[3].toUpperCase() + ': ' + money[4] : 'GM / SYSTEM', source: money[2] + ' E$', detail: '', icon: Wallet };
  if (/\b(?:ITEM|REWARD)\b/i.test(message)) return { category: 'item', title: /REWARD/i.test(message) ? 'REWARD RECEIVED' : 'ITEM UPDATE', subtitle: 'INVENTORY', source: message, detail: '', icon: Package };
  return { category: 'system', title: 'CAMPAIGN UPDATE', subtitle: 'GM / SYSTEM', source: '', detail: message, icon: Megaphone };
}

export default function HudNotification({ notice, queued }: { notice: HudNotice; queued: number }) {
  const data = content(notice);
  const Icon = data.icon;
  return <div className={'player-toast-card player-toast-' + data.category}>
    <div className="player-toast-icon">
      {data.category === 'item' && notice.artworkUrl
        ? <img src={notice.artworkUrl} alt="" onError={event => { event.currentTarget.style.display = 'none'; }} />
        : <Icon size={28} strokeWidth={1.8} aria-hidden="true" />}
    </div>
    <div className="player-toast-body">
      <div className="player-toast-heading"><strong>{data.title}</strong><span>{data.subtitle}</span></div>
      {data.source && <div className="player-toast-source">{data.source}</div>}
      {data.detail && <div className="player-toast-detail">{data.detail}</div>}
    </div>
    <div className="player-toast-corner"><RadioTower size={13} aria-hidden="true" />{queued > 0 && <span>+{queued}</span>}</div>
  </div>;
}
