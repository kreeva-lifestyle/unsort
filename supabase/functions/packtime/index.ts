// packtime Edge Function — the Google Sheet side of PackStation.
//
// Client contract (src/pages/PackTime.tsx and components/packtime/*):
//   POST { action: 'init',   sheetName }               -> { ok, awbs, totalRows, columnsOk, columnsInfo? }
//   POST { action: 'sync' }                             -> { ok, appended, cleared, failed, open }
//   POST { action: 'verify', day?, repair?, notify? }   -> { ok, day, sheets: [{ sheet, courier, inApp, inSheet, missing, extra, requeued }] }
//   Old app versions (until every phone has updated):
//   POST { action: 'batch',  sheetName, rows: any[][] } -> { ok }
//   POST { action: 'delete', sheetName, awb }          -> { ok }
//
// Since migration 20261026100000_packtime_sheet_queue the phone only inserts
// into packtime_scans (sheet_by_server = true); triggers queue one 'append'
// per scan and one 'clear' per deleted scan in packtime_sheet_queue, and
// 'sync' here carries them to the sheet: pg_cron fires it every minute the
// queue has work, and the phone kicks it right after a scan lands so the
// sheet follows within seconds. 'verify' (daily 20:35 IST, and the Scan
// History "Check sheet" button) compares a day's scans with the sheet,
// re-queues what the sheet is missing and notifies admins/managers.
//
// Row layout in the spreadsheet: A=Count | B=AWB | C=Timestamp | D=Camera | E=Brand.
//
// Auth: a signed-in active profile (Bearer token), or the x-sync-secret
// header matching app_secrets.packtime_sync_secret (the scheduler).
//
// Secrets required in the Supabase project (supabase secrets set ...):
//   GOOGLE_CLIENT_EMAIL   service-account email
//   GOOGLE_PRIVATE_KEY    service-account private_key (PKCS8 PEM; \n escapes OK)
//   GOOGLE_SHEET_ID       master spreadsheet ID containing the courier tabs

// deno-lint-ignore-file no-explicit-any

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const svcHeaders = { apikey: SB_SVC, authorization: `Bearer ${SB_SVC}`, 'content-type': 'application/json' };

const ALLOWED_ORIGINS = [
  'https://dailyoffice.aryadesigns.co.in',
  'http://localhost:5173',
  'http://localhost:4173',
];

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
  };
}

const json = (body: unknown, req: Request, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'content-type': 'application/json' } });

const fail = (status: number, error: string, req: Request, details?: string) =>
  json({ ok: false, error, details }, req, status);

// Fix the single most common cause of "incorrect length for PRIVATE [25]":
// env-var pasted private keys with literal "\n" instead of real newlines.
function pemToDer(pem: string): Uint8Array {
  const normalized = pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
  const body = normalized
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64url(input: Uint8Array | string): string {
  const bin = typeof input === 'string' ? input : String.fromCharCode(...input);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getGoogleToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const email = Deno.env.get('GOOGLE_CLIENT_EMAIL');
  const pkRaw = Deno.env.get('GOOGLE_PRIVATE_KEY');
  if (!email) throw new Error('Missing GOOGLE_CLIENT_EMAIL secret');
  if (!pkRaw) throw new Error('Missing GOOGLE_PRIVATE_KEY secret');

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(pkRaw),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const sigInput = `${header}.${claims}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(sigInput));
  const jwt = `${sigInput}.${b64url(new Uint8Array(sig))}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await r.json();
  if (!r.ok || !data.access_token) throw new Error(`Google token: ${data.error_description || data.error || r.status}`);
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return data.access_token;
}

function sheetId(): string {
  const id = Deno.env.get('GOOGLE_SHEET_ID');
  if (!id) throw new Error('Missing GOOGLE_SHEET_ID secret');
  return id;
}

async function sheetsGet(range: string): Promise<string[][]> {
  const token = await getGoogleToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}/values/${encodeURIComponent(range)}`;
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const data = await r.json();
  if (!r.ok) throw new Error(`Sheets get ${r.status}: ${data.error?.message || 'unknown'}`);
  return (data.values as string[][] | undefined) || [];
}

/** Appends and returns the first row number the rows landed on (1-based). */
async function sheetsAppend(sheetName: string, rows: unknown[][]): Promise<number> {
  const token = await getGoogleToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}/values/${encodeURIComponent(sheetName + '!A:E')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ values: rows }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Sheets append ${r.status}: ${data.error?.message || 'unknown'}`);
  // "Delhivery!A101:E105" → 101
  const m = String(data.updates?.updatedRange || '').match(/![A-Z]+(\d+)(?::|$)/);
  if (!m) throw new Error('Sheets append: no updatedRange in the reply');
  return Number(m[1]);
}

async function sheetsClearRow(sheetName: string, rowNumber: number): Promise<void> {
  const token = await getGoogleToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}/values/${encodeURIComponent(`${sheetName}!A${rowNumber}:E${rowNumber}`)}:clear`;
  const r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(`Sheets clear ${r.status}: ${data.error?.message || 'unknown'}`);
  }
}

// ── Caller verification ──────────────────────────────────────────────────────
// The Bearer token must belong to a signed-in, active profile (same real
// verification client-finder and odette-export use). The scheduler instead
// presents the shared secret from app_secrets.
async function caller(req: Request): Promise<{ id: string } | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: SB_SVC } });
  if (!u.ok) return null;
  const user = await u.json().catch(() => null);
  if (!user?.id) return null;
  const p = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=is_active`, { headers: svcHeaders });
  const rows = await p.json().catch(() => []);
  const prof = rows?.[0];
  if (!prof || prof.is_active === false) return null;
  return { id: user.id };
}

function secretOk(given: string, expected: string): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function schedulerOk(req: Request): Promise<boolean> {
  const given = req.headers.get('x-sync-secret') || '';
  if (!given) return false;
  const r = await fetch(`${SB_URL}/rest/v1/app_secrets?key=eq.packtime_sync_secret&select=value`, { headers: svcHeaders });
  const rows = await r.json().catch(() => []);
  return secretOk(given, String(rows?.[0]?.value || ''));
}

// ── Sheet-name validation ────────────────────────────────────────────────────
// Validates against the couriers actually configured in packtime_couriers —
// self-maintaining and FAIL-CLOSED. 5-min in-isolate cache; a failed lookup
// rejects rather than letting the name through.
let sheetCache: { rows: { name: string; sheet_name: string; is_active: boolean }[]; at: number } | null = null;
async function configuredSheets(): Promise<{ name: string; sheet_name: string; is_active: boolean }[] | null> {
  if (!sheetCache || Date.now() - sheetCache.at > 5 * 60_000) {
    const r = await fetch(`${SB_URL}/rest/v1/packtime_couriers?select=name,sheet_name,is_active`, { headers: svcHeaders });
    if (!r.ok) return null; // unknown — caller must fail closed
    const rows = await r.json().catch(() => null);
    if (!Array.isArray(rows)) return null;
    sheetCache = { rows: rows.map((x: any) => ({ name: String(x.name || ''), sheet_name: String(x.sheet_name || '').trim(), is_active: x.is_active !== false })).filter((x: any) => x.sheet_name), at: Date.now() };
  }
  return sheetCache.rows;
}
async function isConfiguredSheet(sheetName: string): Promise<boolean | null> {
  const rows = await configuredSheets();
  if (!rows) return null;
  if (!rows.some(r => r.sheet_name === sheetName)) return false;
  const allow = (Deno.env.get('ALLOWED_SHEETS') || '').split(',').map(s => s.trim()).filter(Boolean);
  return allow.length === 0 || allow.includes(sheetName);
}

function verifyColumns(header: string[] | undefined): { ok: boolean; info?: string } {
  if (!header || header.length === 0) return { ok: true };
  const expected = ['Count', 'AWB', 'Timestamp', 'Camera'];
  const mismatch = expected.some((e, i) => {
    const h = (header[i] ?? '').trim().toLowerCase();
    // Column D is labelled "Camera Number" in the app UI and in real sheets, but
    // was historically documented as just "Camera" — accept either.
    if (i === 3) return !h.startsWith('camera');
    return h !== e.toLowerCase();
  });
  if (!mismatch) return { ok: true };
  return { ok: false, info: `Found headers: ${header.slice(0, 4).map(h => h || '(empty)').join(' | ')}` };
}

// ── The sheet row, as the app has always written it ─────────────────────────
// C = "DD/MM/YYYY HH:mm:ss" in IST — the phone's own clock, which the
// server-side real scan time (scanned_at) reproduces.
const IST = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
function istStamp(iso: string): string {
  const p: Record<string, string> = {};
  for (const part of IST.formatToParts(new Date(iso))) p[part.type] = part.value;
  return `${p.day}/${p.month}/${p.year} ${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`;
}
const istDay = (iso: string) => istStamp(iso).slice(0, 10);   // DD/MM/YYYY

type Op = { id: number; kind: 'append' | 'clear'; scan_id: string | null; sheet_name: string; payload: any; attempts: number };

async function rpc<T>(name: string, args: unknown): Promise<T> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: svcHeaders, body: JSON.stringify(args) });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${name}: ${data?.message || r.status}`);
  return data as T;
}

/** Row number of the AWB in the sheet, by lookup (a manual row deletion shifts numbers; the AWB does not move). */
async function findRowByAwb(sheetName: string, awb: string, hint: number | null): Promise<number | null> {
  const rows = await sheetsGet(`${sheetName}!A1:E`);
  const want = awb.trim().toUpperCase();
  if (hint && rows[hint - 1] && String(rows[hint - 1][1] || '').trim().toUpperCase() === want) return hint;
  const idx = rows.findIndex((r, i) => i > 0 && String(r[1] || '').trim().toUpperCase() === want);
  return idx < 0 ? null : idx + 1;
}

/** Drain the queue: appends batched per sheet (≤ 50), clears one by one. Bounded per call; the next minute takes the rest. */
async function runSync(): Promise<{ appended: number; cleared: number; failed: number; open: number }> {
  const out = { appended: 0, cleared: 0, failed: 0, open: 0 };
  const ops = await rpc<Op[]>('packtime_sheet_claim', { p_limit: 100 });
  const done: any[] = [], failed: any[] = [];
  let i = 0;
  while (i < ops.length) {
    const op = ops[i];
    if (op.kind === 'clear') {
      i++;
      try {
        const row = await findRowByAwb(op.sheet_name, String(op.payload?.awb || ''), op.payload?.sheet_row ?? null);
        if (row) await sheetsClearRow(op.sheet_name, row);
        done.push({ op: op.id }); out.cleared++;
      } catch (e) { failed.push({ op: op.id, scan: op.scan_id, error: (e as Error).message }); out.failed++; }
      continue;
    }
    // A run of appends for one sheet, in queue order.
    const batch: Op[] = [];
    while (i < ops.length && ops[i].kind === 'append' && ops[i].sheet_name === op.sheet_name && batch.length < 50) batch.push(ops[i++]);
    try {
      // Next count = rows already in the table (header included) — the same
      // number the app derived from init's totalRows + 1.
      const colA = await sheetsGet(`${op.sheet_name}!A:A`);
      const nextCount = Math.max(1, colA.length);
      const rows = batch.map((b, k) => [nextCount + k, b.payload.awb, istStamp(b.payload.scanned_at), b.payload.camera, b.payload.brand]);
      const first = await sheetsAppend(op.sheet_name, rows);
      batch.forEach((b, k) => done.push({ op: b.id, scan: b.scan_id, row: first + k, sheet: b.sheet_name, awb: b.payload.awb }));
      out.appended += batch.length;
    } catch (e) {
      const msg = (e as Error).message;
      for (const b of batch) failed.push({ op: b.id, scan: b.scan_id, error: msg });
      out.failed += batch.length;
    }
  }
  if (done.length || failed.length) await rpc('packtime_sheet_done', { p_done: done, p_failed: failed });
  const openR = await fetch(`${SB_URL}/rest/v1/packtime_sheet_queue?done_at=is.null&select=id`, { headers: { ...svcHeaders, prefer: 'count=exact', range: '0-0' } });
  out.open = Number((openR.headers.get('content-range') || '').split('/')[1] || 0);
  return out;
}

type Check = { sheet: string; courier: string; inApp: number; inSheet: number; missing: string[]; extra: string[]; requeued: number; error?: string };

/** One day's scans (IST) against the sheet, per courier. `repair` re-queues what the sheet is missing. */
async function runVerify(day: string, repair: boolean): Promise<Check[]> {
  const couriers = (await configuredSheets()) || [];
  const [y, m, d] = day.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 5.5 * 3600_000).toISOString();
  const end = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - 5.5 * 3600_000).toISOString();
  const dayDM = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  const checks: Check[] = [];
  for (const c of couriers.filter(x => x.is_active)) {
    const check: Check = { sheet: c.sheet_name, courier: c.name, inApp: 0, inSheet: 0, missing: [], extra: [], requeued: 0 };
    try {
      const r = await fetch(`${SB_URL}/rest/v1/packtime_scans?sheet_name=eq.${encodeURIComponent(c.sheet_name)}&scanned_at=gte.${start}&scanned_at=lt.${end}&select=id,awb&limit=10000`, { headers: svcHeaders });
      const scans: { id: string; awb: string }[] = r.ok ? await r.json() : [];
      const rows = await sheetsGet(`${c.sheet_name}!A1:E`);
      const sheetAll = new Set(rows.slice(1).map(x => String(x[1] || '').trim().toUpperCase()).filter(Boolean));
      const sheetDay = rows.slice(1).filter(x => String(x[2] || '').startsWith(dayDM)).map(x => String(x[1] || '').trim().toUpperCase()).filter(Boolean);
      const appSet = new Set(scans.map(s => s.awb.trim().toUpperCase()));
      check.inApp = scans.length; check.inSheet = sheetDay.length;
      const missingScans = scans.filter(s => !sheetAll.has(s.awb.trim().toUpperCase()));
      check.missing = missingScans.map(s => s.awb);
      check.extra = sheetDay.filter(a => !appSet.has(a));
      if (repair && missingScans.length) check.requeued = await rpc<number>('packtime_sheet_requeue', { p_scan_ids: missingScans.map(s => s.id) });
    } catch (e) { check.error = (e as Error).message; }
    checks.push(check);
  }
  return checks;
}

/** Tell every active admin / manager when a day's check found a mismatch. */
async function notifyManagers(day: string, checks: Check[]): Promise<void> {
  const bad = checks.filter(c => c.missing.length || c.extra.length || c.error);
  if (!bad.length) return;
  const r = await fetch(`${SB_URL}/rest/v1/profiles?role=in.(admin,manager)&is_active=eq.true&select=id`, { headers: svcHeaders });
  const people: { id: string }[] = r.ok ? await r.json() : [];
  const lines = bad.map(c => c.error ? `${c.courier}: check failed (${c.error})`
    : `${c.courier}: ${c.missing.length ? `${c.missing.length} not in sheet (${c.missing.slice(0, 5).join(', ')}${c.missing.length > 5 ? '…' : ''})${c.requeued ? ' — queued again' : ''}` : ''}${c.missing.length && c.extra.length ? ' · ' : ''}${c.extra.length ? `${c.extra.length} in sheet only` : ''}`);
  const body = people.map(p => ({ user_id: p.id, title: `PackStation sheet check · ${day}`, message: lines.join('\n'), type: 'warning' }));
  if (body.length) await fetch(`${SB_URL}/rest/v1/notifications`, { method: 'POST', headers: { ...svcHeaders, prefer: 'return=minimal' }, body: JSON.stringify(body) });
}

const todayIST = () => { const s = istStamp(new Date().toISOString()); return `${s.slice(6, 10)}-${s.slice(3, 5)}-${s.slice(0, 2)}`; };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return fail(405, 'Method not allowed', req);

  let body: any;
  try { body = await req.json(); } catch { return fail(400, 'Invalid JSON body', req); }
  const action = String(body?.action || '');
  if (!action) return fail(400, 'Missing action', req);

  const fromScheduler = await schedulerOk(req);
  if (!fromScheduler && !(await caller(req))) return fail(401, 'Sign in to DailyOffice first', req);

  try {
    if (action === 'sync') return json({ ok: true, ...(await runSync()) }, req);
    if (action === 'verify') {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(String(body.day || '')) ? String(body.day) : todayIST();
      const checks = await runVerify(day, body.repair !== false);
      if (body.notify) await notifyManagers(day, checks);
      return json({ ok: true, day, sheets: checks }, req);
    }

    const sheetName = String(body?.sheetName || '').trim();
    if (!sheetName) return fail(400, 'Missing sheetName', req);
    const configured = await isConfiguredSheet(sheetName);
    if (configured === null) return fail(503, 'Could not verify the courier sheet — try again in a moment', req);
    if (!configured) return fail(403, `Sheet "${sheetName}" is not a configured courier sheet`, req);

    if (action === 'init') {
      const rows = await sheetsGet(`${sheetName}!A1:E`);
      const col = verifyColumns(rows[0]);
      const awbs = rows.slice(1).map(r => r[1]).filter(Boolean).map(String);
      return json({ ok: true, awbs, totalRows: Math.max(0, rows.length - 1), columnsOk: col.ok, columnsInfo: col.info }, req);
    }
    if (action === 'batch') {   // old app versions only
      if (!Array.isArray(body.rows) || body.rows.length === 0) return fail(400, 'rows missing or empty', req);
      await sheetsAppend(sheetName, body.rows);
      return json({ ok: true }, req);
    }
    if (action === 'delete') {  // old app versions only
      const awb = String(body.awb || '').trim().toUpperCase();
      if (!awb) return fail(400, 'awb missing', req);
      const row = await findRowByAwb(sheetName, awb, null);
      if (row) await sheetsClearRow(sheetName, row);
      return json({ ok: true }, req);
    }
    return fail(400, `Unknown action: ${action}`, req);
  } catch (e) {
    const msg = (e as Error)?.message || 'Server error';
    console.error('packtime error:', msg);
    return fail(500, 'Server error', req, msg);
  }
});
