// Display pieces of the Connection section: the permissions the Shopify app
// needs (mono tags), the result of the last save / test, the stored problem,
// and the Active line. Pure display; ConnectionSection owns the state.
import { PB, pbErrorBox, pbMeta } from '../../../pbTheme';
import { Dot, NEUTRAL, shortDate } from '../../product/status';
import { PbTag } from '../../ui';
import type { ConnectionResult } from '../../../data/websites';
import type { PbWebsite } from '../../../types';

const box = { borderRadius: PB.r.input, padding: '12px 16px', fontSize: 13, lineHeight: 1.5, color: PB.tx, overflowWrap: 'anywhere' as const, display: 'flex', flexDirection: 'column' as const, gap: 8 };
const wrapDot = { whiteSpace: 'normal' as const, fontSize: 13, color: PB.tx, fontWeight: 600 };

export function Scopes({ inventory }: { inventory: boolean }) {
  const scopes = ['write_products', 'read_products', 'write_publications', 'read_publications', ...(inventory ? ['write_inventory'] : [])];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      <span style={pbMeta}>The app needs these permissions. Only an admin or manager can save credentials.</span>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{scopes.map(s => <PbTag key={s} mono>{s}</PbTag>)}</span>
    </div>
  );
}

export function ResultBox({ result, missing }: { result: ConnectionResult; missing: string[] }) {
  if (missing.length) return (
    <div role="status" style={{ ...box, background: PB.reviewBg, border: `1px solid ${PB.reviewBd}` }}>
      <Dot color={PB.review} label={`Connected to ${result.shop_name}, but permissions are missing`} style={wrapDot} />
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{missing.map(s => <PbTag key={s} mono>{s}</PbTag>)}</span>
      <span>Add them to the app in Shopify, reinstall it, then test again.</span>
    </div>
  );
  return (
    <div role="status" style={{ ...box, background: PB.ctl, border: `1px solid ${PB.ctlBd}` }}>
      <Dot color={PB.live} label={`Connected to ${result.shop_name}`} style={wrapDot} />
      <span style={{ color: PB.tx2 }}>All needed permissions are there.</span>
    </div>
  );
}

export function LastProblem({ message }: { message: string }) {
  return (
    <div style={{ ...pbErrorBox, ...box, padding: '12px 16px' }}>
      <Dot color={PB.failed} label="Last problem" style={wrapDot} />
      <span>{message}</span>
    </div>
  );
}

export function LastConnected({ site }: { site: PbWebsite }) {
  if (!site.connected_at) return null;
  return <div style={pbMeta}>Last connected {shortDate(site.connected_at)}{site.shop_name ? ` · ${site.shop_name}` : ''}</div>;
}

/** `switching`: the way the switch is going. Not read from site.active, which is already true while the matching products are still being sent. */
export function ActiveLine({ site, switching }: { site: PbWebsite; switching: '' | 'on' | 'off' }) {
  const label = switching ? (switching === 'off' ? 'Switching off…' : site.active ? 'On — sending the products that match…' : 'Switching on…')
    : site.active ? 'On — new and re-checked products that match are sent automatically.'
      : site.connected_at ? 'Off — nothing new is sent.' : 'Off — connect the store first.';
  return <Dot color={site.active ? PB.live : NEUTRAL} label={label} style={{ whiteSpace: 'normal', fontSize: 13, color: site.active ? PB.tx : PB.tx2 }} />;
}
