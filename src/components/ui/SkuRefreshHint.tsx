// "Not in the SKU list · ↻ Refresh list" under a SKU box whose text matches no
// design (owner, 2026-11-10). One tap:
//   1. refresh_sku_list() brings the server's list up to date and, at most once
//      a minute whoever asks, checks the master sheet for new rows;
//   2. this device re-checks its own copy (one tiny query, a full read only if
//      the list moved) and every SKU box on screen updates;
//   3. if a sheet check is under way, waits for it (a few seconds, 30 s at
//      most) and re-checks once more.
// Then the button rests for a minute. The rest is shared by every SKU box on
// this device (and survives a reload), so a challan with ten rows still makes
// one request a minute, not ten.
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { T } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useNotifications } from '../../hooks/useNotifications';
import { reloadProductCatalog, resolveSku } from '../../hooks/useProductCatalog';

const REST_MS = 60_000;
const WAIT_MS = 30_000;
const POLL_MS = 2_000;
const KEY = 'unsort.sku_refresh_at';

// Shared by every hint on screen.
let busy = false;
let lastAt = 0;
try { lastAt = Number(localStorage.getItem(KEY)) || 0; } catch { /* storage off */ }
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);

/** Wait for the sheet check to finish: nothing running, and (when we started
 *  one) every tab claimed after we asked. Gives up quietly after 30 s. */
async function waitForSheet(started: boolean, askedAt: string) {
  const since = ms(askedAt);
  for (const t0 = Date.now(); Date.now() - t0 < WAIT_MS;) {
    await new Promise(r => setTimeout(r, POLL_MS));
    const { data, error } = await supabase.from('master_sheet_sync').select('status, started_at');
    if (error || !data?.length) return;
    if (data.some(r => r.status === 'running')) continue;
    if (!started || data.every(r => ms(r.started_at) > since)) return;
  }
}

export default function SkuRefreshHint({ sku }: { sku: string }) {
  const { addToast } = useNotifications();
  const [, tick] = useState(0);
  const skuRef = useRef(sku);
  useEffect(() => { skuRef.current = sku; }, [sku]);
  useEffect(() => {
    const f = () => tick(n => n + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);

  const left = Math.max(0, Math.ceil((lastAt + REST_MS - Date.now()) / 1000));
  const resting = left > 0;
  useEffect(() => {
    if (!resting) return;
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [resting]);

  const run = async () => {
    if (busy || resting) return;
    busy = true; emit();
    try {
      const { data, error } = await supabase.rpc('refresh_sku_list');
      if (error) throw error;
      let idx = await reloadProductCatalog();
      const sheet = (data as { sheet?: string } | null)?.sheet;
      if ((sheet === 'started' || sheet === 'running') && !resolveSku(idx, skuRef.current)) {
        await waitForSheet(sheet === 'started', (data as { asked_at: string }).asked_at);
        idx = await reloadProductCatalog();
      }
      const code = skuRef.current.trim().toUpperCase();
      if (resolveSku(idx, code)) addToast(`${code} found — SKU list updated`, 'success');
      else addToast(`${code} is not in the master sheet yet. Check the code, or add it to the sheet.`, 'info');
    } catch (e) {
      addToast(friendlyError(e), 'error');
    } finally {
      busy = false;
      lastAt = Date.now();
      try { localStorage.setItem(KEY, String(lastAt)); } catch { /* storage off */ }
      emit();
    }
  };

  const off = busy || resting;
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 2, fontSize: 10, color: T.tx3, lineHeight: 1.4 }}>
      <span>Not in the SKU list ·</span>
      <button
        type="button"
        className="touch44"
        onMouseDown={e => e.preventDefault()}
        onClick={() => void run()}
        disabled={off}
        aria-label={busy ? 'Refreshing the SKU list' : resting ? `SKU list refreshed, try again in ${left} seconds` : 'Refresh the SKU list'}
        style={{
          background: 'none', border: 'none', padding: '4px 6px', margin: '-4px 0', minHeight: 24,
          fontSize: 10, fontWeight: 600, fontFamily: T.sans, color: off ? T.tx3 : T.ac2,
          cursor: off ? 'default' : 'pointer', opacity: off ? 0.6 : 1, pointerEvents: off ? 'none' : 'auto',
        }}
      >
        {busy ? 'Refreshing…' : resting ? `Refreshed · again in ${left}s` : '↻ Refresh list'}
      </button>
    </div>
  );
}
