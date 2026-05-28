import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { T, S } from '../../lib/theme';
import type { ShortLink, LinkClick } from '../../types/database';

const CLICK_COLS = 'id, link_id, clicked_at, user_agent, device_type, browser, os, referrer, country, city';
const EDGE_BASE = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/short-track';

interface Props {
  link: ShortLink;
  onBack: () => void;
  addToast: (msg: string, type?: string) => void;
}

export default function ShortNTrackAnalytics({ link, onBack, addToast }: Props) {
  const [clicks, setClicks] = useState<LinkClick[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const fetchClicks = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('link_clicks')
      .select(CLICK_COLS)
      .eq('link_id', link.id)
      .gte('clicked_at', from + 'T00:00:00')
      .lte('clicked_at', to + 'T23:59:59')
      .order('clicked_at', { ascending: false })
      .limit(2000);
    if (error) addToast(friendlyError(error), 'error');
    setClicks(data || []);
    setLoading(false);
  }, [link.id, from, to, addToast]);

  useEffect(() => { fetchClicks(); }, [fetchClicks]);

  const copyLink = () => {
    navigator.clipboard.writeText(`${EDGE_BASE}/${link.short_code}`);
    addToast('Short link copied', 'success');
  };

  const deviceCounts = aggregate(clicks, 'device_type');
  const browserCounts = aggregate(clicks, 'browser');
  const osCounts = aggregate(clicks, 'os');
  const countryCounts = aggregate(clicks, 'country');

  const dailyCounts = clicks.reduce<Record<string, number>>((acc, c) => {
    const day = (c.clicked_at || '').slice(0, 10);
    if (day) acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {});
  const dailyEntries = Object.entries(dailyCounts).sort((a, b) => a[0].localeCompare(b[0]));
  const maxDaily = Math.max(1, ...dailyEntries.map(e => e[1]));

  const hourlyCounts = new Array(24).fill(0);
  clicks.forEach(c => { if (c.clicked_at) hourlyCounts[new Date(c.clicked_at).getHours()]++; });
  const maxHourly = Math.max(1, ...hourlyCounts);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <span onClick={onBack} style={{ ...S.btnGhost, padding: '6px 10px', cursor: 'pointer' }}>
          <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const }}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </span>
        <div style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{link.title || link.short_code}</div>
          <div style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.long_url}</div>
        </div>
        <span onClick={copyLink} style={{ ...S.btnGhost, ...S.btnSm, cursor: 'pointer' }}>Copy Link</span>
      </div>

      {/* Date filter */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={S.fDate} />
        <span style={{ fontSize: 10, color: T.tx3 }}>to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={S.fDate} />
        <button onClick={fetchClicks} style={S.btnPrimary}>Apply</button>
      </div>

      {loading ? <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>Loading analytics...</div> : <>

      {/* KPI cards */}
      <div className="snt-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
        <KpiCard label="Total Clicks" value={clicks.length} color={T.ac2} bg={T.ac3} bd="rgba(99,102,241,.15)" />
        <KpiCard label="Devices" value={Object.keys(deviceCounts).length} color={T.gr} bg="rgba(34,197,94,.06)" bd="rgba(34,197,94,.15)" />
        <KpiCard label="Countries" value={Object.keys(countryCounts).filter(k => k !== 'Unknown').length || '—'} color={T.yl} bg="rgba(251,191,36,.06)" bd="rgba(251,191,36,.15)" />
      </div>

      {/* Daily chart */}
      {dailyEntries.length > 0 && <ChartCard title="Clicks Over Time">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }}>
          {dailyEntries.map(([day, count]) => (
            <div key={day} title={`${new Date(day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}: ${count}`}
              style={{ flex: 1, minWidth: 4, maxWidth: 24, height: `${Math.max(4, (count / maxDaily) * 100)}%`, background: `linear-gradient(180deg, ${T.ac}, ${T.ac2cc})`, borderRadius: '3px 3px 0 0' }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 8, color: T.tx3, fontFamily: T.mono }}>{dailyEntries[0]?.[0]?.slice(5)}</span>
          <span style={{ fontSize: 8, color: T.tx3, fontFamily: T.mono }}>{dailyEntries[dailyEntries.length - 1]?.[0]?.slice(5)}</span>
        </div>
      </ChartCard>}

      {/* Hourly chart */}
      <ChartCard title="Clicks by Hour">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60 }}>
          {hourlyCounts.map((count: number, h: number) => (
            <div key={h} title={`${h}:00 — ${count} clicks`}
              style={{ flex: 1, height: count > 0 ? `${Math.max(8, (count / maxHourly) * 100)}%` : 4, background: count > 0 ? `linear-gradient(180deg, ${T.gr}, ${T.grCC})` : 'rgba(255,255,255,0.04)', borderRadius: '2px 2px 0 0' }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          {[0, 6, 12, 18, 23].map(h => <span key={h} style={{ fontSize: 8, color: T.tx3, fontFamily: T.mono }}>{h}h</span>)}
        </div>
      </ChartCard>

      {/* Breakdown grids */}
      <div className="snt-breakdowns" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <BreakdownCard title="Device" data={deviceCounts} tone={T.ac2} />
        <BreakdownCard title="Browser" data={browserCounts} tone={T.bl} />
        <BreakdownCard title="OS" data={osCounts} tone={T.gr} />
        <BreakdownCard title="Country" data={countryCounts} tone={T.yl} />
      </div>

      {/* Recent clicks table */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.bd}`, fontSize: 10, fontWeight: 600, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1 }}>Recent Clicks ({clicks.length})</div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
            <thead><tr>
              {['Time', 'Device', 'Browser', 'OS', 'Country'].map(h => <th key={h} style={S.thStyle}>{h}</th>)}
            </tr></thead>
            <tbody>
              {clicks.slice(0, 50).map(c => (
                <tr key={c.id}>
                  <td style={{ ...S.tdStyle, fontFamily: T.mono, fontSize: 10, whiteSpace: 'nowrap' }}>{c.clicked_at ? new Date(c.clicked_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td style={S.tdStyle}>{c.device_type || '—'}</td>
                  <td style={S.tdStyle}>{c.browser || '—'}</td>
                  <td style={S.tdStyle}>{c.os || '—'}</td>
                  <td style={S.tdStyle}>{c.country || '—'}{c.city ? `, ${c.city}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {clicks.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No clicks in this date range.</div>}
        {clicks.length > 50 && <div style={{ padding: '8px 14px', fontSize: 10, color: T.tx3, borderTop: `1px solid ${T.bd}`, textAlign: 'center' }}>Showing 50 of {clicks.length} clicks</div>}
      </div>
      </>}
    </div>
  );
}

function aggregate(clicks: LinkClick[], field: keyof LinkClick): Record<string, number> {
  return clicks.reduce<Record<string, number>>((acc, c) => {
    const v = (c[field] as string) || 'Unknown';
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});
}

function KpiCard({ label, value, color, bg, bd }: { label: string; value: number | string; color: string; bg: string; bd: string }) {
  return (
    <div style={{ background: bg, border: `1px solid ${bd}`, borderRadius: 10, padding: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 9, color, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: T.sora, color }}>{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function BreakdownCard({ title, data, tone }: { title: string; data: Record<string, number>; tone: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{title}</div>
      {Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => (
        <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: T.tx2 }}>{name}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: tone, fontFamily: T.mono }}>{count}</span>
        </div>
      ))}
      {Object.keys(data).length === 0 && <div style={{ fontSize: 10, color: T.tx3 }}>No data</div>}
    </div>
  );
}
