// master-sync — pulls the Google master sheet into master_sheet_rows.
//
// One-way: the sheet is the only place data is edited; this never writes back
// (hence the READONLY Google scopes below).
//
// Called by pg_cron, never by a browser:
//   POST { mode: 'auto'   } -> sync only if Drive says the file changed
//   POST { mode: 'full'   } -> sync unconditionally (hourly reconcile)
//   POST { mode: 'verify' } -> diff sheet against DB, write NOTHING
// Auth is the x-sync-secret header vs app_secrets.master_sync_secret.
//
// The three things that keep this cheap:
//   1. A Drive modifiedTime probe (a few hundred bytes) decides whether to
//      download the sheet at all. An idle poll costs one metadata call.
//   2. Per-row content hashing: only rows that actually changed are written,
//      so a one-cell edit is a one-row UPDATE, not a 3000-row rewrite.
//   3. A lease row per tab, so two overlapping runs can never both sync.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(SB_URL, SB_SVC, { auth: { persistSession: false } });

// Must match listing-ai's MASTER_TABS — the readers reconstruct these names.
const MASTER_TABS = ['ARYA', 'DRESSTIVE'];
const LEASE_STALE_MIN = 5;      // a crashed run releases itself after this
// Fallback cadence when the Drive probe is unavailable (the Drive API is not
// enabled on the Google project, so this is the live path today). A full sync
// of both tabs is ~1300 rows / ~2s and writes nothing when nothing changed, so
// 4 minutes is affordable; enabling the Drive API makes the 2-minute tick free.
const BLIND_RESYNC_MS = 4 * 60_000;
const WRITE_BATCH = 500;        // same batch size as the Brand Tags import

// ---- helpers copied verbatim from listing-ai so stored values match ---------
const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
const normSku = (v: unknown) => String(v ?? '').trim().toUpperCase();
const compactSku = (v: string) => String(v || '').toUpperCase().replace(/[-_\s./]/g, '');
const skuColIndex = (headers: string[]) => {
  const i = headers.findIndex(h => String(h ?? '').toLowerCase().includes('sku'));
  return i < 0 ? 0 : i;
};
const catalogColIndex = (headers: string[]) =>
  headers.findIndex(h => /^catalog(name)?$/.test(normHeader(String(h || ''))));

// ---- Google -----------------------------------------------------------------
function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
function b64url(input: Uint8Array | string): string {
  const bin = typeof input === 'string' ? input : String.fromCharCode(...input);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Read-only scopes. drive.metadata.readonly is what makes the cheap probe
// possible; if the Drive API is not enabled on the project the probe fails and
// we degrade to a timed resync rather than spinning.
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
].join(' ');

let tokenCache: { token: string; expiresAt: number } | null = null;
async function googleToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const email = Deno.env.get('GOOGLE_CLIENT_EMAIL');
  const pkRaw = Deno.env.get('GOOGLE_PRIVATE_KEY');
  if (!email || !pkRaw) throw new Error('Missing GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY');
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(pkRaw), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' +
    b64url(JSON.stringify({ iss: email, scope: SCOPES, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(unsigned));
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(new Uint8Array(sig))}` }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Google OAuth ${resp.status}: ${data.error_description || data.error || 'unknown'}`);
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
}

const sheetId = () => {
  const id = Deno.env.get('MASTER_SHEET_ID');
  if (!id) throw new Error('Missing MASTER_SHEET_ID secret');
  return id;
};

async function readSheetRaw(tab: string): Promise<string[][]> {
  const token = await googleToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}/values/${encodeURIComponent(tab)}`;
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.message || `read ${r.status}`);
  return (data.values || []) as string[][];
}

// The whole point of the cheap poll: ~200 bytes instead of the entire sheet.
// Returns null when Drive is unavailable — the caller treats that as "unknown"
// and falls back to a timed resync. The reason is reported, never swallowed:
// a silently dead probe would look identical to a working one from the outside.
let probeError: string | null = null;
async function driveModifiedTime(): Promise<string | null> {
  probeError = null;
  try {
    const token = await googleToken();
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${sheetId()}?fields=modifiedTime&supportsAllDrives=true`,
      { headers: { authorization: `Bearer ${token}` } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { probeError = `${r.status}: ${data?.error?.message || 'unknown'}`.slice(0, 300); return null; }
    return data?.modifiedTime ?? null;
  } catch (e) { probeError = (e as Error).message?.slice(0, 300) ?? 'probe failed'; return null; }
}

// PostgREST caps a response at 1000 rows on this project (the same wall the
// taught-mappings reader in listing-ai had to paginate past). Reading the
// mirror without this would see only the first 1000 rows and rewrite the rest
// on every single sync.
async function readAllRows(columns: string, tab: string): Promise<any[]> {
  const PAGE = 1000;
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from('master_sheet_rows')
      .select(columns).eq('tab', tab).order('row_num').range(from, from + PAGE - 1);
    if (error) throw new Error(`read mirror: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

// ---- row shaping ------------------------------------------------------------
const enc = new TextEncoder();
async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

interface ShapedRow {
  tab: string; row_num: number; sku: string | null; sku_norm: string | null;
  sku_compact: string | null; catalog: string | null; cells: string[]; content_hash: string;
}

// Trailing blanks are trimmed so appending an empty column to the sheet does
// not change a single hash — the "add a column, write nothing" property.
const trimTrailing = (row: string[]): string[] => {
  const out = row.map(c => String(c ?? ''));
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out;
};

async function shapeRows(tab: string, rows: string[][], headers: string[]): Promise<ShapedRow[]> {
  const sIdx = skuColIndex(headers);
  const cIdx = catalogColIndex(headers);
  const out: ShapedRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = trimTrailing(rows[i] || []);
    if (cells.length === 0) continue;              // blank sheet row: not stored
    const sku = String(cells[sIdx] ?? '').trim();
    const catalog = cIdx >= 0 ? String(cells[cIdx] ?? '').trim() : '';
    out.push({
      tab, row_num: i + 1,                          // sheet rows are 1-based
      sku: sku || null,
      sku_norm: sku ? normSku(sku) : null,
      sku_compact: sku ? compactSku(sku) : null,
      catalog: catalog || null,
      cells,
      content_hash: await sha256(JSON.stringify(cells)),
    });
  }
  return out;
}

// ---- sync one tab -----------------------------------------------------------
interface TabResult {
  tab: string; skipped?: boolean; reason?: string;
  changed?: number; deleted?: number; rowCount?: number; durationMs?: number; error?: string;
}

async function syncTab(tab: string, mode: string, modified: string | null): Promise<TabResult> {
  const t0 = Date.now();
  const staleLease = new Date(Date.now() - LEASE_STALE_MIN * 60_000).toISOString();

  // Claim the lease. No row back = another run holds it; leave it alone.
  const { data: claimed } = await db.from('master_sheet_sync')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('tab', tab)
    .or(`status.neq.running,started_at.lt."${staleLease}"`)
    .select('tab, sheet_modified, last_success_at');
  const lease = claimed?.[0];
  if (!lease) return { tab, skipped: true, reason: 'another sync is running' };

  try {
    if (mode === 'auto') {
      if (modified && lease.sheet_modified && new Date(modified).getTime() === new Date(lease.sheet_modified).getTime()) {
        await db.from('master_sheet_sync').update({ status: 'idle' }).eq('tab', tab);
        return { tab, skipped: true, reason: 'sheet unchanged' };
      }
      // No probe (Drive unavailable): do not re-download every two minutes.
      if (!modified && lease.last_success_at && Date.now() - new Date(lease.last_success_at).getTime() < BLIND_RESYNC_MS) {
        await db.from('master_sheet_sync').update({ status: 'idle' }).eq('tab', tab);
        return { tab, skipped: true, reason: 'no drive probe, synced recently' };
      }
    }

    const raw = await readSheetRaw(tab);
    if (raw.length === 0) throw new Error('tab is empty');
    const headers = (raw[0] || []).map(h => String(h ?? '').trim());
    const shaped = await shapeRows(tab, raw, headers);

    // Two columns tell us what is already stored; everything unchanged is then
    // left completely untouched (no dead tuples, no realtime noise).
    const existing = await readAllRows('row_num, content_hash', tab);
    const prev = new Map<number, string>(existing.map((r: any) => [r.row_num, r.content_hash]));

    const changed = shaped.filter(r => prev.get(r.row_num) !== r.content_hash);
    for (let i = 0; i < changed.length; i += WRITE_BATCH) {
      const batch = changed.slice(i, i + WRITE_BATCH).map(r => ({ ...r, synced_at: new Date().toISOString() }));
      const { error } = await db.from('master_sheet_rows').upsert(batch, { onConflict: 'tab,row_num' });
      if (error) throw new Error(`upsert: ${error.message}`);
    }

    // Rows that vanished from the sheet (deleted or blanked out).
    const kept = new Set(shaped.map(r => r.row_num));
    const gone = [...prev.keys()].filter(rn => !kept.has(rn));
    for (let i = 0; i < gone.length; i += WRITE_BATCH) {
      const { error } = await db.from('master_sheet_rows').delete()
        .eq('tab', tab).in('row_num', gone.slice(i, i + WRITE_BATCH));
      if (error) throw new Error(`delete: ${error.message}`);
    }

    // Column catalogue + per-column fill counts (the rate card's colCounts).
    const cols = headers.map((h, ordinal) => ({
      tab, ordinal, header: h, header_norm: normHeader(h),
      non_empty: shaped.reduce((n, r) => n + (String(r.cells[ordinal] ?? '').trim() ? 1 : 0), 0),
    }));
    if (cols.length) {
      const { error } = await db.from('master_sheet_columns').upsert(cols, { onConflict: 'tab,ordinal' });
      if (error) throw new Error(`columns: ${error.message}`);
    }
    await db.from('master_sheet_columns').delete().eq('tab', tab).gte('ordinal', headers.length);

    const durationMs = Date.now() - t0;
    await db.from('master_sheet_sync').update({
      status: 'idle', last_success_at: new Date().toISOString(), last_error: null,
      sheet_modified: modified, row_count: shaped.length, changed_rows: changed.length, duration_ms: durationMs,
    }).eq('tab', tab);

    return { tab, changed: changed.length, deleted: gone.length, rowCount: shaped.length, durationMs };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    // Always release the lease — a stuck 'running' would block every later run
    // until the 5-minute expiry.
    await db.from('master_sheet_sync').update({ status: 'error', last_error: msg.slice(0, 500), duration_ms: Date.now() - t0 }).eq('tab', tab);
    return { tab, error: msg };
  }
}

// ---- verify: compare sheet against DB, write nothing ------------------------
async function verifyTab(tab: string): Promise<Record<string, unknown>> {
  const raw = await readSheetRaw(tab);
  const headers = (raw[0] || []).map(h => String(h ?? '').trim());
  const shaped = await shapeRows(tab, raw, headers);

  const stored = await readAllRows('row_num, content_hash, cells', tab);
  const byNum = new Map<number, any>(stored.map((r: any) => [r.row_num, r]));

  const mismatches: string[] = [];
  for (const r of shaped) {
    if (mismatches.length >= 25) break;
    const s = byNum.get(r.row_num);
    if (!s) { mismatches.push(`row ${r.row_num}: missing in DB`); continue; }
    if (s.content_hash !== r.content_hash) {
      const i = r.cells.findIndex((c, idx) => c !== String((s.cells || [])[idx] ?? ''));
      mismatches.push(`row ${r.row_num}: differs at column ${i >= 0 ? headers[i] || i : '?'}`);
    }
  }
  const kept = new Set(shaped.map(r => r.row_num));
  const extra = [...byNum.keys()].filter(rn => !kept.has(rn));

  const { data: colRows } = await db.from('master_sheet_columns').select('ordinal, header').eq('tab', tab).order('ordinal');
  const cols = colRows || [];
  const width = Math.max(cols.length, headers.length);
  let headerDrift = 0;
  for (let i = 0; i < width; i++) if ((cols[i]?.header ?? null) !== (headers[i] ?? null)) headerDrift++;

  return {
    tab, sheetRows: shaped.length, dbRows: stored.length,
    extraInDb: extra.length, headerDrift, mismatches,
    clean: mismatches.length === 0 && extra.length === 0 && headerDrift === 0 && shaped.length === stored.length,
  };
}

// ---- entry ------------------------------------------------------------------
// Constant-time-ish compare so the secret can't be probed byte by byte.
function secretOk(given: string, expected: string): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  const { data: sec } = await db.from('app_secrets').select('value').eq('key', 'master_sync_secret').maybeSingle();
  const expected = sec?.value ?? '';
  if (!expected) return json({ ok: false, error: 'master_sync_secret is not configured' }, 503);
  if (!secretOk(req.headers.get('x-sync-secret') || '', expected)) return json({ ok: false, error: 'forbidden' }, 403);

  const body = await req.json().catch(() => ({}));
  const mode = ['auto', 'full', 'verify'].includes(body?.mode) ? body.mode : 'auto';

  try {
    if (mode === 'verify') {
      const results = [];
      for (const tab of MASTER_TABS) results.push(await verifyTab(tab));
      return json({ ok: true, mode, results, clean: results.every((r: any) => r.clean) });
    }

    // One probe for the whole spreadsheet, shared by both tabs. `full` probes
    // too — not to decide anything, but so the stored timestamp stays current
    // and the next `auto` tick can still skip.
    const modified = await driveModifiedTime();
    const results: TabResult[] = [];
    for (const tab of MASTER_TABS) results.push(await syncTab(tab, mode, modified));

    // NOTE: product_catalog (SKU autosuggest) is NOT refreshed here. It is
    // rebuilt by its own pg_cron job calling refresh_product_catalog(), which
    // skips rows that did not change — so a quiet poll writes nothing and this
    // function needs no redeploy when the catalog's shape changes.
    return json({ ok: !results.some(r => r.error), mode, probe: modified ? 'drive' : 'none', probeError, results });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
