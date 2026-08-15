// master-sync — pulls the Google master sheet into master_sheet_rows.
//
// One-way for DATA: the sheet is the only place data is edited; the sync never
// writes business values back. The single, owner-requested exception is
// `spellfix`: a weekly pass that corrects dictionary-verified garment/fabric
// misspellings IN the sheet (see the spellfix section for why that is safe),
// logs every cell it touches, and notifies the admins.
//
// Called by pg_cron, never by a browser:
//   POST { mode: 'auto'         } -> sync only if Drive says the file changed
//   POST { mode: 'full'         } -> sync unconditionally (hourly reconcile)
//   POST { mode: 'verify'       } -> diff sheet against DB, write NOTHING
//   POST { mode: 'spellfix'     } -> auto-correct misspellings in the sheet (weekly)
//   POST { mode: 'spellfix_dry' } -> report what spellfix WOULD change, write nothing
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

// Known core tabs — kept as a FALLBACK for discovery so a Sheets API hiccup can
// never shrink the mirror below these. Data tabs are otherwise discovered
// dynamically: any worksheet whose header row has an SKU column (see
// discoverDataTabs), so a new brand tab in the master sheet is synced with no
// code change. listing-ai reads whatever tabs this populates.
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

// Write scope exists ONLY for spellfix. Every other caller stays read-only,
// so a bug elsewhere in this file still cannot touch the sheet.
const WRITE_SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

const tokenCaches = new Map<string, { token: string; expiresAt: number }>();
async function googleToken(scopes: string = SCOPES): Promise<string> {
  const cached = tokenCaches.get(scopes);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const email = Deno.env.get('GOOGLE_CLIENT_EMAIL');
  const pkRaw = Deno.env.get('GOOGLE_PRIVATE_KEY');
  if (!email || !pkRaw) throw new Error('Missing GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY');
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(pkRaw), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' +
    b64url(JSON.stringify({ iss: email, scope: scopes, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(unsigned));
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(new Uint8Array(sig))}` }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Google OAuth ${resp.status}: ${data.error_description || data.error || 'unknown'}`);
  tokenCaches.set(scopes, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 });
  return data.access_token;
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

// Every worksheet title in the spreadsheet — one cheap metadata call.
async function listTabTitles(): Promise<string[]> {
  const token = await googleToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}?fields=sheets.properties.title`;
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.message || `list tabs ${r.status}`);
  return (data.sheets || []).map((s: any) => String(s?.properties?.title ?? '').trim()).filter(Boolean);
}

// A worksheet counts as product data when its header row (row 1) has an SKU
// column — the same signal every reader uses. Reads only row 1, so classifying
// a helper tab (Instructions, Pivots, dropdown lists) is cheap; those are left
// out of the mirror entirely.
async function tabHasSkuColumn(tab: string): Promise<boolean> {
  const token = await googleToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}/values/${encodeURIComponent(tab + '!1:1')}`;
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) return false;
  const data = await r.json().catch(() => ({}));
  const headers = ((data.values || [])[0] || []).map((h: any) => String(h ?? '').toLowerCase());
  return headers.some((h: string) => h.includes('sku'));
}

// The data tabs to sync. Discovered dynamically; the known core is always kept
// so a transient Sheets error (list fails, or a core tab momentarily
// misclassifies) can never drop ARYA/DRESSTIVE from the mirror. Reports every
// worksheet title it saw (and any skipped as non-data) so the sync response is
// self-explaining about WHY a tab is or isn't in the mirror.
async function discoverDataTabs(): Promise<{ dataTabs: string[]; allTabs: string[]; skipped: string[]; discoverError?: string }> {
  try {
    const titles = await listTabTitles();
    const out: string[] = [];
    const skipped: string[] = [];
    for (const t of titles) {
      try { if (await tabHasSkuColumn(t)) out.push(t); else skipped.push(t); }
      catch { skipped.push(t); }
    }
    for (const t of MASTER_TABS) if (!out.includes(t)) out.push(t);
    return { dataTabs: out, allTabs: titles, skipped };
  } catch (e) {
    return { dataTabs: [...MASTER_TABS], allTabs: [], skipped: [], discoverError: (e as Error).message };
  }
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
        // A probe that CONFIRMED the sheet is unchanged is a successful
        // freshness check — record it as one. Updating only `status` here left
        // last_success_at frozen at the last work-doing run, so consumers
        // gating on it (listing-ai's 45-min staleness window vs the hourly
        // full sync) declared a byte-perfect mirror "stale" for 15 minutes of
        // every hour and fell back to slow direct Google reads.
        await db.from('master_sheet_sync').update({ status: 'idle', last_success_at: new Date().toISOString(), last_error: null }).eq('tab', tab);
        return { tab, skipped: true, reason: 'sheet unchanged' };
      }
      // No probe (Drive unavailable): do not re-download every two minutes.
      if (!modified && lease.last_success_at && Date.now() - new Date(lease.last_success_at).getTime() < BLIND_RESYNC_MS) {
        await db.from('master_sheet_sync').update({ status: 'idle' }).eq('tab', tab);
        return { tab, skipped: true, reason: 'no drive probe, synced recently' };
      }
    }

    const raw = await readSheetRaw(tab);
    // < 2, not === 0: a header-only response would make shapeRows return [],
    // and the vanished-rows delete below would then wipe the ENTIRE tab from
    // the mirror — after which product_catalog's next refresh empties every
    // SKU suggestion in the app. A sheet that really has zero data rows and a
    // truncated/glitched API response are indistinguishable here, so refuse
    // both; the error lands in the ledger and the next run retries.
    if (raw.length < 2) throw new Error('tab came back with no data rows — refusing to clear the mirror');
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

// ── Weekly spelling autofix ──────────────────────────────────────────────────
// The one sanctioned write-back. Safe because corrections only ever move
// TOWARD a fixed dictionary of garment/fabric words — the same matcher the
// Master Assistant's report uses (5+ letters, same first letter, edit
// distance 1, or 2 when both words have 7+; identifier/link/price/catalog
// columns never scanned; real words like "formal"/"living" never flag). A
// trade name has no dictionary neighbour, so it cannot be "corrected".
// Guard rails: at most SPELLFIX_CAP cells per run, every change logged to
// master_spellfix_log with before/after, admins notified in-app, and the fix
// is computed from a LIVE read in the same invocation (never the mirror), so
// it cannot clobber an edit made minutes ago.
const SPELLFIX_CAP = 200;
const SPELL_SKIP_COL = /image|link|url|price|mrp|\bgst\b|hsn|qty|quantity|amount|date|\bsku\b|catalog|status|stock|\bno\b/i;
const SPELL_VOCAB = [
  'lehenga', 'choli', 'dupatta', 'chunni', 'kurta', 'kurti', 'saree', 'anarkali', 'sharara',
  'gharara', 'palazzo', 'blouse', 'salwar', 'kameez', 'churidar', 'gowns', 'dress',
  'cotton', 'georgette', 'chiffon', 'organza', 'velvet', 'rayon', 'viscose', 'crepe',
  'brocade', 'jacquard', 'banarasi', 'chanderi', 'taffeta', 'satin', 'fabric',
  // 'sequined'/'sequinned' (both accepted spellings) and 'sleeved' are REAL
  // words the production dry-runs
  // tried to "correct" - in the vocabulary they are recognised, not altered.
  'embroidery', 'embroidered', 'embellished', 'sequins', 'sequin', 'sequined', 'sequinned', 'zardozi', 'mirror',
  'thread', 'stitched', 'unstitched', 'bandhani', 'phulkari',
  'chikankari', 'sleeve', 'sleeves', 'sleeved', 'sleeveless', 'neckline', 'drawstring', 'lining',
].filter(w => w.length >= 5);
const spellVocabSet = new Set(SPELL_VOCAB);
const SPELL_SAFE = new Set(['living']);

function editDist(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function spellSuggest(word: string): string | null {
  if (word.length < 5 || spellVocabSet.has(word) || SPELL_SAFE.has(word)) return null;
  const stem = word.endsWith('s') ? word.slice(0, -1) : '';
  if (stem && spellVocabSet.has(stem)) return null;
  let best: string | null = null, bestD = 3;
  for (const v of SPELL_VOCAB) {
    if (v[0] !== word[0]) continue;
    const max = word.length >= 7 && v.length >= 7 ? 2 : 1;
    const d = editDist(word, v, max);
    if (d <= max && d < bestD) { bestD = d; best = v; }
  }
  return best;
}

// Correct every misspelled token in one cell, keeping the writer's casing
// (GORGETTE -> GEORGETTE, Gorgette -> Georgette) and a trailing plural s.
function fixCellText(text: string): { fixed: string; words: string[] } | null {
  const words: string[] = [];
  const fixed = text.replace(/[A-Za-z]{5,}/g, (tok) => {
    const lower = tok.toLowerCase();
    const sug = spellSuggest(lower);
    if (!sug) return tok;
    let out = sug;
    if (lower.endsWith('s') && !sug.endsWith('s')) out += 's';
    if (tok === tok.toUpperCase()) out = out.toUpperCase();
    else if (tok[0] === tok[0].toUpperCase()) out = out[0].toUpperCase() + out.slice(1);
    words.push(`${tok}\u2192${out}`);
    return out;
  });
  return words.length ? { fixed, words } : null;
}

const colA1 = (i: number): string => {
  let n = i + 1, out = '';
  while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
  return out;
};

interface SpellFixPlan { range: string; tab: string; column: string; sku: string; before: string; after: string; words: string[] }

async function spellfixRun(dry: boolean): Promise<Record<string, unknown>> {
  const disc = await discoverDataTabs();
  const plans: SpellFixPlan[] = [];
  let scannedCells = 0, capped = false;
  for (const tab of disc.dataTabs) {
    const rows = await readSheetRaw(tab);
    if (rows.length < 2) continue;
    const headers = rows[0].map(h => String(h || '').trim());
    const skuIdx = headers.findIndex(h => /\bsku\b/i.test(h));
    const scanCols = headers.map((h, i) => ({ h, i })).filter(c => c.h && !SPELL_SKIP_COL.test(c.h));
    for (let r = 1; r < rows.length; r++) {
      for (const { h, i } of scanCols) {
        const text = String(rows[r][i] ?? '');
        if (!text) continue;
        scannedCells++;
        const fix = fixCellText(text);
        if (!fix) continue;
        if (plans.length >= SPELLFIX_CAP) { capped = true; break; }
        plans.push({
          range: `'${tab.replace(/'/g, "''")}'!${colA1(i)}${r + 1}`,
          tab, column: h,
          sku: String(rows[r][skuIdx] ?? '').trim() || `row ${r + 1}`,
          before: text, after: fix.fixed, words: fix.words,
        });
      }
      if (capped) break;
    }
    if (capped) break;
  }

  if (dry || plans.length === 0) {
    return { ok: true, mode: dry ? 'spellfix_dry' : 'spellfix', scannedCells, cellsToFix: plans.length, capped, changes: plans, wrote: false };
  }

  // One batch write for all fixes. RAW so the corrected text lands verbatim.
  const token = await googleToken(WRITE_SCOPES);
  const w = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}/values:batchUpdate`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'RAW', data: plans.map(p => ({ range: p.range, values: [[p.after]] })) }),
  });
  if (!w.ok) {
    const err = await w.json().catch(() => ({}));
    const sa = Deno.env.get('GOOGLE_CLIENT_EMAIL') || 'the service account';
    const hint = w.status === 403 ? ` — share the master sheet with ${sa} as Editor to allow the weekly autofix` : '';
    throw new Error(`Sheets write ${w.status}: ${err.error?.message || 'unknown'}${hint}`);
  }

  // Audit trail + admin notification. Log failures must not undo the fix —
  // the write already happened — so they surface as a warning, not a throw.
  const warnings: string[] = [];
  const { error: logErr } = await db.from('master_spellfix_log').insert(plans.map(p => ({
    tab: p.tab, cell: p.range, column_name: p.column, sku: p.sku,
    before_text: p.before, after_text: p.after, words: p.words.join(', '),
  })));
  if (logErr) warnings.push(`log insert failed: ${logErr.message}`);
  const { data: admins } = await db.from('profiles').select('id').eq('role', 'admin').eq('is_active', true);
  const wordCount = plans.reduce((n, p) => n + p.words.length, 0);
  const sample = plans.slice(0, 3).map(p => p.words[0]).join(', ');
  if (admins?.length) {
    const { error: notifErr } = await db.from('notifications').insert(admins.map((a: { id: string }) => ({
      user_id: a.id, type: 'info',
      title: 'Master sheet spelling autofix',
      message: `Corrected ${wordCount} word${wordCount === 1 ? '' : 's'} in ${plans.length} cell${plans.length === 1 ? '' : 's'} of the Google master sheet (e.g. ${sample}).${capped ? ' More remain — the next weekly run continues.' : ''} The app picks the changes up within minutes.`,
    })));
    if (notifErr) warnings.push(`notification insert failed: ${notifErr.message}`);
  }
  return { ok: true, mode: 'spellfix', scannedCells, cellsFixed: plans.length, wordsFixed: wordCount, capped, changes: plans, wrote: true, warnings: warnings.length ? warnings : undefined };
}

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
  const mode = ['auto', 'full', 'verify', 'spellfix', 'spellfix_dry'].includes(body?.mode) ? body.mode : 'auto';

  try {
    if (mode === 'spellfix' || mode === 'spellfix_dry') {
      return json(await spellfixRun(mode === 'spellfix_dry'));
    }
    if (mode === 'verify') {
      const disc = await discoverDataTabs();
      const results = [];
      for (const tab of disc.dataTabs) results.push(await verifyTab(tab));
      return json({ ok: true, mode, allTabs: disc.allTabs, skipped: disc.skipped, discoverError: disc.discoverError, results, clean: results.every((r: any) => r.clean) });
    }

    // One probe for the whole spreadsheet, shared by all tabs. `full` probes
    // too — not to decide anything, but so the stored timestamp stays current
    // and the next `auto` tick can still skip.
    const modified = await driveModifiedTime();
    const disc = await discoverDataTabs();
    // A newly-discovered tab has no lease row yet; syncTab's lease UPDATE would
    // match nothing and skip it forever. Insert a placeholder (idle, defaults)
    // without disturbing existing rows.
    await db.from('master_sheet_sync').upsert(disc.dataTabs.map(t => ({ tab: t })), { onConflict: 'tab', ignoreDuplicates: true });
    const results: TabResult[] = [];
    for (const tab of disc.dataTabs) results.push(await syncTab(tab, mode, modified));

    // NOTE: product_catalog (SKU autosuggest) is NOT refreshed here. It is
    // rebuilt by its own pg_cron job calling refresh_product_catalog(), which
    // skips rows that did not change — so a quiet poll writes nothing and this
    // function needs no redeploy when the catalog's shape changes.
    return json({ ok: !results.some(r => r.error), mode, probe: modified ? 'drive' : 'none', probeError, allTabs: disc.allTabs, skipped: disc.skipped, discoverError: disc.discoverError, results });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
