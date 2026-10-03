// "Master synced 3 min ago · Refresh" — the honesty strip for the Google-sheet mirror.
//
// The master sheet is copied into Postgres every few minutes (master-sync via
// pg_cron) and every master-sheet feature reads that copy. When the copy goes
// stale the edge function silently falls back to reading Google live, which is
// correct but slow — so the state has to be visible somewhere rather than only
// in a table nobody opens. Refresh fires a sync now (request_master_sync, throttled
// to once a minute server-side) and waits for the copy to move.
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { T, S } from '../../lib/theme';

// Matches MASTER_STALE_MS in the listing-ai edge function: past this age the
// server stops trusting the copy and reads the sheet directly.
const STALE_MS = 45 * 60_000;
const POLL_MS = 3_000, WAIT_MS = 75_000; // a full sync of ~1,300 rows takes 10–40 s

const ago = (ms: number): string => {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} hr ago` : `${Math.floor(h / 24)} d ago`;
};

interface SyncRow { tab: string; status: string; last_success_at: string | null; started_at: string | null; row_count: number }
const SYNC_COLS = 'tab, status, last_success_at, started_at, row_count';
const ms = (s: string | null) => (s ? new Date(s).getTime() : 0);
const oldestOf = (rows: SyncRow[]) => rows.reduce((acc, r) => Math.min(acc, ms(r.last_success_at)), Infinity);
const latestStart = (rows: SyncRow[]) => rows.reduce((acc, r) => Math.max(acc, ms(r.started_at)), 0);
const sleep = (t: number) => new Promise(r => setTimeout(r, t));
const readSync = async () => (await supabase.from('master_sheet_sync').select(SYNC_COLS).order('tab')).data as SyncRow[] | null;

export default function MasterFreshness({ addToast, onSynced }: {
  addToast?: (m: string, t?: string) => void;
  onSynced?: () => void; // the copy moved: drop client caches and reload what is open
}) {
  const [rows, setRows] = useState<SyncRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    // Only while someone can see it: the app keeps visited tabs mounted
    // (display:none), so an unguarded interval kept polling from every tab
    // the owner had ever opened the studio in, in the background, forever.
    const visible = () => document.visibilityState === 'visible' && (!el.current || el.current.offsetParent !== null);
    const load = async () => {
      if (!visible()) return;
      const data = await readSync();
      if (alive.current && data) setRows(data);
    };
    load();
    // Polled, not realtime: one row per tab changing every few minutes is not
    // worth a websocket subscription on every client.
    const t = setInterval(load, 120_000);
    const onWake = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onWake);
    return () => { alive.current = false; clearInterval(t); document.removeEventListener('visibilitychange', onWake); };
  }, []);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // A fresh baseline (server timestamps, not the 2-minute-old state): the
      // sync is done when every tab's last_success_at has moved past it, and
      // failed when a tab errors on a run started after it.
      const base = (await readSync()) || rows || [];
      const before = oldestOf(base), startedBefore = latestStart(base);
      const { data, error } = await supabase.rpc('request_master_sync');
      if (error) throw error;
      const res = (data || {}) as { triggered?: boolean; reason?: string };
      if (!res.triggered) {
        addToast?.('Master copy synced less than a minute ago — it is already current', 'info');
        onSynced?.();
      } else {
        const until = Date.now() + WAIT_MS;
        let fresh: SyncRow[] | null = null, failed = false;
        while (Date.now() < until && alive.current) {
          await sleep(POLL_MS);
          const d = await readSync();
          if (!d || !d.length) continue;
          failed = d.some(r => r.status === 'error' && ms(r.started_at) > startedBefore);
          if (failed || oldestOf(d) > before) { fresh = d; break; }
        }
        if (fresh) setRows(fresh);
        if (failed) addToast?.('Master sync failed — the copy was not refreshed (see the sync log)', 'error');
        else if (fresh) { addToast?.(`Master copy refreshed · ${fresh.reduce((n, r) => n + (r.row_count || 0), 0).toLocaleString('en-IN')} designs`, 'success'); onSynced?.(); }
        else addToast?.('Sync started but is taking longer than usual — it will finish in the background', 'info');
      }
    } catch (e) { addToast?.(friendlyError(e), 'error'); }
    if (alive.current) setRefreshing(false);
  };

  if (!rows || rows.length === 0) return null;

  const oldest = oldestOf(rows);
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
    <div ref={el} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color, marginBottom: 8, flexWrap: 'wrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, opacity: failing || stale ? 1 : 0.6, flexShrink: 0 }} />
      <span>{label}</span>
      <button type="button" onClick={refresh} disabled={refreshing} title="Copy the Google sheet again now"
        style={{ ...S.btnGhost, ...S.btnSm, minHeight: 28, padding: '4px 10px', pointerEvents: refreshing ? 'none' : 'auto', opacity: refreshing ? 0.5 : 1 }}>
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  );
}
