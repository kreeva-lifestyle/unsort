// The Purchase Orders summary: four stat tiles (open orders by status, what
// is still to come, orders waiting over a week, this month's buying) and
// two panels — which vendors hold open orders, and how long they have
// waited. Two small reads (open orders with their lines; recent headers),
// summed in poStats.ts. A tile narrows the list below; a vendor's bar shows
// that vendor's orders. The last numbers stay up while a refresh is in flight.
import { useEffect, useState } from 'react';
import { T } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { supabase } from '../../lib/supabase';
import { Meter, StackBar, BarList, Columns } from '../ui/Charts';
import { StatTile, TileLabel, TileHint, TileBig, TileSub, tileCard } from '../ui/StatTile';
import { PENDING_STATUSES } from './pendencyData';
import type { PoQuick } from './usePoList';
import { poStatsOf, OPEN_COLS, RECENT_COLS, OPEN_LABELS, AGE_LABELS, OTHERS, lastMonthStart, fmtQty, inr, type PoStatsData, type OpenRow, type RecentRow, type OpenKey, type AgeKey } from './poStats';

const OPEN_COLORS: Record<OpenKey, string> = { approved: T.ac2, sent: T.bl, partial: T.yl };
const AGE_COLORS: Record<AgeKey, string> = { lt7: T.ac2, d8_14: T.yl, d15_30: T.re, gt30: T.re };
const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;

export default function POStats({ version, quick, onQuick, onVendor, addToast }: {
  /** Bumped by the list after a write or a realtime change, so the numbers follow. */
  version: number;
  quick: PoQuick;
  /** A tile was tapped: narrow the list (tapping the active tile clears it). */
  onQuick: (q: PoQuick) => void;
  /** A vendor's bar was tapped: show exactly that vendor's orders. */
  onVendor: (vendor: string) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [s, setS] = useState<PoStatsData | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([
      supabase.from('purchase_orders').select(OPEN_COLS).in('status', PENDING_STATUSES).limit(1000),
      supabase.from('purchase_orders').select(RECENT_COLS).neq('status', 'cancelled').or(`status.eq.draft,po_date.gte.${lastMonthStart()}`).limit(2000),
    ]).then(([o, r]) => {
      if (!live) return;
      const error = o.error || r.error;
      if (error) { addToast(friendlyError(error), 'error'); return; }
      setS(poStatsOf((o.data ?? []) as unknown as OpenRow[], (r.data ?? []) as unknown as RecentRow[]));
    });
    return () => { live = false; };
  }, [version, addToast]);
  const ready = !!s;

  // "Still to come" leads with the unit that has the most pending (meters,
  // for this business); the rest are printed under it, never added in.
  const lead = s?.byUnit[0] ?? null;
  const others = (s?.byUnit ?? []).slice(1).filter(u => u.pending > 0);
  const pct = lead && lead.ordered > 0 ? Math.round((lead.received / lead.ordered) * 100) : 0;
  const comeLine = !s ? '' : lead
    ? `${fmtQty(lead.received)} of ${fmtQty(lead.ordered)} ${lead.unit} received (${pct}%) · ${s.linesDone} of ${plural(s.lines, 'item')} received in full`
    : 'nothing on order right now';
  const waitLine = !s ? '' : s.open === 0 ? 'no open orders'
    : [`oldest ${s.waiting.oldestDays} d`, s.waiting.over14 ? `${s.waiting.over14} over two weeks` : '', s.waiting.pastExpected ? `${s.waiting.pastExpected} past expected date` : ''].filter(Boolean).join(' · ');
  // Rupees only where rates were entered, and said so, for both months alike.
  const rated = (m: { value: number; rated: number }) => `${inr(m.value)} across ${plural(m.rated, 'rated order')}`;
  const monthLine = !s ? '' : [
    s.month.value > 0 ? rated(s.month) : s.month.orders ? 'no rates entered yet' : '',
    `last month ${plural(s.lastMonth.orders, 'order')}${s.lastMonth.value > 0 ? `, ${rated(s.lastMonth)}` : ''}`,
  ].filter(Boolean).join(' · ');
  const delta = s ? s.month.orders - s.lastMonth.orders : 0;
  const monthTail = !s ? undefined : `${s.month.orders === 1 ? 'order' : 'orders'}${s.lastMonth.orders ? ` · ${delta === 0 ? 'same as' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} vs`} last month` : ''}`;
  const stateParts = (Object.keys(OPEN_LABELS) as OpenKey[]).map(k => ({ key: k, label: OPEN_LABELS[k], count: s?.states[k] ?? 0, color: OPEN_COLORS[k] }));
  const ageCols = s ? (Object.keys(AGE_LABELS) as AgeKey[]).map(k => ({ key: k, label: AGE_LABELS[k], value: s.ages[k], color: AGE_COLORS[k] })) : [];
  // The bar is the number of open orders — one axis for every vendor; what
  // is still to come is printed per unit, never plotted.
  const vendorRows = (s?.byVendor ?? []).map(v => ({
    key: v.vendor, label: v.vendor, value: v.orders, valueText: plural(v.orders, 'PO'),
    sub: [v.pending.length ? `${v.pending.map(p => `${fmtQty(p.qty)} ${p.unit}`).join(' + ')} to come` : '', `waiting ${v.oldestDays} d`].filter(Boolean).join(' · '), pick: v.vendor !== OTHERS,
  }));
  const pick = (q: PoQuick) => () => onQuick(quick === q ? '' : q);
  const loading = <div style={{ fontSize: 11, color: T.tx3 }}>Loading…</div>;

  return (<>
    <div className="po-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
      <StatTile active={quick === 'open'} onPick={pick('open')}>
        <TileLabel>Open orders</TileLabel>
        <TileBig ready={ready} value={String(s?.open ?? 0)} color={T.tx} />
        <StackBar parts={stateParts} />
        <TileSub ready={ready} text={s?.drafts ? `+ ${plural(s.drafts, 'draft')} not yet approved` : 'no drafts waiting for approval'} />
      </StatTile>
      <StatTile>
        <TileLabel>Still to come</TileLabel>
        <TileBig ready={ready} value={lead ? `${fmtQty(lead.pending)} ${lead.unit}` : '0'} color={lead && lead.pending > 0 ? T.yl : T.tx3}
          tail={others.length ? `+ ${others.map(u => `${fmtQty(u.pending)} ${u.unit}`).join(', ')}` : undefined} />
        <Meter value={lead?.received ?? 0} max={lead?.ordered ?? 0} color={T.gr} title={comeLine} />
        <TileSub ready={ready} text={comeLine} />
      </StatTile>
      <StatTile active={quick === 'late'} onPick={pick('late')}>
        <TileLabel>Waiting over a week</TileLabel>
        <TileBig ready={ready} value={String(s?.waiting.over7 ?? 0)} color={(s?.waiting.over14 ?? 0) > 0 ? T.re : (s?.waiting.over7 ?? 0) > 0 ? T.yl : T.tx3} />
        <Meter value={s?.waiting.over7 ?? 0} max={s?.open ?? 0} color={T.yl} title={s ? `${s.waiting.over7} of ${s.open} open orders waiting over 7 days` : ''} />
        <TileSub ready={ready} text={waitLine} />
      </StatTile>
      <StatTile>
        <TileLabel>Ordered this month</TileLabel>
        {/* Two counts, not a share of a whole — so a signed delta, not a meter. */}
        <TileBig ready={ready} value={String(s?.month.orders ?? 0)} color={T.tx} tail={monthTail} />
        <TileSub ready={ready} text={monthLine} />
      </StatTile>
    </div>
    <div className="po-viz" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 10, marginBottom: 14, alignItems: 'start' }}>
      <div style={tileCard}>
        <TileLabel>Open orders by vendor</TileLabel>
        <TileHint>Who holds open orders, most first. Tap a name for that vendor's orders</TileHint>
        {!s ? loading
          : vendorRows.length === 0 ? <div style={{ fontSize: 11, color: T.tx3, padding: '8px 0' }}>No open orders right now.</div>
          : <BarList rows={vendorRows} color={T.ac2} onPick={onVendor} />}
      </div>
      <div style={tileCard}>
        <TileLabel>Waiting time</TileLabel>
        <TileHint gap={10}>Open orders by days since the PO date</TileHint>
        {!s ? loading : <Columns cols={ageCols} />}
      </div>
    </div>
  </>);
}
