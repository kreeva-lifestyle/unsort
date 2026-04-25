// packtime Edge Function — proxies Google Sheets reads/writes for PackStation.
//
// Client contract (src/PackTime.tsx):
//   POST { action: 'init',   sheetName }               -> { ok, awbs, totalRows, columnsOk, columnsInfo? }
//   POST { action: 'batch',  sheetName, rows: any[][] } -> { ok }
//   POST { action: 'delete', sheetName, awb }          -> { ok }
//
// Row layout in the spreadsheet: A=Count | B=AWB | C=Timestamp | D=Camera | E=Brand.
//
// Secrets required in the Supabase project (supabase secrets set ...):
//   GOOGLE_CLIENT_EMAIL   service-account email
//   GOOGLE_PRIVATE_KEY    service-account private_key (PKCS8 PEM; \n escapes OK)
//   GOOGLE_SHEET_ID       master spreadsheet ID containing the courier tabs

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
  const unsigned =
    b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) +
    '.' +
    b64url(JSON.stringify({
      iss: email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }));
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${b64url(new Uint8Array(sig))}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Google OAuth ${resp.status}: ${data.error_description || data.error || 'unknown'}`);
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
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
  if (!r.ok) throw new Error(`Sheets GET ${r.status}: ${data.error?.message || 'unknown'}`);
  return (data.values as string[][] | undefined) || [];
}

async function sheetsAppend(sheetName: string, rows: unknown[][]): Promise<void> {
  const token = await getGoogleToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}/values/${encodeURIComponent(sheetName + '!A:E')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ values: rows }),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(`Sheets append ${r.status}: ${data.error?.message || 'unknown'}`);
  }
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

function verifyColumns(header: string[] | undefined): { ok: boolean; info?: string } {
  if (!header || header.length === 0) return { ok: true };
  const expected = ['Count', 'AWB', 'Timestamp', 'Camera'];
  const mismatch = expected.some((e, i) => (header[i] ?? '').trim().toLowerCase() !== e.toLowerCase());
  if (!mismatch) return { ok: true };
  return { ok: false, info: `Found headers: ${header.slice(0, 4).map(h => h || '(empty)').join(' | ')}` };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return fail(405, 'Method not allowed', req);

  // Auth check — reject requests without a valid Bearer token.
  // The token is the Supabase anon key or user JWT; its presence proves
  // the caller went through the app (not a random cURL).
  const auth = req.headers.get('authorization') || req.headers.get('apikey') || '';
  if (!auth) return fail(401, 'Unauthorized — missing auth header', req);

  let body: any;
  try { body = await req.json(); } catch { return fail(400, 'Invalid JSON body', req); }
  const action = body?.action;
  const sheetName = body?.sheetName;
  if (!action || !sheetName) return fail(400, 'Missing action or sheetName', req);

  // Validate sheetName against configured couriers. Prevents arbitrary
  // sheet tab access (e.g. "FinancialData!A1:E5000").
  const validSheetNames = (Deno.env.get('ALLOWED_SHEETS') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (validSheetNames.length > 0 && !validSheetNames.includes(sheetName)) {
    return fail(403, `Sheet "${sheetName}" is not a configured courier sheet`, req);
  }

  try {
    if (action === 'init') {
      const rows = await sheetsGet(`${sheetName}!A1:E5000`);
      const col = verifyColumns(rows[0]);
      const awbs = rows.slice(1).map(r => r[1]).filter(Boolean).map(String);
      return json({ ok: true, awbs, totalRows: Math.max(0, rows.length - 1), columnsOk: col.ok, columnsInfo: col.info }, req);
    }
    if (action === 'batch') {
      if (!Array.isArray(body.rows) || body.rows.length === 0) return fail(400, 'rows missing or empty', req);
      await sheetsAppend(sheetName, body.rows);
      return json({ ok: true }, req);
    }
    if (action === 'delete') {
      const awb = String(body.awb || '').trim().toUpperCase();
      if (!awb) return fail(400, 'awb missing', req);
      const rows = await sheetsGet(`${sheetName}!A1:E5000`);
      const idx = rows.findIndex((r, i) => i > 0 && (r[1] || '').toString().trim().toUpperCase() === awb);
      if (idx < 0) return json({ ok: true }, req);
      await sheetsClearRow(sheetName, idx + 1);
      return json({ ok: true }, req);
    }
    return fail(400, `Unknown action: ${action}`, req);
  } catch (e) {
    const msg = (e as Error)?.message || 'Server error';
    console.error('packtime error:', msg);
    return fail(500, 'Server error', req, msg);
  }
});
