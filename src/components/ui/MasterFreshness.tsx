// "Master synced 3 min ago" — the honesty strip for the Google-sheet mirror.
//
// The master sheet is copied into Postgres every few minutes (master-sync via
// pg_cron) and every master-sheet feature reads that copy. When the copy goes
// stale the edge function silently falls back to reading Google live, which is
// correct but slow — so the state has to be visible somewhere rather than only
// in a table nobody opens.
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { T } from '../../lib/theme';

// Matches MASTER_STALE_MS in the listing-ai edge function: past this age the
// server stops trusting the copy and reads the sheet directly.
const STALE_MS = 45 * 60_000;

const ago = (ms: number): string => {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} hr ago` : `${Math.floor(h / 24)} d ago`;
};

interface SyncRow { tab: string; status: string; last_success_at: string | null; row_count: number }

export default function MasterFreshness() {
  const [rows, setRows] = useState<SyncRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase.from('master_sheet_sync')
        .select('tab, status, last_success_at, row_count').order('tab');
      if (alive && data) setRows(data);
    };
    load();
    // Polled, not realtime: one row per tab changing every few minutes is not
    // worth a websocket subscription on every client.
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!rows || rows.length === 0) return null;

  const oldest = rows.reduce((acc, r) => {
    const at = r.last_success_at ? new Date(r.last_success_at).getTime() : 0;
    return at < acc ? at : acc;
  }, Infinity);
  const age = oldest === Infinity || oldest === 0 ? Infinity : Date.now() - oldest;
  const failing = rows.some(r => r.status === 'error');
  const stale = age >= STALE_MS;
  const designs = rows.reduce((n, r) => n + (r.row_count || 0), 0);

  const color = failing || stale ? T.re : T.tx3;
  const label = age === Infinity
    ? 'Master copy not built yet — reading the sheet directly'
    : stale
      ? `Master copy is ${ago(age)} — reading the sheet directly, which is slower`
      : failing
        ? `Master synced ${ago(age)}, but the last sync failed`
        : `Master synced ${ago(age)} · ${designs.toLocaleString('en-IN')} designs`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color, marginBottom: 8 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, opacity: failing || stale ? 1 : 0.6, flexShrink: 0 }} />
      <span>{label}</span>
    </div>
  );
}
