// odette-export Edge Function — Odette sheet push/reconcile + master-sheet
// image LINK CHECK / AUTO-FIX + Dropbox LINK GENERATOR + FORWARD→DROPBOX.
//
// Actions (caller role validated against profiles.role via callerRole):
//   dropbox_status / dropbox_whoami / dropbox_exchange(admin) — connection
//   linkcheck / linkfix / linkgen_roots / linkgen — master-sheet + link tools
//   fwd_folder { op:'list'|'save' } — signed-in. The single shared Dropbox
//      folder that Forward→Dropbox uploads into (vault dropbox_fwd_folder).
//      Any signed-in user may set it (owner's call), mirroring linkgen_roots.
//   fwd_upload { dataUrl, dateStr } — signed-in. Uploads one compressed JPEG
//      into that folder, named <date>.jpg (same-day → <date> (2).jpg …). Needs
//      the Dropbox token's files.content.write scope (in the connect URL).
//   GET ?thumb=<link>&k=<anon key> — streams a 256px JPEG thumbnail (no store)
//   push / reconcile — legacy Google Sheets behaviour
//
// Dropbox creds + folder links live in app_secrets (service-role only).

// deno-lint-ignore-file no-explicit-any

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
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

const json = (body: unknown, req: Request, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'content-type': 'application/json' } });

const fail = (status: number, error: string, req: Request, details?: string) =>
  json({ ok: false, error, details }, req, status);

// Dropbox requires the Dropbox-API-Arg header to be ASCII; JSON.stringify emits
// raw UTF-8, so escape any non-ASCII to \uXXXX to avoid a "Bad HTTP header" 400.
const asciiArg = (o: unknown) =>
  JSON.stringify(o).replace(/[^\x00-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

function pemToDer(pem: string): Uint8Array {
  const normalized = pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
  const body = normalized.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, '');
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
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(pkRaw), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64url(JSON.stringify({ iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${b64url(new Uint8Array(sig))}`;
  const resp = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Google OAuth ${resp.status}: ${data.error_description || data.error || 'unknown'}`);
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
}

function getSheetId(): string {
  const id = Deno.env.get('ODETTE_SHEET_ID') || Deno.env.get('GOOGLE_SHEET_ID');
  if (!id) throw new Error('Missing ODETTE_SHEET_ID or GOOGLE_SHEET_ID secret');
  return id;
}

function getMasterSheetId(): string {
  const id = Deno.env.get('MASTER_SHEET_ID');
  if (!id) throw new Error('Missing MASTER_SHEET_ID secret');
  return id;
}

const MASTER_TABS = ['ARYA', 'DRESSTIVE'];

const normSku = (v: unknown) => String(v ?? '').trim().toUpperCase();

const SIZE_TOKENS = new Set(['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']);
const baseSku = (sku: string) => sku.replace(/[-\s]?(XXXL|XXL|XL|XXS|XS|S|M|L)$/i, '');

function nameMatchesSku(rawName: string, sku: string): boolean {
  const name = normSku(rawName).replace(/\.ZIP$/i, '');
  if (!name || !sku) return true;
  if (name === sku) return true;
  if (name.startsWith(sku) && !/[A-Z0-9]/.test(name.charAt(sku.length))) return true;
  if (sku.startsWith(name) && !/[A-Z0-9]/.test(sku.charAt(name.length))) return true;
  return false;
}

function colLetter(idx: number): string {
  let s = ''; let i = idx + 1;
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

async function readSheetRaw(sheetId: string, tab: string): Promise<string[][]> {
  const token = await getGoogleToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tab)}`;
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.message || `read ${r.status}`);
  return (data.values || []) as string[][];
}

function skuColIndex(headers: string[]): number {
  const i = headers.findIndex(h => String(h ?? '').toLowerCase().includes('sku'));
  return i < 0 ? 0 : i;
}

async function readSkuColumn(sheetId: string, tab: string): Promise<string[]> {
  const rows = await readSheetRaw(sheetId, tab);
  if (rows.length === 0) return [];
  const col = skuColIndex(rows[0]);
  return rows.slice(1).map(row => normSku(row[col])).filter(Boolean);
}

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function isProjectAnonKey(k: string): boolean {
  try {
    const payload = JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const ref = new URL(SB_URL).hostname.split('.')[0];
    return payload?.ref === ref && payload?.role === 'anon' && (Number(payload?.exp) || 0) * 1000 > Date.now();
  } catch { return false; }
}

async function getSecret(key: string): Promise<string | null> {
  const r = await fetch(`${SB_URL}/rest/v1/app_secrets?key=eq.${encodeURIComponent(key)}&select=value`, {
    headers: { apikey: SB_SVC, authorization: `Bearer ${SB_SVC}` },
  });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return rows?.[0]?.value ?? null;
}

async function setSecret(key: string, value: string): Promise<void> {
  const r = await fetch(`${SB_URL}/rest/v1/app_secrets`, {
    method: 'POST',
    headers: { apikey: SB_SVC, authorization: `Bearer ${SB_SVC}`, 'content-type': 'application/json', prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ key, value, updated_at: new Date().toISOString() }]),
  });
  if (!r.ok) throw new Error(`secret store ${r.status}`);
}

async function callerRole(req: Request): Promise<string | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: SB_SVC } });
  if (!u.ok) return null;
  const user = await u.json().catch(() => null);
  if (!user?.id) return null;
  const p = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=role,is_active`, { headers: { apikey: SB_SVC, authorization: `Bearer ${SB_SVC}` } });
  const rows = await p.json().catch(() => []);
  const prof = rows?.[0];
  if (!prof || prof.is_active === false) return null;
  return prof.role ?? null;
}

// Cache is keyed by the refresh token it was minted from: when an admin
// reconnects Dropbox (a NEW refresh token is stored in the vault), the old
// cached access token is discarded on the next call instead of lingering for
// up to ~4h — otherwise a reconnect wouldn't take effect until expiry.
let dbxCache: { token: string; expiresAt: number; rt: string } | null = null;

async function getDropboxToken(): Promise<string> {
  // Only the refresh token gates the cache, so read it alone on the hot path.
  // app_key/app_secret are needed solely to MINT a new token, so they're fetched
  // on a miss — previously all three were fetched up front, costing 3 PostgREST
  // round trips on every call including cache hits.
  const rt = await getSecret('dropbox_refresh_token');
  if (!rt) throw new Error('dropbox_not_connected');
  if (dbxCache && dbxCache.rt === rt && dbxCache.expiresAt > Date.now() + 60_000) return dbxCache.token;
  const [ck, cs] = await Promise.all([getSecret('dropbox_app_key'), getSecret('dropbox_app_secret')]);
  if (!ck || !cs) throw new Error('Dropbox app credentials missing from vault');
  const r = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: ck, client_secret: cs }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Dropbox token ${r.status}: ${data.error_description || data.error || 'unknown'}`);
  dbxCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 14000) * 1000, rt };
  return dbxCache.token;
}

// One Retry-After-aware retry on 429. linkgen now fans out (roots searched in
// parallel, 8 share-links in flight), so a brief burst that used to be spread
// over sequential calls can now land inside Dropbox's rate limit — without this,
// parallelising would trade latency for "Rate limited" errors. Deliberately ONE
// retry, capped at 3s: callers already degrade gracefully on a real 429, and a
// long sleep would risk the edge function's own timeout. A persistent 429 still
// reaches the caller unchanged.
async function dbx(token: string, endpoint: string, body: unknown): Promise<{ status: number; data: any }> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.status === 429 && attempt === 0) {
      const wait = Math.min(Number(r.headers.get('retry-after')) || 1, 3);
      try { await r.body?.cancel(); } catch { /* nothing to drain */ }
      await new Promise(res => setTimeout(res, wait * 1000));
      continue;
    }
    return { status: r.status, data: await r.json().catch(() => ({})) };
  }
}

async function checkLink(url: string, sku: string, dbxToken: string | null): Promise<string | null> {
  try {
    if (dbxToken && /dropbox\.com/i.test(url)) {
      const meta = await dbx(dbxToken, 'sharing/get_shared_link_metadata', { url });
      if (meta.status === 429) return 'Rate limited — run the scan again in a minute';
      if (meta.status >= 200 && meta.status < 300) {
        if (meta.data['.tag'] === 'folder') {
          const ls = await dbx(dbxToken, 'files/list_folder', { path: '', shared_link: { url } });
          if (ls.status >= 200 && ls.status < 300 && (ls.data.entries || []).length === 0) return 'Folder is EMPTY — content deleted';
        }
        const target = String(meta.data?.name || '');
        if (target && !nameMatchesSku(target, sku)) return `WRONG LINK — points to "${target}", expected ${sku}`;
        return null;
      }
      let dlUrl = url;
      if (/[?&]dl=0/.test(dlUrl)) dlUrl = dlUrl.replace(/([?&])dl=0/, '$1dl=1');
      else dlUrl += (dlUrl.includes('?') ? '&' : '?') + 'dl=1';
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15_000);
      try {
        const r = await fetch(dlUrl, { method: 'GET', redirect: 'follow', signal: ctrl.signal });
        const ctype = (r.headers.get('content-type') || '').toLowerCase();
        const disp = r.headers.get('content-disposition') || '';
        try { await r.body?.cancel(); } catch { /* consumed */ }
        clearTimeout(t);
        if (r.status >= 400 || ctype.includes('text/html')) return 'Link DELETED — Dropbox reports this content removed';
        const m = disp.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
        const fname = m ? decodeURIComponent(m[1]).trim() : '';
        if (fname && !nameMatchesSku(fname, sku)) return `WRONG LINK — downloads "${fname}", expected ${sku}`;
        return null;
      } catch { clearTimeout(t); return 'Unreachable / timed out'; }
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    let r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal });
    if (r.status === 405 || r.status === 403 || r.status === 501) r = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal });
    clearTimeout(t);
    return r.status >= 400 ? `HTTP ${r.status}` : null;
  } catch { return 'Unreachable / timed out'; }
}

// Root-path caches carry a TTL: a folder moved/renamed in Dropbox keeps its
// shared URL but changes path_lower, and a permanently-cached stale path made
// every linkgen/linkfix fail with a misleading "no folder found" until the
// isolate recycled. 10 minutes bounds that damage.
const ROOT_TTL_MS = 10 * 60 * 1000;
const rootPathCache: Record<string, { p: string; at: number }> = {};
async function rootPathForTab(tab: string, token: string): Promise<string> {
  const key = `dropbox_root_${tab.toLowerCase()}`;
  const hit = rootPathCache[key];
  if (hit && Date.now() - hit.at < ROOT_TTL_MS) return hit.p;
  const link = await getSecret(key);
  if (!link) throw new Error(`No Dropbox root folder configured for tab "${tab}"`);
  const meta = await dbx(token, 'sharing/get_shared_link_metadata', { url: link });
  const p = meta.data?.path_lower;
  if (meta.status >= 400 || !p) { delete rootPathCache[key]; throw new Error(`Cannot resolve the "${tab}" root folder — the connected Dropbox account cannot see it. Reconnect with the Dropbox account that owns these folders.`); }
  rootPathCache[key] = { p, at: Date.now() };
  return p;
}

const genRootCache: Record<string, { p: string; at: number }> = {};

// The roots list changes approximately never, but was read from the vault over
// HTTP on every linkgen. Same TTL and same invalidation points as genRootCache
// (a roots save and a Dropbox reconnect both clear it), so a Settings change
// still takes effect immediately rather than after the TTL.
let genRootsCache: { v: { label: string; url: string; enabled: boolean }[]; at: number } | null = null;
async function loadGenRoots(): Promise<{ label: string; url: string; enabled: boolean }[]> {
  if (genRootsCache && Date.now() - genRootsCache.at < ROOT_TTL_MS) return genRootsCache.v;
  const raw = await getSecret('dropbox_linkgen_roots');
  let v: { label: string; url: string; enabled: boolean }[] = [];
  try { const arr = raw ? JSON.parse(raw) : []; if (Array.isArray(arr)) v = arr; } catch { v = []; }
  genRootsCache = { v, at: Date.now() };
  return v;
}

// Forward→Dropbox single shared folder: { url, path, display } in one vault row.
async function loadFwdFolder(): Promise<{ url: string; path: string; display?: string } | null> {
  const raw = await getSecret('dropbox_fwd_folder');
  try { const o = raw ? JSON.parse(raw) : null; return o && o.path ? o : null; } catch { return null; }
}

async function ensureSharedLink(token: string, path: string): Promise<{ url?: string; error?: string; needsReconnect?: boolean; rateLimited?: boolean }> {
  const ll = await dbx(token, 'sharing/list_shared_links', { path, direct_only: true });
  if (ll.status === 429) return { error: 'Rate limited — try again in a minute', rateLimited: true };
  if (ll.status < 300) { const url = ll.data?.links?.[0]?.url || ''; if (url) return { url }; }
  let cl = await dbx(token, 'sharing/create_shared_link_with_settings', { path, settings: { audience: 'public', access: 'viewer', allow_download: true } });
  if (cl.status === 429) return { error: 'Rate limited — try again in a minute', rateLimited: true };
  if (cl.status === 409 && String(cl.data?.error_summary || '').includes('shared_link_already_exists')) {
    const url = cl.data?.error?.shared_link_already_exists?.metadata?.url || ''; if (url) return { url };
  } else if (cl.status === 409 && String(cl.data?.error_summary || '').includes('settings_error')) {
    cl = await dbx(token, 'sharing/create_shared_link_with_settings', { path }); if (cl.data?.url) return { url: cl.data.url };
  } else if (cl.status === 401 || String(cl.data?.error_summary || '').includes('missing_scope')) {
    return { error: 'Dropbox needs the sharing.write permission — reconnect', needsReconnect: true };
  } else if (cl.status < 300 && cl.data?.url) { return { url: cl.data.url }; }
  return { error: `Could not create share link (${cl.status})` };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });

  if (req.method === 'GET') {
    const u = new URL(req.url);
    const turl = u.searchParams.get('thumb') || '';
    const k = u.searchParams.get('k') || '';
    if (!turl) return fail(405, 'Method not allowed', req);
    if (!isProjectAnonKey(k)) return fail(401, 'Unauthorized', req);
    if (!/^https:\/\/(www\.)?dropbox\.com\//i.test(turl)) return fail(400, 'Not a Dropbox link', req);
    let token = '';
    try { token = await getDropboxToken(); } catch { return fail(409, 'dropbox_not_connected', req); }
    const r = await fetch('https://content.dropboxapi.com/2/files/get_thumbnail_v2', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'Dropbox-API-Arg': asciiArg({ resource: { '.tag': 'link', url: turl }, format: 'jpeg', size: 'w256h256', mode: 'strict' }) },
    });
    if (!r.ok) { try { await r.body?.cancel(); } catch { /* noop */ } return fail(404, 'No thumbnail', req); }
    return new Response(r.body, { status: 200, headers: { ...corsHeaders(req), 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400' } });
  }

  if (req.method !== 'POST') return fail(405, 'Method not allowed', req);

  // Presence of *a* header is not authentication — the public anon key ships in
  // the browser bundle and would pass a bare `if (!auth)` check. Every action
  // below does its own real verification (callerRole / anon-key-only thumb);
  // this is only a fast reject for genuinely header-less requests.
  const auth = req.headers.get('authorization') || req.headers.get('apikey') || '';
  if (!auth) return fail(401, 'Unauthorized — missing auth header', req);

  let body: any;
  try { body = await req.json(); } catch { return fail(400, 'Invalid JSON body', req); }
  const action = body?.action;
  if (!action) return fail(400, 'Missing action', req);

  const ODETTE_TAB = 'ARYA STOCK';

  try {
    if (action === 'dropbox_status') {
      // Returns the Dropbox app key (OAuth client id) — gate it. Any active user
      // may see connection status; no role restriction needed for a read.
      if (!(await callerRole(req))) return fail(401, 'Sign in to DailyOffice first', req);
      const [rt, ck] = await Promise.all([getSecret('dropbox_refresh_token'), getSecret('dropbox_app_key')]);
      return json({ ok: true, connected: !!rt, appKey: ck || undefined }, req);
    }

    if (action === 'dropbox_whoami') {
      if (!(await callerRole(req))) return fail(401, 'Sign in to DailyOffice first', req);
      let token = '';
      try { token = await getDropboxToken(); } catch (e) { return json({ ok: false, error: (e as Error).message }, req); }
      const acct = await dbx(token, 'users/get_current_account', null as unknown as Record<string, never>);
      const root = await dbx(token, 'files/list_folder', { path: '', limit: 25 });
      return json({ ok: true, account: { email: acct.data?.email, name: acct.data?.name?.display_name, type: acct.data?.account_type?.['.tag'], status: acct.status }, rootEntries: (root.data?.entries || []).map((e: any) => `${e['.tag']}: ${e.name}`), rootStatus: root.status, rootError: root.data?.error_summary }, req);
    }

    if (action === 'dropbox_exchange') {
      const role = await callerRole(req);
      if (role !== 'admin') return fail(403, 'Only an admin can connect Dropbox', req);
      const code = String(body?.code || '').trim();
      if (!code) return fail(400, 'Missing code', req);
      const [ck, cs] = await Promise.all([getSecret('dropbox_app_key'), getSecret('dropbox_app_secret')]);
      if (!ck || !cs) return fail(500, 'Dropbox app credentials not configured', req);
      const r = await fetch('https://api.dropbox.com/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: ck, client_secret: cs }) });
      const data = await r.json();
      if (!r.ok || !data.refresh_token) return fail(400, 'Dropbox connect failed', req, data.error_description || data.error || 'No refresh token returned — get a fresh code and try again');
      await setSecret('dropbox_refresh_token', data.refresh_token);
      dbxCache = null;
      genRootsCache = null;
      for (const k of Object.keys(rootPathCache)) delete rootPathCache[k];
      for (const k of Object.keys(genRootCache)) delete genRootCache[k];
      return json({ ok: true, connected: true }, req);
    }

    if (action === 'fwd_folder') {
      const role = await callerRole(req);
      if (!role) return fail(401, 'Sign in to DailyOffice first', req);
      const op = body?.op || 'list';
      if (op === 'list') {
        const saved = await loadFwdFolder();
        return json({ ok: true, folder: saved || null }, req);
      }
      if (op === 'save') {
        // Owner's call: any signed-in active user may set the shared folder.
        const url = String(body?.url || '').trim();
        if (!url) { await setSecret('dropbox_fwd_folder', ''); return json({ ok: true, folder: null }, req); }
        if (!/^https:\/\/(www\.)?dropbox\.com\//i.test(url)) return fail(400, 'That is not a Dropbox folder link', req);
        let token = '';
        try { token = await getDropboxToken(); }
        catch (e) { if ((e as Error).message === 'dropbox_not_connected') return json({ ok: false, error: 'dropbox_not_connected' }, req, 409); return fail(500, 'Dropbox auth failed', req, (e as Error).message); }
        const meta = await dbx(token, 'sharing/get_shared_link_metadata', { url });
        const path = meta.data?.path_lower;
        if (meta.status >= 400 || !path || meta.data?.['.tag'] !== 'folder') return json({ ok: false, error: meta.data?.error_summary || 'Could not open that folder link' }, req);
        const folder = { url, path, display: meta.data?.path_display };
        await setSecret('dropbox_fwd_folder', JSON.stringify(folder));
        return json({ ok: true, folder: { ...folder, resolved: true } }, req);
      }
      return fail(400, `Unknown op: ${op}`, req);
    }

    if (action === 'fwd_upload') {
      if (!(await callerRole(req))) return fail(401, 'Sign in to DailyOffice first', req);
      const dataUrl = String(body?.dataUrl || '');
      const dateStr = String(body?.dateStr || '').trim();
      const mm = dataUrl.match(/^data:image\/jpe?g;base64,(.+)$/);
      if (!mm) return fail(400, 'Expected a JPEG image', req);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return fail(400, 'Bad date', req);
      const b64 = mm[1];
      if (b64.length > 8_000_000) return fail(413, 'Image too large — retake', req);
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const saved = await loadFwdFolder();
      if (!saved?.path) return json({ ok: false, error: 'no_folder' }, req, 409);
      let token = '';
      try { token = await getDropboxToken(); }
      catch (e) { if ((e as Error).message === 'dropbox_not_connected') return json({ ok: false, error: 'dropbox_not_connected' }, req, 409); return fail(500, 'Dropbox auth failed', req, (e as Error).message); }
      // Next free name: <date>.jpg, else <date> (N).jpg from N=2.
      const ls = await dbx(token, 'files/list_folder', { path: saved.path, limit: 2000 });
      const existing = new Set((ls.status < 300 ? (ls.data.entries || []) : []).map((e: any) => String(e.name).toLowerCase()));
      let name = `${dateStr}.jpg`;
      if (existing.has(name.toLowerCase())) { let n = 2; while (existing.has(`${dateStr} (${n}).jpg`.toLowerCase())) n++; name = `${dateStr} (${n}).jpg`; }
      const path = `${saved.path}/${name}`;
      // Body as a typed Blob so the octet-stream content-type is always applied
      // (a raw Uint8Array body did not reliably carry the header → Dropbox 400).
      const up = await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'Dropbox-API-Arg': asciiArg({ path, mode: 'add', autorename: true, mute: true }) },
        body: new Blob([bytes], { type: 'application/octet-stream' }),
      });
      if (!up.ok) {
        // Dropbox errors on files/upload come back as text/plain, not JSON — read
        // the real reason so the user sees it instead of a bare "(400)".
        const errText = (await up.text().catch(() => '')).trim();
        if (up.status === 401 || /missing_scope/.test(errText)) return json({ ok: false, error: 'needs_write_scope' }, req);
        return json({ ok: false, error: `Dropbox upload failed (${up.status})`, details: errText.slice(0, 400) }, req);
      }
      const ud = await up.json().catch(() => ({} as any));
      return json({ ok: true, name: ud?.name || name, path: ud?.path_display || path }, req);
    }

    if (action === 'linkgen_roots') {
      const role = await callerRole(req);
      if (!role) return fail(401, 'Sign in to DailyOffice first', req);
      const op = body?.op || 'list';
      if (op === 'list') { const roots = await loadGenRoots(); return json({ ok: true, roots, isAdmin: role === 'admin' }, req); }
      if (op === 'save') {
        const input = Array.isArray(body?.roots) ? body.roots.slice(0, 12) : [];
        const roots = input.map((r: any) => ({ label: String(r?.label || '').slice(0, 60), url: String(r?.url || '').trim(), enabled: r?.enabled !== false })).filter((r: any) => r.url);
        for (const r of roots) { if (!/^https:\/\/(www\.)?dropbox\.com\//i.test(r.url)) return fail(400, `Not a Dropbox folder link: ${r.url.slice(0, 60)}`, req); }
        let token = '';
        try { token = await getDropboxToken(); } catch { /* not connected — save anyway */ }
        const out: any[] = [];
        for (const r of roots) {
          if (!token || !r.enabled) { out.push({ ...r, resolved: null }); continue; }
          const meta = await dbx(token, 'sharing/get_shared_link_metadata', { url: r.url });
          const p = meta.data?.path_lower;
          if (meta.status < 300 && p) { genRootCache[r.url] = { p, at: Date.now() }; out.push({ ...r, resolved: true, path: meta.data?.path_display }); }
          else { delete genRootCache[r.url]; out.push({ ...r, resolved: false, error: meta.data?.error_summary || `HTTP ${meta.status}` }); }
        }
        await setSecret('dropbox_linkgen_roots', JSON.stringify(roots));
        genRootsCache = null; // saved roots must apply to the next linkgen, not 10 min later
        return json({ ok: true, roots: out }, req);
      }
      return fail(400, `Unknown op: ${op}`, req);
    }

    if (action === 'linkgen') {
      if (!(await callerRole(req))) return fail(401, 'Sign in to DailyOffice first', req);
      const sku = normSku(body?.sku);
      const mode = body?.mode === 'separate' ? 'separate' : 'combine';
      const pickedFolder = String(body?.folder || '').trim().toLowerCase();
      if (!sku) return fail(400, 'Missing sku', req);
      let token = '';
      try { token = await getDropboxToken(); }
      catch (e) { if ((e as Error).message === 'dropbox_not_connected') return json({ ok: false, error: 'dropbox_not_connected' }, req, 409); return fail(500, 'Dropbox auth failed', req, (e as Error).message); }
      const allRoots = (await loadGenRoots()).filter(r => r.enabled !== false && r.url);
      if (allRoots.length === 0) return json({ ok: false, error: 'no_roots' }, req, 409);
      // Owner's up-front folder pick (client select fed by the Settings
      // roots): scope the search to that ONE root so a SKU folder that exists
      // under two roots resolves without the "found in 2 places" stall.
      // Validated against the stored list — an arbitrary URL can't widen the
      // search surface.
      const wantRoot = String(body?.rootUrl || '').trim();
      const roots = wantRoot ? allRoots.filter(r => r.url === wantRoot) : allRoots;
      if (roots.length === 0) return json({ ok: false, sku, error: 'That search folder is no longer in Settings — pick a folder again' }, req);
      const rootPaths: string[] = [];
      for (const r of roots) {
        const hit = genRootCache[r.url];
        let rootPath = hit && Date.now() - hit.at < ROOT_TTL_MS ? hit.p : '';
        if (!rootPath) { const meta = await dbx(token, 'sharing/get_shared_link_metadata', { url: r.url }); rootPath = meta.data?.path_lower || ''; if (meta.status >= 400 || !rootPath) { delete genRootCache[r.url]; continue; } genRootCache[r.url] = { p: rootPath, at: Date.now() }; }
        rootPaths.push(rootPath);
      }
      // All roots failed to resolve (e.g. reconnected to a Dropbox account that
      // cannot see the folders): say THAT, not "no folder named X found".
      if (rootPaths.length === 0) return json({ ok: false, sku, error: 'None of the configured search folders could be opened — check Settings, or reconnect Dropbox with the account that owns them' }, req);
      let folder: any = null;
      if (pickedFolder) {
        if (!rootPaths.some(rp => pickedFolder === rp || pickedFolder.startsWith(rp + '/'))) return json({ ok: false, sku, error: 'That folder is outside the configured search folders' }, req);
        const meta = await dbx(token, 'files/get_metadata', { path: pickedFolder });
        if (meta.status >= 400 || meta.data?.['.tag'] !== 'folder') return json({ ok: false, sku, error: 'That folder no longer exists in Dropbox' }, req);
        folder = meta.data;
      } else {
        // One search per configured root, fired CONCURRENTLY. search_v2 is
        // Dropbox's slowest metadata endpoint (~0.5-3s each) and awaiting the
        // roots in series was the bulk of a request — 4 enabled roots meant 4
        // serial searches before a single link was minted. Results are consumed
        // in root order below, so the candidate list is identical to what the
        // sequential version produced; only the waiting is shared.
        const searches = await Promise.all(rootPaths.map(rootPath =>
          dbx(token, 'files/search_v2', { query: sku, options: { path: rootPath, max_results: 25, filename_only: true } })
        ));
        if (searches.some(sr => sr.status === 429)) return json({ ok: false, sku, error: 'Rate limited — try again in a minute' }, req);
        const found: any[] = [];
        for (const sr of searches) {
          if (sr.status >= 400) continue;
          for (const m of (sr.data.matches || [])) { const md = m.metadata?.metadata; if (md && md['.tag'] === 'folder') found.push(md); }
        }
        const seen = new Set<string>();
        const uniq = found.filter((f: any) => { const k = f.path_lower; if (seen.has(k)) return false; seen.add(k); return true; });
        const exact = uniq.filter((f: any) => normSku(f.name) === sku);
        const cands = exact.length ? exact : uniq.filter((f: any) => nameMatchesSku(f.name, sku) && normSku(f.name).length >= sku.length);
        // A SCOPED miss must say which folder was searched — "not found in the
        // configured search folders" reads as a broken feature when the SKU
        // simply lives in one of the OTHER folders.
        if (cands.length === 0) return json({ ok: false, sku, error: wantRoot
          ? `No folder named "${sku}" inside "${roots[0].label || 'the selected folder'}" — switch the folder picker to another folder (or All folders) and try again`
          : `No folder named "${sku}" found in the configured search folders` }, req);
        if (cands.length > 1) return json({ ok: false, sku, error: `"${sku}" was found in ${cands.length} places — tap the folder you want:`, candidates: cands.slice(0, 6).map((c: any) => ({ name: c.name, path: c.path_lower, display: c.path_display })) }, req);
        folder = cands[0];
      }
      if (mode === 'combine') {
        const mk = await ensureSharedLink(token, folder.path_lower);
        if (!mk.url) return json({ ok: false, sku, error: mk.error, needsReconnect: mk.needsReconnect || undefined }, req);
        return json({ ok: true, sku, mode, folder: folder.path_display, links: [{ name: folder.name, url: mk.url }] }, req);
      }
      const ls = await dbx(token, 'files/list_folder', { path: folder.path_lower, limit: 200 });
      if (ls.status >= 400) return json({ ok: false, sku, error: `Cannot open folder (${ls.status})` }, req);
      const isImage = (n: string) => /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(n);
      const files = (ls.data.entries || []).filter((e: any) => e['.tag'] === 'file' && isImage(e.name)).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
      if (files.length === 0) return json({ ok: false, sku, folder: folder.path_display, error: `No images directly inside ${folder.path_display}` }, req);
      const CAP = 40;
      const targets = files.slice(0, CAP);
      let note = files.length > CAP ? `Folder has ${files.length} images — first ${CAP} linked` : undefined;
      let needsReconnect = false;
      // 8 share-links in flight instead of one at a time. This was the worst case
      // in the whole feature: 40 images x 1-2 Dropbox calls each meant up to 80
      // SEQUENTIAL round trips (~20s) for one SKU. Same 8-worker shared-cursor
      // shape `linkcheck` uses above, so there's one pool pattern in this file.
      // Slots are pre-sized and written BY INDEX, so the returned link order still
      // follows the filename sort no matter which worker finishes first.
      const slots: ({ name: string; url: string; error?: string } | null)[] = new Array(targets.length).fill(null);
      let cursor = 0, stop = false, rlError = '';
      const linkWorker = async () => {
        while (!stop && cursor < targets.length) {
          const i = cursor++;
          const f = targets[i];
          const mk = await ensureSharedLink(token, f.path_lower);
          // Stop pulling new work on a fatal condition. Calls already in flight
          // still land in their slots, so the user keeps every link that
          // succeeded rather than losing the tail of the batch.
          if (mk.needsReconnect) { needsReconnect = true; note = mk.error; stop = true; return; }
          if (mk.rateLimited) { rlError = mk.error || 'Rate limited — try again in a minute'; stop = true; return; }
          slots[i] = { name: f.name, url: mk.url || '', error: mk.url ? undefined : mk.error };
        }
      };
      await Promise.all(Array.from({ length: 8 }, () => linkWorker()));
      const links = slots.filter(Boolean) as { name: string; url: string; error?: string }[];
      if (rlError && !needsReconnect) note = `${rlError} — ${links.length} of ${targets.length} links generated`;
      const good = links.filter(l => l.url).length;
      return json({ ok: good > 0, sku, mode, folder: folder.path_display, links, note, needsReconnect: needsReconnect || undefined, error: good === 0 ? (note || 'Could not create links') : undefined }, req);
    }

    if (action === 'linkgen_writesheet') {
      // Write a generated Dropbox link into the master sheet's IMAGE column for a
      // SKU, resolving the row(s) by SKU (the generator has no tab/row). Mirrors
      // linkfix's Google Sheets write, but by SKU lookup + batchUpdate.
      const role = await callerRole(req);
      if (!role || !['admin', 'manager', 'operator'].includes(role)) return fail(403, 'Only admin/manager/operator can write to the master sheet', req);
      const dryRun = body?.dryRun === true;
      const items = (Array.isArray(body?.items) ? body.items.slice(0, 300) : [])
        .map((it: any) => ({ sku: normSku(it?.sku), url: String(it?.url || '').trim() }))
        .filter((it: any) => it.sku && it.url);
      if (items.length === 0) return fail(400, 'No sku/url items provided', req);
      for (const it of items) { if (!/^https:\/\/(www\.)?dropbox\.com\//i.test(it.url)) return fail(400, `Not a Dropbox link for ${it.sku}`, req); }
      const masterId = getMasterSheetId();
      // Index SKU -> matching IMAGE cells by reading each master tab once.
      const index: Record<string, { tab: string; row: number; cell: string; previous: string }[]> = {};
      const warnings: string[] = [];
      for (const tab of MASTER_TABS) {
        try {
          const rows = await readSheetRaw(masterId, tab);
          if (rows.length === 0) continue;
          const headers = rows[0].map(h => String(h ?? '').trim());
          const skuIdx = skuColIndex(headers);
          // Exact "IMAGE" header wins; the substring regex is only a fallback —
          // otherwise a future column like "PRODUCT LINK" left of IMAGE would be
          // silently overwritten for every saved SKU.
          let imgIdx = headers.findIndex(h => h.toUpperCase() === 'IMAGE');
          if (imgIdx < 0) imgIdx = headers.findIndex(h => /image|photo|link/i.test(h));
          if (imgIdx < 0) { warnings.push(`No IMAGE column in "${tab}"`); continue; }
          rows.slice(1).forEach((row, i) => {
            const s = normSku(row[skuIdx]);
            if (!s) return;
            const rowNum = i + 2;
            (index[s] ||= []).push({ tab, row: rowNum, cell: `${tab}!${colLetter(imgIdx)}${rowNum}`, previous: String(row[imgIdx] ?? '') });
          });
        } catch (e) { warnings.push(`Cannot read master "${tab}" — ${(e as Error).message}`); }
      }
      const resolved: { sku: string; url: string; tab: string; row: number; cell: string; previous: string }[] = [];
      const notFound: string[] = [];
      const ambiguous: string[] = [];
      for (const it of items) {
        const matches = index[it.sku] || [];
        if (matches.length === 0) { notFound.push(it.sku); continue; }
        // Same SKU in BOTH tabs = two different brands' products sharing a
        // number — writing one link to both rows would corrupt one of them.
        // Skip and report; multi-row within ONE tab is fine (size variants).
        if (new Set(matches.map(m => m.tab)).size > 1) { ambiguous.push(it.sku); continue; }
        for (const m of matches) resolved.push({ sku: it.sku, url: it.url, ...m });
      }
      if (dryRun) return json({ ok: true, dryRun: true, resolved, notFound, ambiguous, warnings: warnings.length ? warnings : undefined }, req);
      if (resolved.length === 0) return json({ ok: false, error: ambiguous.length ? 'sku_ambiguous' : 'sku_not_found', notFound, ambiguous, warnings: warnings.length ? warnings : undefined }, req);
      const gToken = await getGoogleToken();
      const svcEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL') || 'the service account';
      const wr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${masterId}/values:batchUpdate`, {
        method: 'POST', headers: { authorization: `Bearer ${gToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: resolved.map(r => ({ range: r.cell, values: [[r.url]] })) }),
      });
      if (wr.status === 403) return json({ ok: false, error: `No edit access on the master sheet — share it with ${svcEmail} as Editor` }, req);
      if (!wr.ok) { const wd = await wr.json().catch(() => ({})); return json({ ok: false, error: `Sheet write failed: ${wd.error?.message || wr.status}` }, req); }
      return json({ ok: true, written: resolved.map(r => ({ sku: r.sku, tab: r.tab, cell: r.cell, previous: r.previous })), count: resolved.length, skuCount: new Set(resolved.map(r => r.sku)).size, notFound, ambiguous, warnings: warnings.length ? warnings : undefined }, req);
    }

    if (action === 'linkcheck') {
      if (!(await callerRole(req))) return fail(401, 'Sign in to DailyOffice first', req);
      const offset = Math.max(0, Number(body?.offset) || 0);
      const limit = Math.min(200, Math.max(1, Number(body?.limit) || 100));
      let dbxToken: string | null = null;
      try { dbxToken = await getDropboxToken(); }
      catch (e) { if ((e as Error).message === 'dropbox_not_connected') return json({ ok: false, error: 'dropbox_not_connected' }, req, 409); return fail(500, 'Dropbox auth failed', req, (e as Error).message); }
      const approved = new Set<string>();
      let approvalsNote: string | null = null;
      try {
        const ar = await fetch(`${SB_URL}/rest/v1/link_check_approvals?select=sku,url`, { headers: { apikey: SB_SVC, authorization: `Bearer ${SB_SVC}` } });
        if (ar.ok) { const rows = await ar.json(); for (const a of rows) approved.add(`${normSku(a.sku)}|${String(a.url || '').trim()}`); if (rows.length >= 1000) approvalsNote = 'Over 1000 approved links — some approved rows may still be flagged'; }
        else approvalsNote = `Could not load the "marked correct" list (HTTP ${ar.status}) — approved links may appear below`;
      } catch (e) { approvalsNote = `Could not load the "marked correct" list (${(e as Error).message}) — approved links may appear below`; }
      const masterId = getMasterSheetId();
      type Item = { sku: string; tab: string; row: number; url: string };
      const items: Item[] = [];
      const noLink: { sku: string; tab: string; row: number }[] = [];
      const warnings: string[] = [];
      if (approvalsNote) warnings.push(approvalsNote);
      for (const tab of MASTER_TABS) {
        try {
          const rows = await readSheetRaw(masterId, tab);
          if (rows.length === 0) continue;
          const headers = rows[0].map(h => String(h ?? '').trim());
          const skuIdx = skuColIndex(headers);
          let statusIdx = headers.findIndex(h => h.toLowerCase().includes('stock') && h.toLowerCase().includes('status'));
          if (statusIdx < 0) statusIdx = headers.findIndex(h => h.toLowerCase().includes('status'));
          const imgIdx = headers.findIndex(h => /image|photo|link/i.test(h));
          if (imgIdx < 0) { warnings.push(`No IMAGE column found in "${tab}"`); continue; }
          rows.slice(1).forEach((row, i) => {
            const sku = normSku(row[skuIdx]);
            if (!sku) return;
            const active = statusIdx < 0 || String(row[statusIdx] ?? '').trim().toLowerCase() === 'active';
            if (!active) return;
            const url = String(row[imgIdx] ?? '').trim();
            if (!url || !/^https?:\/\//i.test(url)) { noLink.push({ sku, tab, row: i + 2 }); return; }
            items.push({ sku, tab, row: i + 2, url });
          });
        } catch (e) { warnings.push(`Cannot read master "${tab}" — ${(e as Error).message}`); }
      }
      const slice = items.slice(offset, offset + limit);
      const broken: (Item & { problem: string })[] = [];
      let cursor = 0;
      const worker = async () => { while (cursor < slice.length) { const it = slice[cursor++]; const problem = await checkLink(it.url, it.sku, dbxToken); if (!problem) continue; if (problem.startsWith('WRONG LINK') && approved.has(`${it.sku}|${it.url}`)) continue; broken.push({ ...it, problem }); } };
      await Promise.all(Array.from({ length: 8 }, () => worker()));
      const nextOffset = offset + limit < items.length ? offset + limit : null;
      return json({ ok: true, totalLinks: items.length, offset, checked: slice.length, nextOffset, broken, noLink: offset === 0 ? noLink : [], approvals: approved.size, warnings: warnings.length ? warnings : undefined }, req);
    }

    if (action === 'linkfix') {
      const role = await callerRole(req);
      if (!role || !['admin', 'manager', 'operator'].includes(role)) return fail(403, 'Only admin/manager/operator can fix links', req);
      const dryRun = body?.dryRun === true;
      const items: { sku: string; tab: string; row: number }[] = Array.isArray(body?.items) ? body.items.slice(0, 20) : [];
      if (items.length === 0) return fail(400, 'items missing', req);
      let dbxToken = '';
      try { dbxToken = await getDropboxToken(); }
      catch (e) { if ((e as Error).message === 'dropbox_not_connected') return json({ ok: false, error: 'dropbox_not_connected' }, req, 409); return fail(500, 'Dropbox auth failed', req, (e as Error).message); }
      const masterId = getMasterSheetId();
      const gToken = await getGoogleToken();
      const svcEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL') || 'the service account';
      const imgCol: Record<string, number> = {}; const skuCol: Record<string, number> = {}; const catCol: Record<string, number> = {};
      for (const tab of [...new Set(items.map(i => i.tab))]) {
        const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${masterId}/values/${encodeURIComponent(tab + '!1:1')}`, { headers: { authorization: `Bearer ${gToken}` } });
        const d = await r.json().catch(() => ({}));
        const headers = ((d.values || [])[0] || []).map((h: unknown) => String(h ?? '').trim());
        imgCol[tab] = headers.findIndex((h: string) => /image|photo|link/i.test(h)); skuCol[tab] = skuColIndex(headers); catCol[tab] = headers.findIndex((h: string) => /catalog/i.test(h));
      }
      let needsReconnect = false; const results: any[] = []; let cursor = 0;
      const worker = async () => {
        while (cursor < items.length && !needsReconnect) {
          const it = items[cursor++]; const sku = normSku(it.sku);
          try {
            if (!MASTER_TABS.includes(it.tab) || !Number.isInteger(it.row) || it.row < 2) { results.push({ ...it, fixed: false, reason: 'Invalid item' }); continue; }
            if ((imgCol[it.tab] ?? -1) < 0) { results.push({ ...it, fixed: false, reason: `No IMAGE column in "${it.tab}"` }); continue; }
            const rr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${masterId}/values/${encodeURIComponent(`${it.tab}!${it.row}:${it.row}`)}`, { headers: { authorization: `Bearer ${gToken}` } });
            const rrd = await rr.json().catch(() => ({}));
            const rowVals: string[] = (((rrd.values || [])[0]) || []).map((v: unknown) => String(v ?? ''));
            const rowSku = normSku(rowVals[skuCol[it.tab]]);
            if (rowSku !== sku) { results.push({ ...it, fixed: false, reason: `Row ${it.row} holds "${rowSku || '(empty)'}", not "${sku}" — re-run the scan` }); continue; }
            const rowCatalog = normSku(catCol[it.tab] >= 0 ? rowVals[catCol[it.tab]] : '');
            const previous = String(rowVals[imgCol[it.tab]] ?? '');
            const root = await rootPathForTab(it.tab, dbxToken);
            const sr = await dbx(dbxToken, 'files/search_v2', { query: sku, options: { path: root, max_results: 25, filename_only: true } });
            if (sr.status === 429) { results.push({ ...it, fixed: false, reason: 'Rate limited — try again in a minute' }); continue; }
            if (sr.status >= 400) { results.push({ ...it, fixed: false, reason: `Dropbox search failed (${sr.status})` }); continue; }
            const folders = (sr.data.matches || []).map((m: any) => m.metadata?.metadata).filter((md: any) => md && md['.tag'] === 'folder');
            const exact = folders.filter((f: any) => normSku(f.name) === sku);
            const cands: any[] = exact.length ? exact : folders.filter((f: any) => nameMatchesSku(f.name, sku) && normSku(f.name).length >= sku.length);
            if (cands.length === 0) { results.push({ ...it, fixed: false, reason: `No folder named "${sku}" found in Dropbox — not changed` }); continue; }
            const nonEmpty: any[] = [];
            for (const c of cands.slice(0, 5)) { const ls = await dbx(dbxToken, 'files/list_folder', { path: c.path_lower, limit: 2 }); if (ls.status < 300 && (ls.data.entries || []).length > 0) nonEmpty.push(c); }
            if (nonEmpty.length === 0) { results.push({ ...it, fixed: false, reason: `Folder "${sku}" found but it is EMPTY — upload the images first (not changed)` }); continue; }
            let chosen: any = null;
            if (nonEmpty.length === 1) chosen = nonEmpty[0];
            else { const byCat = rowCatalog ? nonEmpty.filter((c: any) => String(c.path_lower).toUpperCase().includes(rowCatalog)) : []; if (byCat.length === 1) chosen = byCat[0]; else { results.push({ ...it, fixed: false, reason: `Multiple folders match (${nonEmpty.slice(0, 3).map((c: any) => c.path_display).join('  |  ')}) — fix manually (not changed)` }); continue; } }
            let url = '';
            const ll = await dbx(dbxToken, 'sharing/list_shared_links', { path: chosen.path_lower, direct_only: true });
            if (ll.status < 300) url = ll.data?.links?.[0]?.url || '';
            const cell = `${it.tab}!${colLetter(imgCol[it.tab])}${it.row}`;
            if (dryRun) { results.push({ ...it, fixed: false, dryRun: true, willUse: true, folder: chosen.path_display, catalog: rowCatalog || undefined, url: url || undefined, cell, previous, reason: `Will replace with folder ${chosen.path_display}` }); continue; }
            if (!url) { const mk = await ensureSharedLink(dbxToken, chosen.path_lower); if (mk.needsReconnect) { needsReconnect = true; results.push({ ...it, fixed: false, reason: 'Dropbox needs the sharing.write permission — reconnect' }); continue; } if (!mk.url) { results.push({ ...it, fixed: false, reason: `${mk.error} — not changed` }); continue; } url = mk.url; }
            const wr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${masterId}/values/${encodeURIComponent(cell)}?valueInputOption=USER_ENTERED`, { method: 'PUT', headers: { authorization: `Bearer ${gToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ values: [[url]] }) });
            if (wr.status === 403) { results.push({ ...it, fixed: false, url, reason: `No edit access on the master sheet — share it with ${svcEmail} as Editor` }); continue; }
            if (!wr.ok) { const wd = await wr.json().catch(() => ({})); results.push({ ...it, fixed: false, url, reason: `Sheet write failed: ${wd.error?.message || wr.status}` }); continue; }
            results.push({ ...it, fixed: true, url, cell, previous, folder: chosen.path_display });
          } catch (e) { results.push({ ...it, fixed: false, reason: (e as Error).message }); }
        }
      };
      await Promise.all(Array.from({ length: 3 }, () => worker()));
      return json({ ok: true, results, needsReconnect: needsReconnect || undefined }, req);
    }

    if (action === 'reconcile') {
      // Reads master-sheet rows / missing-SKU data — any active user, but not
      // an unauthenticated anon-key caller.
      if (!(await callerRole(req))) return fail(401, 'Sign in to DailyOffice first', req);
      const odetteSet = new Set(await readSkuColumn(getSheetId(), ODETTE_TAB));
      const masterId = getMasterSheetId();
      const SOURCE_COL = 'Source Tab'; const MISSING_SIZE_COL = 'Missing Size'; const EXPECTED_COL = 'Expected Odette SKU';
      const columns: string[] = []; const colSet = new Set<string>(); const expectedSeen = new Set<string>();
      const missing: Record<string, string>[] = []; const tabsRead: { name: string; count: number }[] = []; const warnings: string[] = [];
      let activeVariants = 0, presentVariants = 0, skipped = 0;
      for (const tab of MASTER_TABS) {
        try {
          const rows = await readSheetRaw(masterId, tab);
          if (rows.length === 0) { tabsRead.push({ name: tab, count: 0 }); continue; }
          const headers = rows[0].map(h => String(h ?? '').trim());
          for (const h of headers) if (h && !colSet.has(h)) { colSet.add(h); columns.push(h); }
          const skuIdx = skuColIndex(headers);
          let statusIdx = headers.findIndex(h => h.toLowerCase().includes('stock') && h.toLowerCase().includes('status'));
          if (statusIdx < 0) statusIdx = headers.findIndex(h => h.toLowerCase().includes('status'));
          let sizeIdx = headers.findIndex(h => h.toLowerCase() === 'size');
          if (sizeIdx < 0) sizeIdx = headers.findIndex(h => h.toLowerCase().includes('size'));
          if (statusIdx < 0) warnings.push(`No STOCK STATUS column in "${tab}" — counting all rows as active`);
          if (sizeIdx < 0) warnings.push(`No SIZE column in "${tab}" — matching base SKU only`);
          let tabCount = 0;
          for (const row of rows.slice(1)) {
            const base = baseSku(normSku(row[skuIdx]));
            if (!base) continue;
            const active = statusIdx < 0 || String(row[statusIdx] ?? '').trim().toLowerCase() === 'active';
            if (!active) continue;
            const sizeRaw = sizeIdx < 0 ? '' : String(row[sizeIdx] ?? '');
            if (/stit/i.test(sizeRaw)) { skipped++; continue; }
            tabCount++;
            const sizes = sizeRaw.split(/[,/|\s]+/).map(t => t.trim().toUpperCase()).filter(t => SIZE_TOKENS.has(t));
            const expected = sizes.length ? sizes.map(s => ({ size: s, sku: normSku(`${base}-${s}`) })) : [{ size: '', sku: base }];
            for (const e of expected) {
              if (expectedSeen.has(e.sku)) continue;
              expectedSeen.add(e.sku); activeVariants++;
              if (odetteSet.has(e.sku)) { presentVariants++; continue; }
              const obj: Record<string, string> = {};
              headers.forEach((h, i) => { if (h) obj[h] = String(row[i] ??  ''); });
              obj[MISSING_SIZE_COL] = e.size || '(no size)'; obj[EXPECTED_COL] = e.sku; obj[SOURCE_COL] = tab;
              missing.push(obj);
            }
          }
          tabsRead.push({ name: tab, count: tabCount });
        } catch (e) { warnings.push(`Cannot read master "${tab}" — is the sheet shared with the service account? (${(e as Error).message})`); }
      }
      if (colSet.size === 0) return fail(502, 'Could not read any master tab', req, warnings.join(' | ') || 'No data in master tabs');
      columns.unshift(EXPECTED_COL, MISSING_SIZE_COL, SOURCE_COL);
      return json({ ok: true, columns, missing, counts: { active: activeVariants, odette: presentVariants, missing: missing.length, skipped }, tabsRead, warnings: warnings.length ? warnings : undefined }, req);
    }

    const sheetName = body?.sheetName;
    if (!sheetName) return fail(400, 'Missing sheetName', req);
    const ALLOWED_TABS = [ODETTE_TAB];
    if (!ALLOWED_TABS.includes(sheetName)) return fail(400, `Sheet tab "${sheetName}" not allowed`, req);

    if (action === 'push') {
      // Data-mutating write to the production ODETTE QTY column — must be a
      // signed-in active user with a writing role, not merely the anon key.
      const role = await callerRole(req);
      if (!role || !['admin', 'manager', 'operator'].includes(role)) return fail(403, 'Only admin/manager/operator can push stock quantities', req);
      const rows = body.rows;
      if (!Array.isArray(rows) || rows.length === 0) return fail(400, 'rows missing or empty', req);
      const qtyMap: Record<string, string | number> = {};
      for (const r of rows) qtyMap[String(r[0] || '').toUpperCase()] = r[1] ?? 0;
      const token = await getGoogleToken();
      const sid = getSheetId();

      // The target column is found BY HEADER, never assumed. This used to write
      // to column B unconditionally: insert one column on the sheet and every
      // push would silently overwrite the wrong data, because Sheets accepts
      // the write without complaint.
      const headerUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${encodeURIComponent(sheetName + '!1:1')}`;
      const headerResp = await fetch(headerUrl, { headers: { authorization: `Bearer ${token}` } });
      const headerData = await headerResp.json();
      if (!headerResp.ok) throw new Error(`Sheets read ${headerResp.status}: ${headerData.error?.message || 'unknown'}`);
      const headers: string[] = ((headerData.values || [])[0] || []).map((h: unknown) => String(h ?? '').trim());

      // Exact match, not includes(): "QTY BLOCKED" or "OLD QTY" must not win.
      const qtyCols = headers.map((h, i) => ({ h, i })).filter(c => c.h.toUpperCase() === 'QTY');
      if (qtyCols.length === 0) {
        return fail(400, `No "QTY" column on the ${sheetName} sheet — nothing was written`, req,
          headers.filter(Boolean).length ? `Columns found: ${headers.filter(Boolean).join(', ')}` : 'The header row is empty');
      }
      if (qtyCols.length > 1) {
        // Guessing between two is exactly the mistake this check exists to stop.
        return fail(400, `The ${sheetName} sheet has ${qtyCols.length} columns named "QTY" — nothing was written`, req,
          `Columns ${qtyCols.map(c => colLetter(c.i)).join(' and ')}. Rename or remove one, then push again.`);
      }
      const qtyIdx = qtyCols[0].i;
      const qtyLetter = colLetter(qtyIdx);

      const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${encodeURIComponent(sheetName + '!A:A')}`;
      const readResp = await fetch(readUrl, { headers: { authorization: `Bearer ${token}` } });
      const readData = await readResp.json();
      if (!readResp.ok) throw new Error(`Sheets read ${readResp.status}: ${readData.error?.message || 'unknown'}`);
      const sheetRows: string[][] = readData.values || [];
      const values = sheetRows.slice(1).map((row: string[]) => { const sku = (row[0] || '').trim().toUpperCase(); if (!sku) return ['']; return [qtyMap[sku] !== undefined ? qtyMap[sku] : '']; });

      // Row 2 onward — the header stays untouched.
      const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${encodeURIComponent(`${sheetName}!${qtyLetter}2`)}?valueInputOption=USER_ENTERED`;
      const writeResp = await fetch(writeUrl, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ values }) });
      if (!writeResp.ok) { const wd = await writeResp.json().catch(() => ({})); throw new Error(`Sheets write ${writeResp.status}: ${wd.error?.message || 'unknown'}`); }
      const matched = values.filter(r => r[0] !== '').length;
      return json({ ok: true, count: rows.length, matched, totalRows: sheetRows.length, qtyColumn: { header: qtyCols[0].h, letter: qtyLetter } }, req);
    }
    return fail(400, `Unknown action: ${action}`, req);
  } catch (e) {
    const msg = (e as Error)?.message || 'Server error';
    console.error('odette-export error:', msg);
    return fail(500, 'Server error', req, msg);
  }
});
