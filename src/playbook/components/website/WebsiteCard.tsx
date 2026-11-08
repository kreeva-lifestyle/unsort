// One website in the list as a bento tile: name, domain, connection status
// (dot + label), On/Off and publishing mode as tags, and the last connection
// problem. A website that needs action gets the tinted tile (failed / review).
import { PB, pbMeta, pbNum, pbTileTitle } from '../../pbTheme';
import type { PbWebsite } from '../../types';
import { Dot } from '../product/status';
import { PbIcon, PbTag, PbTile, type PbSpan } from '../ui';
import { MODE_LABEL } from './shell/sections';

export { MODE_LABEL };

/** Connected · connection problem · not connected yet (layout-and-components.md §6). */
export function connection(s: Pick<PbWebsite, 'connected_at' | 'last_error' | 'shop_name'>): { label: string; color: string; tint?: 'review' | 'failed' } {
  if (s.last_error) return { label: 'Connection problem', color: PB.failed, tint: 'failed' };
  if (s.connected_at) return { label: s.shop_name ? `Connected · ${s.shop_name}` : 'Connected', color: PB.live };
  return { label: 'Not connected', color: PB.review, tint: 'review' };
}

export default function WebsiteCard({ site, onOpen, span }: { site: PbWebsite; onOpen: () => void; span?: PbSpan }) {
  const c = connection(site);
  return (
    <PbTile as="button" flat variant={c.tint ?? 'default'} span={span} onClick={onOpen} data-open-id={site.id}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 152, color: PB.tx }}>
      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', minWidth: 0 }}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="pb-clamp2" style={{ ...pbTileTitle, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{site.name}</span>
          <span style={{ ...pbMeta, ...pbNum, overflowWrap: 'anywhere' }}>{site.shop_domain || '—'}</span>
        </span>
        <span style={{ color: PB.tx3, display: 'inline-flex', paddingTop: 4, flexShrink: 0 }}><PbIcon name="chevronRight" size={16} /></span>
      </span>
      <Dot color={c.color} label={c.label} style={{ color: PB.tx, fontSize: 13, whiteSpace: 'normal', overflowWrap: 'anywhere' }} />
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 'auto' }}>
        <PbTag>{site.active ? 'On' : 'Off · nothing is sent'}</PbTag>
        <PbTag>{MODE_LABEL[site.publish_mode]}</PbTag>
      </span>
      {site.last_error && (
        <span style={{ fontSize: 13, lineHeight: 1.5, color: PB.tx, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}>
          {site.last_error}
        </span>
      )}
    </PbTile>
  );
}
