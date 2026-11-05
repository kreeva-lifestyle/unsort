// One website in the list: name, domain, connection status, on/off, publishing mode.
import { T } from '../../../lib/theme';
import type { PbWebsite } from '../../types';
import { Dot } from '../product/status';

export const MODE_LABEL: Record<PbWebsite['publish_mode'], string> = {
  live: 'Publishes live', draft: 'Sends as draft', review: 'Waits for review',
};

/** Connected (green) · connection problem (red) · not connected yet (yellow). */
export function connection(s: Pick<PbWebsite, 'connected_at' | 'last_error' | 'shop_name'>): { label: string; color: string } {
  if (s.last_error) return { label: 'Connection problem', color: T.re };
  if (s.connected_at) return { label: s.shop_name ? `Connected · ${s.shop_name}` : 'Connected', color: T.gr };
  return { label: 'Not connected', color: T.yl };
}

export default function WebsiteCard({ site, onOpen }: { site: PbWebsite; onOpen: () => void }) {
  const c = connection(site);
  return (
    <button type="button" onClick={onOpen}
      style={{
        textAlign: 'left', cursor: 'pointer', fontFamily: T.sans, color: T.tx, minHeight: 44, width: '100%',
        background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: T.rLg, padding: 16,
        display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        <span style={{ fontFamily: T.sora, fontSize: 15, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site.name}</span>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, flexShrink: 0,
          background: site.active ? T.gr22 : T.glass2, color: site.active ? T.gr : T.tx3,
        }}>{site.active ? 'ON' : 'OFF'}</span>
      </div>
      <div style={{ fontSize: 12, color: T.tx3, fontFamily: T.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{site.shop_domain}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
        <Dot color={c.color} label={c.label} />
        <Dot color={site.publish_mode === 'live' ? T.gr : site.publish_mode === 'draft' ? T.bl : T.yl} label={MODE_LABEL[site.publish_mode]} />
      </div>
      {site.last_error && (
        <div style={{ fontSize: 11, color: T.re, lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{site.last_error}</div>
      )}
    </button>
  );
}
