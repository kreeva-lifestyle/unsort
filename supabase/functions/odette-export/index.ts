// odette-export Edge Function — pushes Odette Import results to Google Sheets.
//
// Client contract:
//   POST { action: 'push', sheetName, rows: [sku, qty][] } -> { ok, count }
//
// Clears the target sheet tab then writes header + data rows.
// Uses same Google service account as packtime.
//
// Secrets (shared with packtime):
//   GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID
//
// Additional env:
//   ODETTE_SHEET_ID  (optional — uses GOOGLE_SHEET_ID if not set)

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

const json = (body: unknown, req: Request, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'content-type': 'application/json' } });

const fail = (status: number, error: string, req: Request, details?: string) =>
  json({ ok: false, error, details }, req, status);

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

async function sheetsClear(sheetName: string): Promise<void> {
  const token = await getGoogleToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${getSheetId()}/values/${encodeURIComponent(sheetName)}:clear`;
  const r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(`Sheets clear ${r.status}: ${data.error?.message || 'unknown'}`);
  }
}

async function sheetsWrite(sheetName: string, rows: unknown[][]): Promise<void> {
  const token = await getGoogleToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${getSheetId()}/values/${encodeURIComponent(sheetName + '!A1')}?valueInputOption=USER_ENTERED`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ values: rows }),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(`Sheets write ${r.status}: ${data.error?.message || 'unknown'}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return fail(405, 'Method not allowed', req);

  const auth = req.headers.get('authorization') || req.headers.get('apikey') || '';
  if (!auth) return fail(401, 'Unauthorized — missing auth header', req);

  let body: any;
  try { body = await req.json(); } catch { return fail(400, 'Invalid JSON body', req); }
  const action = body?.action;
  const sheetName = body?.sheetName;
  if (!action || !sheetName) return fail(400, 'Missing action or sheetName', req);

  try {
    if (action === 'push') {
      const rows = body.rows;
      if (!Array.isArray(rows) || rows.length === 0) return fail(400, 'rows missing or empty', req);

      // Build SKU→Qty map from computed results
      const qtyMap: Record<string, string | number> = {};
      for (const r of rows) qtyMap[String(r[0] || '').toUpperCase()] = r[1] ?? 0;

      // Read existing SKUs from column A
      const token = await getGoogleToken();
      const sid = getSheetId();
      const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${encodeURIComponent(sheetName + '!A:A')}`;
      const readResp = await fetch(readUrl, { headers: { authorization: `Bearer ${token}` } });
      const readData = await readResp.json();
      if (!readResp.ok) throw new Error(`Sheets read ${readResp.status}: ${readData.error?.message || 'unknown'}`);
      const sheetSkus: string[][] = readData.values || [];

      // Build column B values matching each row's SKU
      const colB = sheetSkus.map((row: string[]) => {
        const sku = (row[0] || '').trim().toUpperCase();
        if (!sku) return [''];
        return [qtyMap[sku] !== undefined ? qtyMap[sku] : ''];
      });

      // Write column B only
      const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${encodeURIComponent(sheetName + '!B1')}?valueInputOption=USER_ENTERED`;
      const writeResp = await fetch(writeUrl, {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ values: colB }),
      });
      if (!writeResp.ok) {
        const wd = await writeResp.json().catch(() => ({}));
        throw new Error(`Sheets write ${writeResp.status}: ${wd.error?.message || 'unknown'}`);
      }

      const matched = colB.filter(r => r[0] !== '').length;
      return json({ ok: true, count: rows.length, matched, totalRows: sheetSkus.length }, req);
    }
    return fail(400, `Unknown action: ${action}`, req);
  } catch (e) {
    const msg = (e as Error)?.message || 'Server error';
    console.error('odette-export error:', msg);
    return fail(500, 'Server error', req, msg);
  }
});
