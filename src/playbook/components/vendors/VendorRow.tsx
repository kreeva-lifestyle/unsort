// One vendor as a glass row (DESIGN.md §7, no blur): initial avatar, name +
// mono code, product count, status dot + label, the Telegram channel with
// its daily check time (VendorTg), notes; then Edit and
// Deactivate / Activate as their own 44px buttons (never nested in a
// clickable row). Phone (`compact`): only Edit on the row, as in the mock-up;
// Deactivate / Activate sits in the Edit sheet, away from its Save.
import { PB, pbMeta, pbName, pbNum, pbRow } from '../../pbTheme';
import { Dot, NEUTRAL } from '../product/status';
import PbButton from '../ui/PbButton';
import VendorTg from './VendorTg';
import type { VendorRow as Vendor } from '../../data/vendors';

/** First character (whole grapheme for Hindi when the browser can split one), upper-cased. */
const initial = (name: string) => {
  const t = name.trim();
  if (!t) return '?';
  type Seg = { segment(s: string): Iterable<{ segment: string }> };
  const Ctor = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => Seg }).Segmenter;
  const first = Ctor ? [...new Ctor(undefined, { granularity: 'grapheme' }).segment(t)][0]?.segment : Array.from(t)[0];
  return (first ?? '?').toUpperCase();
};

export default function VendorRow({ v, busy, onEdit, onToggle, compact }: {
  v: Vendor; busy: string; onEdit: () => void; onToggle: () => void; compact?: boolean;
}) {
  const mine = busy === v.id;
  return (
    <li className="pb-row-cv" style={{ ...pbRow, alignItems: 'center', flexWrap: 'wrap', rowGap: 8, listStyle: 'none', containIntrinsicSize: 'auto 76px' }}>
      <span aria-hidden="true" style={{
        width: 40, height: 40, borderRadius: PB.r.input, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: PB.ctl, border: `1px solid ${PB.ctlBd}`, color: v.active ? PB.tx : PB.tx2, fontFamily: PB.sora, fontWeight: 700, fontSize: 15,
      }}>{initial(v.name)}</span>
      <span style={{ flex: compact ? '1 1 0' : '1 1 180px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
          <span className="pb-clamp2" style={{ ...pbName, color: v.active ? PB.tx : PB.tx2, minWidth: 0 }}>{v.name}</span>
          {v.code && <span style={{ ...pbNum, fontSize: 12, color: PB.tx2, overflowWrap: 'anywhere' }}>{v.code}</span>}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
          <span style={pbMeta}><span style={pbNum}>{v.products.toLocaleString('en-IN')}</span> product{v.products === 1 ? '' : 's'}</span>
          <Dot color={v.active ? PB.live : NEUTRAL} label={v.active ? 'Active' : 'Inactive'} />
        </span>
        <VendorTg v={v} />
        {v.notes && <span className="pb-clamp2" style={pbMeta}>{v.notes}</span>}
      </span>
      <span style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>
        <PbButton icon="edit" onClick={onEdit} dim={!!busy} aria-label={`Edit ${v.name}`}>Edit</PbButton>
        {!compact && <PbButton kind={v.active ? 'danger' : 'secondary'} onClick={onToggle} busy={mine} busyLabel="Saving…" dim={!!busy && !mine}
          aria-label={`${v.active ? 'Deactivate' : 'Activate'} ${v.name}`}>
          {v.active ? 'Deactivate' : 'Activate'}
        </PbButton>}
      </span>
    </li>
  );
}
