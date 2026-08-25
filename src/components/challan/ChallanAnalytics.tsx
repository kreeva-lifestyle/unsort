// Analytics panel extracted from CashChallan.tsx (audit P0 — split 1100-line god-component).
// Consumes state from the parent so date range stays in sync with the URL/app state.
import { T, S } from '../../lib/theme';
import DateInput from '../ui/DateInput';

export type AnalyticsData = {
  totalRevenue: number;
  count: number;
  byMode: Record<string, number>;
  returnsCount?: number;
  voidedCount?: number;
  prevRevenue?: number;
  prevCount?: number;
  topCustomers?: { name: string; value: number }[];
  customerCount?: number;
};

// 10 categorical slots for the top-customers donut, FIXED order (rank 1 is
// always slot 1). The 8 reference dark-mode hues + teal and brown extensions;
// the full set of six palette checks (lightness band, chroma floor, adjacent
// CVD >= 8, normal-vision floor, contrast vs this surface) passes on
// dataviz's validator against #0F1420. Identity never rides on hue alone -
// every slice has a ranked legend row with name and value.
const PIE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767', '#0d9ea8', '#a1662f'];

/** One donut slice path (annulus segment), angles in degrees from 12 o'clock. */
const slicePath = (cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string => {
  // A lone customer is a full ring - two half-arcs, since a 360° arc collapses.
  if (a1 - a0 >= 359.999) {
    return [0, 180].map(off => slicePath(cx, cy, r0, r1, a0 + off, a0 + off + 180)).join(' ');
  }
  const pt = (r: number, a: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return `${(cx + r * Math.cos(rad)).toFixed(2)} ${(cy + r * Math.sin(rad)).toFixed(2)}`;
  };
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${pt(r1, a0)} A ${r1} ${r1} 0 ${large} 1 ${pt(r1, a1)} L ${pt(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${pt(r0, a0)} Z`;
};

type Props = {
  analytics: AnalyticsData;
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onApply: () => void;
};

const pctChange = (curr: number, prev: number | undefined): { label: string; color: string } | null => {
  if (prev === undefined || prev === 0) return null;
  const diff = ((curr - prev) / Math.abs(prev)) * 100;
  const rounded = Math.round(diff);
  if (rounded === 0) return { label: '±0%', color: T.tx3 };
  return { label: `${rounded > 0 ? '▲' : '▼'} ${Math.abs(rounded)}%`, color: rounded > 0 ? T.gr : T.re };
};

export default function ChallanAnalytics({ analytics, from, to, onFromChange, onToChange, onApply }: Props) {
  const revChange = pctChange(analytics.totalRevenue, analytics.prevRevenue);
  const salesChange = pctChange(analytics.count, analytics.prevCount);
  return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
      <div className="challan-analytics-dates" style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
        <DateInput value={from} onChange={e => onFromChange(e.target.value)} />
        <span style={{ fontSize: 10, color: T.tx3 }}>to</span>
        <DateInput value={to} onChange={e => onToChange(e.target.value)} />
        <button onClick={onApply} style={S.btnPrimary}>Apply</button>
      </div>
      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        <div style={{ background: 'oklch(0.72 0.19 145 / .06)', border: '1px solid oklch(0.72 0.19 145 / .15)', borderRadius: 10, padding: '12px', textAlign: 'center' as const }}>
          <div style={{ fontSize: 9, color: T.gr, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>Net Revenue</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: T.sora, color: T.gr }}>₹{analytics.totalRevenue.toLocaleString('en-IN')}</div>
          {revChange && <div style={{ fontSize: 9, color: revChange.color, marginTop: 4, fontFamily: T.mono, fontWeight: 600 }}>{revChange.label} vs prev · ₹{(analytics.prevRevenue ?? 0).toLocaleString('en-IN')}</div>}
        </div>
        <div style={{ background: T.ac3, border: `1px solid ${T.bd2}`, borderRadius: 10, padding: '12px', textAlign: 'center' as const }}>
          <div style={{ fontSize: 9, color: T.ac2, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>Sales</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: T.sora, color: T.ac2 }}>{analytics.count}</div>
          {salesChange && <div style={{ fontSize: 9, color: salesChange.color, marginTop: 4, fontFamily: T.mono, fontWeight: 600 }}>{salesChange.label} vs prev · {analytics.prevCount ?? 0}</div>}
        </div>
        <div style={{ background: 'oklch(0.63 0.22 25 / .06)', border: '1px solid oklch(0.63 0.22 25 / .12)', borderRadius: 10, padding: '12px', textAlign: 'center' as const }}>
          <div style={{ fontSize: 9, color: T.re, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>Returns</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: T.sora, color: T.re }}>{analytics.returnsCount || 0}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px', textAlign: 'center' as const }}>
          <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>Voided</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: T.sora, color: T.tx3 }}>{analytics.voidedCount || 0}</div>
        </div>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
        {/* Deliberately COLLECTED money (payments by payment_date), while Net
            Revenue above is BILLED money (challan totals by created_at). Unpaid
            challans and payments landing on later days make the two disagree —
            correctly. Without the caption and total, that reads as a bug. */}
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1 }}>Payment Mode Breakup</span>
          <span style={{ fontSize: 9, color: T.tx3 }}>money collected in this range — unpaid billed amounts are not here</span>
        </div>
        {Object.entries(analytics.byMode).map(([mode, amount]) => (
          <div key={mode} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: `1px solid ${T.bd}` }}>
            <span style={{ fontSize: 12, color: T.tx }}>{mode}</span>
            <span style={{ fontSize: 12, fontFamily: T.mono, color: T.ac2, fontWeight: 600 }}>₹{Number(amount).toLocaleString('en-IN')}</span>
          </div>
        ))}
        {Object.keys(analytics.byMode).length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.02)' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.tx2 }}>Total collected</span>
            <span style={{ fontSize: 12, fontFamily: T.mono, color: T.tx, fontWeight: 700 }}>₹{Object.values(analytics.byMode).reduce((s, a) => s + Number(a), 0).toLocaleString('en-IN')}</span>
          </div>
        )}
        {Object.keys(analytics.byMode).length === 0 && <div style={{ padding: 16, textAlign: 'center' as const, color: T.tx3, fontSize: 11 }}>No payments recorded in this date range</div>}
      </div>

      {/* Top customers - donut + ranked legend. Values are NET billed sales
          (returns subtract), same rule as Net Revenue above. */}
      {(analytics.topCustomers?.length ?? 0) > 0 && (() => {
        const top = analytics.topCustomers!;
        const topTotal = top.reduce((t, c) => t + c.value, 0);
        const all = Math.max(analytics.totalRevenue, topTotal);
        let angle = 0;
        const slices = top.map((c, i) => {
          const sweep = (c.value / topTotal) * 360;
          const d = slicePath(90, 90, 48, 82, angle, angle + sweep);
          angle += sweep;
          return { ...c, d, color: PIE[i] };
        });
        return (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden', marginTop: 14 }}>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1 }}>Top Customers — by sales value</span>
              <span style={{ fontSize: 9, color: T.tx3 }}>
                top {top.length}{(analytics.customerCount ?? 0) > top.length ? ` of ${analytics.customerCount}` : ''} · ₹{Math.round(topTotal).toLocaleString('en-IN')}{all > topTotal ? ` of ₹${Math.round(all).toLocaleString('en-IN')} billed` : ''} · returns subtracted
              </span>
            </div>
            <div style={{ display: 'flex', gap: 14, padding: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* margin auto: centred when the legend wraps below on the
                  phone (owner's video showed it hugging the left with dead
                  space beside); on desktop the legend's flex:1 absorbs the
                  row so the donut stays put. Bigger radius keeps the small
                  slices legible next to a dominant one. */}
              <svg viewBox="0 0 180 180" style={{ width: 180, height: 180, flexShrink: 0, margin: '0 auto' }} role="img" aria-label={`Top ${top.length} customers by sales value`}>
                {slices.map((c, i) => (
                  <path key={i} d={c.d} fill={c.color} stroke={T.bg} strokeWidth={2}>
                    <title>{`${c.name} — ₹${Math.round(c.value).toLocaleString('en-IN')} (${Math.round((c.value / topTotal) * 100)}%)`}</title>
                  </path>
                ))}
                <text x="90" y="85" textAnchor="middle" style={{ fill: T.tx3, fontSize: 10, fontFamily: T.sans as string }}>TOP {top.length}</text>
                <text x="90" y="102" textAnchor="middle" style={{ fill: T.tx, fontSize: 14, fontWeight: 700, fontFamily: T.mono as string }}>₹{topTotal >= 100000 ? `${(topTotal / 100000).toFixed(1)}L` : Math.round(topTotal).toLocaleString('en-IN')}</text>
              </svg>
              <div style={{ flex: 1, minWidth: 220 }}>
                {slices.map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', fontSize: 11 }}>
                    <span style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono, width: 16, textAlign: 'right' }}>{i + 1}.</span>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: c.color, flexShrink: 0 }} />
                    <span style={{ color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{c.name}</span>
                    <span style={{ fontFamily: T.mono, color: T.tx2 }}>₹{Math.round(c.value).toLocaleString('en-IN')}</span>
                    <span style={{ fontFamily: T.mono, fontSize: 10, color: T.tx3, width: 34, textAlign: 'right' }}>{Math.round((c.value / topTotal) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
