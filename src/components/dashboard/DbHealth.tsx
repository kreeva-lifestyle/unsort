// Admin-only "Database & server" tile on the Dashboard (owner, 2026-11-10).
// Light on the server by design: pg_cron measures once an hour into
// app_db_stats (migration 20261110120000_db_health.sql); this tile reads that
// snapshot with ONE small RPC, only when it scrolls into view, never polls.
// "Measure now" asks for a fresh snapshot, which the server allows at most
// once every 5 minutes. Plan limits are Supabase Pro's included amounts.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S, alpha } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { tileCard, TileLabel } from '../ui/StatTile';
import { DbBars, DbSpark, DbSlow, gb, type Snap, type Hist } from './DbHealthParts';

const DB_LIMIT = 8 * 1024 ** 3;          // Pro: 8 GB database included
const STORAGE_LIMIT = 100 * 1024 ** 3;   // Pro: 100 GB file storage included

const level = (pct: number) => (pct >= 85 ? T.re : pct >= 65 ? T.yl : T.gr);
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

function Meter({ label, used, limit, note }: { label: string; used: number; limit: number; note: string }) {
  const pct = Math.min(100, (used / limit) * 100);
  return (
    <div style={{ ...tileCard }}>
      <TileLabel>{label}</TileLabel>
      <div style={{ fontFamily: T.sora, fontSize: 22, fontWeight: 800, color: T.tx, margin: '4px 0 6px' }}>{gb(used)}</div>
      <div role="meter" aria-label={`${label} used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}
        style={{ height: 6, borderRadius: 3, background: alpha(T.tx3, 0.2), overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(pct, 1)}%`, height: '100%', background: level(pct) }} />
      </div>
      <div style={{ fontSize: 11, color: T.tx3, marginTop: 6 }}>{pct.toFixed(pct < 10 ? 1 : 0)}% of {gb(limit)} · {note}</div>
    </div>
  );
}

export default function DbHealth() {
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [hist, setHist] = useState<Hist[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Load only once the tile is actually on screen.
  useEffect(() => {
    const el = box.current;
    if (!el || seen) return;
    if (!('IntersectionObserver' in window)) { setSeen(true); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  const load = useCallback(async (refresh: boolean) => {
    setBusy(true); setErr('');
    const { data, error } = await supabase.rpc('get_db_stats', { p_refresh: refresh });
    setBusy(false);
    if (error) { setErr(friendlyError(error)); return; }
    setSnap((data?.latest as Snap) ?? null);
    setHist((data?.history as Hist[]) ?? []);
  }, []);
  useEffect(() => { if (seen) void load(false); }, [seen, load]);

  const c = snap?.stats.connections;
  const connPct = c && c.max ? (c.total / c.max) * 100 : 0;
  return (
    <div ref={box} style={{ marginTop: 16 }}>
      <div style={{ ...S.flexBetween, gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora }}>Database &amp; server</div>
          <div style={{ fontSize: 11, color: T.tx3 }}>{snap ? `Measured ${ago(snap.taken_at)} · checked every hour` : 'Admins only · checked every hour'}</div>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={busy}
          style={{ ...S.btnGhost, minHeight: 44, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>
          {busy ? 'Measuring…' : 'Measure now'}
        </button>
      </div>
      {err && <div role="alert" style={{ background: alpha(T.re, 0.08), border: `1px solid ${alpha(T.re, 0.2)}`, borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginBottom: 8 }}>{err}</div>}
      {!snap && !err && <div style={{ ...tileCard, color: T.tx3, fontSize: 12 }}>{seen ? 'Loading…' : ' '}</div>}
      {snap && (
        <>
          <div className="db-health-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
            <Meter label="Database" used={snap.db_bytes} limit={DB_LIMIT} note="Pro plan" />
            <Meter label="File storage" used={snap.storage_bytes} limit={STORAGE_LIMIT} note="photos, PDFs" />
            <div style={{ ...tileCard }}>
              <TileLabel>Server load</TileLabel>
              <div style={{ fontFamily: T.sora, fontSize: 22, fontWeight: 800, color: level(connPct), margin: '4px 0 6px' }}>{c ? `${c.total} / ${c.max}` : '—'}</div>
              <div style={{ fontSize: 11, color: T.tx3 }}>connections · {c?.active ?? 0} busy now</div>
              <div style={{ fontSize: 11, color: T.tx3, marginTop: 4 }}>Cache hits {snap.stats.cache_hit ?? '—'}%{(snap.stats.cache_hit ?? 100) < 95 ? ' — low, ask for a check' : ''}</div>
            </div>
          </div>
          <DbSpark hist={hist} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 10, marginTop: 10 }}>
            <DbBars title="Biggest tables" rows={snap.stats.tables} />
            <DbBars title="Storage by folder" rows={snap.stats.buckets} />
          </div>
          <DbSlow rows={snap.stats.slow} />
        </>
      )}
    </div>
  );
}
