// Analytics panel extracted from CashChallan.tsx (audit P0 — split 1100-line god-component).
// Consumes state from the parent so date range stays in sync with the URL/app state.
import { T } from '../../lib/theme';

export type AnalyticsData = {
  totalRevenue: number;
  count: number;
  byMode: Record<string, number>;
  returnsCount?: number;
  voidedCount?: number;
  prevRevenue?: number;
  prevCount?: number;
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: T.sora }}>Analytics</span>
      </div>
      <div className="challan-analytics-dates" style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
        <input type="date" value={from} onChange={e => onFromChange(e.target.value)} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 10, padding: '5px 8px', outline: 'none' }} />
        <span style={{ fontSize: 10, color: T.tx3 }}>to</span>
        <input type="date" value={to} onChange={e => onToChange(e.target.value)} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 10, padding: '5px 8px', outline: 'none' }} />
        <button onClick={onApply} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)`, color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Apply</button>
      </div>
      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        <div style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.15)', borderRadius: 10, padding: '12px', textAlign: 'center' as const }}>
          <div style={{ fontSize: 9, color: T.gr, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>Net Revenue</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: T.sora, color: T.gr }}>₹{analytics.totalRevenue.toLocaleString('en-IN')}</div>
          {revChange && <div style={{ fontSize: 9, color: revChange.color, marginTop: 4, fontFamily: T.mono, fontWeight: 600 }}>{revChange.label} vs prev · ₹{(analytics.prevRevenue ?? 0).toLocaleString('en-IN')}</div>}
        </div>
        <div style={{ background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.12)', borderRadius: 10, padding: '12px', textAlign: 'center' as const }}>
          <div style={{ fontSize: 9, color: T.ac2, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>Sales</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: T.sora, color: T.ac2 }}>{analytics.count}</div>
          {salesChange && <div style={{ fontSize: 9, color: salesChange.color, marginTop: 4, fontFamily: T.mono, fontWeight: 600 }}>{salesChange.label} vs prev · {analytics.prevCount ?? 0}</div>}
        </div>
        <div style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.12)', borderRadius: 10, padding: '12px', textAlign: 'center' as const }}>
          <div style={{ fontSize: 9, color: T.re, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>Returns</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: T.sora, color: T.re }}>{analytics.returnsCount || 0}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px', textAlign: 'center' as const }}>
          <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>Voided</div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: T.sora, color: T.tx3 }}>{analytics.voidedCount || 0}</div>
        </div>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.bd}`, fontSize: 10, fontWeight: 600, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1 }}>Payment Mode Breakup</div>
        {Object.entries(analytics.byMode).map(([mode, amount]) => (
          <div key={mode} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: `1px solid ${T.bd}` }}>
            <span style={{ fontSize: 12, color: T.tx }}>{mode}</span>
            <span style={{ fontSize: 12, fontFamily: T.mono, color: T.ac2, fontWeight: 600 }}>₹{Number(amount).toLocaleString('en-IN')}</span>
          </div>
        ))}
        {Object.keys(analytics.byMode).length === 0 && <div style={{ padding: 16, textAlign: 'center' as const, color: T.tx3, fontSize: 11 }}>No data for today</div>}
      </div>
    </div>
  );
}
