// The editor's one hero tile (DESIGN.md §5, V2PhoneWebsite): the store domain,
// its connection state and whether products are being sent there. Text is
// onBrand only (no status colours on the gradient). The On/Off switch itself
// lives in the Connection section (it connects, checks and sends products),
// so the sending line opens that section instead of duplicating the switch.
import { PB, pbNum } from '../../../pbTheme';
import type { PbWebsite } from '../../../types';
import { PbIcon, PbTile } from '../../ui';

export default function EditorHero({ site, connLabel, onConnection }: { site: PbWebsite; connLabel: string; onConnection: () => void }) {
  const sending = site.active ? 'Sending products here' : 'Not sending — switched off';
  return (
    <PbTile variant="hero" as="section" aria-label="Store" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
        <span style={{ ...pbNum, fontSize: 13, fontWeight: 500, lineHeight: 1.5, overflowWrap: 'anywhere', minWidth: 0 }}>{site.shop_domain || '—'}</span>
        <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{connLabel}</span>
      </div>
      <button type="button" onClick={onConnection} className="pb-pill" aria-label={`${sending}. Change it in Connection`}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 48, padding: '8px 12px 8px 16px', boxSizing: 'border-box',
          background: PB.activeFill, border: `1px solid ${PB.activeBd}`, borderRadius: PB.r.btn, color: PB.onBrand,
          fontFamily: PB.sans, fontSize: 15, fontWeight: 600, lineHeight: 1.35, textAlign: 'left', cursor: 'pointer',
        }}>
        <span style={{ flex: 1, minWidth: 0 }}>{sending}</span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{site.active ? 'On' : 'Off'}</span>
        <PbIcon name="chevronRight" size={16} />
      </button>
    </PbTile>
  );
}
