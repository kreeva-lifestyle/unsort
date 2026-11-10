// Pieces of the Dashboard's "Database & server" tile (DbHealth.tsx): the size
// bars, the 7-day growth line and the "busiest work" list. Plain text only —
// query text from the database is shown as text, never as HTML.
import { T, alpha } from '../../lib/theme';
import { tileCard, TileLabel } from '../ui/StatTile';

export type Row = { name: string; bytes: number; rows?: number; files?: number };
export type Slow = { q: string; calls: number; mean_ms: number; total_s: number };
export type Snap = {
  taken_at: string; db_bytes: number; storage_bytes: number;
  stats: { tables: Row[]; buckets: Row[]; slow: Slow[]; cache_hit: number | null;
    /** All database work in seconds, and when the counters started (newer snapshots only). */
    slow_total_s?: number | null; slow_since?: string | null;
    connections: { total: number; active: number; idle: number; max: number } };
};
export type Hist = { t: string; db: number; st: number };

export const gb = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : b >= 1024 ** 2 ? `${Math.round(b / 1024 ** 2)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const int = (n: number) => n.toLocaleString('en-IN');

export function DbBars({ title, rows }: { title: string; rows: Row[] }) {
  const max = Math.max(1, ...rows.map(r => r.bytes));
  return (
    <div style={{ ...tileCard }}>
      <TileLabel>{title}</TileLabel>
      {rows.length === 0 && <div style={{ fontSize: 11, color: T.tx3, marginTop: 8 }}>Nothing yet</div>}
      {rows.map(r => (
        <div key={r.name} style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: T.tx2 }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name.replace(/_/g, ' ')}</span>
            <span style={{ fontFamily: T.mono, flexShrink: 0 }}>{gb(r.bytes)}</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: alpha(T.tx3, 0.15), marginTop: 3 }}>
            <div style={{ width: `${Math.max(2, (r.bytes / max) * 100)}%`, height: '100%', borderRadius: 2, background: T.ac2 }} />
          </div>
          <div style={{ fontSize: 10, color: T.tx3, marginTop: 2 }}>{r.rows != null ? `${int(r.rows)} rows` : `${int(r.files ?? 0)} files`}</div>
        </div>
      ))}
    </div>
  );
}

/** 7 days of database + storage size, one point per hourly measurement. */
export function DbSpark({ hist }: { hist: Hist[] }) {
  if (hist.length < 2) return null;
  const W = 300, H = 40;
  const line = (k: 'db' | 'st') => {
    const v = hist.map(h => h[k]); const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
    return v.map((y, i) => `${(i / (v.length - 1)) * W},${H - 4 - ((y - lo) / span) * (H - 8)}`).join(' ');
  };
  const grow = (k: 'db' | 'st') => hist[hist.length - 1][k] - hist[0][k];
  const sign = (b: number) => (b >= 0 ? `+${gb(b)}` : `−${gb(-b)}`);
  return (
    <div style={{ ...tileCard, marginTop: 10 }}>
      <TileLabel>Growth since {new Date(hist[0].t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}</TileLabel>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Database and storage size over the last days" style={{ width: '100%', height: 40, marginTop: 6 }}>
        <polyline points={line('db')} fill="none" stroke={T.ac2} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <polyline points={line('st')} fill="none" stroke={T.yl} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: T.tx3, marginTop: 4, flexWrap: 'wrap' }}>
        <span><span aria-hidden style={{ color: T.ac2 }}>●</span> Database {sign(grow('db'))}</span>
        <span><span aria-hidden style={{ color: T.yl }}>●</span> Storage {sign(grow('st'))}</span>
      </div>
    </div>
  );
}

/** Turn a database statement into words an owner can read. */
const plain = (q: string) => {
  if (/^select wal->>/i.test(q)) return 'Live updates (screens that refresh by themselves)';
  // The API layer re-reading the database's own catalogue (time zones, types).
  if (/pg_timezone_names|base_types|pg_catalog\.|information_schema\./i.test(q)) return 'Supabase housekeeping (its own lookups)';
  const t = q.match(/from\s+"?public"?\."?([a-z_]+)"?/i) || q.match(/public\.([a-z_]+)\(/i);
  if (/^with pgrst_source/i.test(q) && t) return `App reading ${t[1].replace(/_/g, ' ')}`;
  if (/^select public\./i.test(q) && t) return `Background job: ${t[1].replace(/_/g, ' ')}`;
  return q.length > 70 ? `${q.slice(0, 70)}…` : q;
};

/** "4.5 min a day", "12 s a day". */
const perDay = (s: number) => (s >= 60 ? `${(s / 60).toFixed(s >= 600 ? 0 : 1)} min a day` : s >= 1 ? `${Math.round(s)} s a day` : 'under 1 s a day');

/** Where the database's working time goes. `totalS` and `since` come with
 *  newer snapshots: with them each line is a share of ALL database work and
 *  shows its real size per day; without them it is a share of the lines shown. */
export function DbSlow({ rows, totalS, since, at }: { rows: Slow[]; totalS?: number | null; since?: string | null; at: string }) {
  if (!rows?.length) return null;
  // One line per kind of work: the database counts the same job under several
  // statement shapes, which used to list "Live updates" three times.
  const merged = new Map<string, { label: string; q: string; calls: number; total_s: number }>();
  for (const r of rows) {
    const label = plain(r.q);
    const m = merged.get(label);
    if (m) { m.calls += r.calls; m.total_s += r.total_s; } else merged.set(label, { label, q: r.q, calls: r.calls, total_s: r.total_s });
  }
  const list = [...merged.values()].sort((a, b) => b.total_s - a.total_s);
  const whole = !!totalS && totalS > 0;
  const total = whole ? totalS! : list.reduce((a, r) => a + r.total_s, 0) || 1;
  const days = since ? Math.max(1, (new Date(at).getTime() - new Date(since).getTime()) / 86_400_000) : null;
  const sinceTxt = since ? new Date(since).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : '';
  const pct = (v: number) => { const p = (v / total) * 100; return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`; };
  return (
    <div style={{ ...tileCard, marginTop: 10 }}>
      <TileLabel>Where the server spends its time</TileLabel>
      {list.map(r => (
        <div key={r.label} style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginTop: 8, fontSize: 12 }}>
          <span style={{ fontFamily: T.mono, color: T.tx, width: 44, flexShrink: 0, textAlign: 'right' }}>{pct(r.total_s)}</span>
          <span style={{ flex: 1, minWidth: 0, color: T.tx2 }} title={r.q}>{r.label}</span>
          <span style={{ fontFamily: T.mono, fontSize: 11, color: T.tx3, flexShrink: 0 }}>
            {days ? perDay(r.total_s / days) : `${int(r.calls)}× · ${Math.round(((r.total_s * 1000) / Math.max(1, r.calls)) * 10) / 10} ms`}
          </span>
        </div>
      ))}
      <div style={{ fontSize: 10, color: T.tx3, marginTop: 8, lineHeight: 1.5 }}>
        {whole && days
          ? `Share of all database work, which adds up to about ${perDay(total / days)} (average since ${sinceTxt}). A high share of a small total is normal.`
          : 'Share of the busiest jobs listed here, counted since the statistics were last reset.'}
      </div>
    </div>
  );
}
