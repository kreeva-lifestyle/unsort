import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { T, S } from '../../lib/theme';
import DateInput from '../ui/DateInput';
import { copyToClipboard } from '../../lib/clipboard';
import type { ShortLink, LinkClick } from '../../types/database';

const CLICK_COLS = 'id, link_id, clicked_at, user_agent, device_type, browser, os, referrer, country, city, visitor_hash';
const CLICK_LIMIT = 2000;
const APP_ORIGIN = typeof window !== 'undefined' ? window.location.origin : 'https://dailyoffice.aryadesigns.co.in';

interface Props {
  link: ShortLink;
  onBack: () => void;
  addToast: (msg: string, type?: string) => void;
}

// Local calendar date (not toISOString, which is UTC — in IST it returns
// yesterday's date until 05:30 AM, hiding today's clicks by default).
const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function TracklyAnalytics({ link, onBack, addToast }: Props) {
  const [clicks, setClicks] = useState<LinkClick[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    return localDate(d);
  });
  const [to, setTo] = useState(() => localDate(new Date()));
  const reqIdRef = useRef(0);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);

  const fetchClicks = useCallback(async () => {
    if (from > to) { addToast('"From" date is after "To" date — adjust the range', 'error'); return; }
    const myReq = ++reqIdRef.current;
    setLoading(true);
    try {
      // Day boundaries in the user's timezone (zone-less strings would be
      // parsed as UTC by Postgres, shifting every boundary by 5h30m in IST).
      const fromTs = new Date(from + 'T00:00:00').toISOString();
      const toTs = new Date(to + 'T23:59:59.999').toISOString();
      const [{ data, error }, { count, error: countErr }] = await Promise.all([
        supabase
          .from('link_clicks')
          .select(CLICK_COLS)
          .eq('link_id', link.id)
          .gte('clicked_at', fromTs)
          .lte('clicked_at', toTs)
          .order('clicked_at', { ascending: false })
          .limit(CLICK_LIMIT),
        supabase
          .from('link_clicks')
          .select('id', { count: 'exact', head: true })
          .eq('link_id', link.id)
          .gte('clicked_at', fromTs)
          .lte('clicked_at', toTs),
      ]);
      if (reqIdRef.current !== myReq) return; // stale; newer fetch in flight
      if (error) addToast(friendlyError(error), 'error');
      else if (countErr) addToast(friendlyError(countErr), 'error');
      setClicks(data || []);
      setTotalCount(count ?? (data?.length || 0));
      setPage(0);
    } finally {
      if (reqIdRef.current === myReq) setLoading(false);
    }
  }, [link.id, from, to, addToast]);

  useEffect(() => { fetchClicks(); }, [fetchClicks]);

  const copyLink = async () => {
    const ok = await copyToClipboard(`${APP_ORIGIN}/#/s/${link.short_code}`);
    addToast(ok ? 'Short link copied' : 'Copy failed — long-press the URL to copy manually', ok ? 'success' : 'error');
  };

  const { deviceCounts, browserCounts, osCounts, countryCounts, dailyEntries, maxDaily, hourlyCounts, maxHourly, uniqueVisitors } = useMemo(() => {
    const dev = aggregate(clicks, 'device_type');
    const br = aggregate(clicks, 'browser');
    const o = aggregate(clicks, 'os');
    const co = aggregate(clicks, 'country');
    const daily: Record<string, number> = {};
    clicks.forEach(c => { const d = (c.clicked_at || '').slice(0, 10); if (d) daily[d] = (daily[d] || 0) + 1; });
    const dailyArr = Object.entries(daily).sort((a, b) => a[0].localeCompare(b[0]));
    const maxD = Math.max(1, ...dailyArr.map(e => e[1]));
    const hourly = new Array(24).fill(0);
    clicks.forEach(c => { if (c.clicked_at) hourly[new Date(c.clicked_at).getHours()]++; });
    const maxH = Math.max(1, ...hourly);
    const uniq = new Set(clicks.map(c => c.visitor_hash).filter(Boolean)).size;
    return { deviceCounts: dev, browserCounts: br, osCounts: o, countryCounts: co, dailyEntries: dailyArr, maxDaily: maxD, hourlyCounts: hourly, maxHourly: maxH, uniqueVisitors: uniq };
  }, [clicks]);

  const isTruncated = totalCount > CLICK_LIMIT;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <span onClick={onBack} style={{ ...S.btnGhost, padding: '8px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', minHeight: 36 }} aria-label="Back to links">
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
        <DateInput value={from} onChange={e => setFrom(e.target.value)} />
        <span style={{ fontSize: 10, color: T.tx3 }}>to</span>
        <DateInput value={to} onChange={e => setTo(e.target.value)} />
        <button onClick={fetchClicks} style={S.btnPrimary}>Apply</button>
      </div>

      {loading ? <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>Loading analytics...</div> : <>

      {isTruncated && <div style={{ background: 'oklch(0.78 0.18 75 / .08)', border: '1px solid oklch(0.78 0.18 75 / .2)', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: T.yl, marginBottom: 10 }}>
        Charts, breakdowns and the table below are based on the latest {CLICK_LIMIT.toLocaleString('en-IN')} of {totalCount.toLocaleString('en-IN')} clicks in this range — narrow the date range to cover all of it.
      </div>}

      {/* KPI cards */}
      <div className="trackly-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        <KpiCard label="Total Clicks" value={totalCount} color={T.ac2} bg={T.ac3} bd="oklch(0.55 0.22 265 / .15)" />
        <KpiCard label="Unique Visitors" value={uniqueVisitors || '—'} color={T.bl} bg="oklch(0.77 0.14 230 / .06)" bd="oklch(0.77 0.14 230 / .15)" />
        <KpiCard label="Devices" value={Object.keys(deviceCounts).length} color={T.gr} bg="oklch(0.72 0.19 145 / .06)" bd="oklch(0.72 0.19 145 / .15)" />
        <KpiCard label="Countries" value={Object.keys(countryCounts).filter(k => k !== 'Unknown').length || '—'} color={T.yl} bg="oklch(0.78 0.18 75 / .06)" bd="oklch(0.78 0.18 75 / .15)" />
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
      <div className="trackly-breakdowns" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <BreakdownCard title="Device" data={deviceCounts} tone={T.ac2} />
        <BreakdownCard title="Browser" data={browserCounts} tone={T.bl} />
        <BreakdownCard title="OS" data={osCounts} tone={T.gr} />
        <BreakdownCard title="Country" data={countryCounts} tone={T.yl} />
      </div>

      {/* Recent clicks table */}
      {(() => {
        const totalPages = Math.max(1, Math.ceil(clicks.length / perPage));
        const safePage = Math.min(page, totalPages - 1);
        const sliceStart = safePage * perPage;
        const pageClicks = clicks.slice(sliceStart, sliceStart + perPage);
        return (
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.bd}`, fontSize: 10, fontWeight: 600, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1 }}>Recent Clicks ({clicks.length})</div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
            <thead><tr>
              {['Time', 'Device', 'Browser', 'OS', 'Country'].map(h => <th key={h} style={S.thStyle}>{h}</th>)}
            </tr></thead>
            <tbody>
              {pageClicks.map(c => (
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
        {clicks.length > 0 && (
          <div className="trackly-pagination" style={{ padding: '8px 14px', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0} style={{ ...S.btnGhost, ...S.btnSm, opacity: safePage === 0 ? 0.3 : 1, cursor: safePage === 0 ? 'default' : 'pointer' }}>Prev</button>
              <span style={{ fontSize: 10, color: T.tx3 }}>{safePage + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1} style={{ ...S.btnGhost, ...S.btnSm, opacity: safePage >= totalPages - 1 ? 0.3 : 1, cursor: safePage >= totalPages - 1 ? 'default' : 'pointer' }}>Next</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: T.tx3 }}>{clicks.length} clicks</span>
              <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(0); }} style={{ padding: '4px 8px', fontSize: 11, height: 28, borderRadius: 6, background: T.s, border: `1px solid ${T.bd2}`, color: T.tx2, cursor: 'pointer' }}>
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
              </select>
            </div>
          </div>
        )}
      </div>
        );
      })()}
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
