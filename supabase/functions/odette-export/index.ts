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

function getMasterSheetId(): string {
  const id = Deno.env.get('MASTER_SHEET_ID');
  if (!id) throw new Error('Missing MASTER_SHEET_ID secret');
  return id;
}

// Master "active catalog" lives across these tabs of the OFFLINE MASTER SHEET.
const MASTER_TABS = ['ARYA', 'DRESSTIVE'];

const normSku = (v: unknown) => String(v ?? '').trim().toUpperCase();

// Size convention mirrors the app (src/pages/Minis.tsx baseSku + Inventory SIZES).
// Odette SKUs are `<base>-<SIZE>` (e.g. DRS43-XL); the master lists base SKUs
// plus a SIZE column ("S, M, L, XL" or "Semi-Stitched").
const SIZE_TOKENS = new Set(['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']);
const baseSku = (sku: string) => sku.replace(/[-\s]?(XXXL|XXL|XL|XXS|XS|S|M|L)$/i, '');

// Raw values of a whole sheet tab (row 0 = headers).
async function readSheetRaw(sheetId: string, tab: string): Promise<string[][]> {
  const token = await getGoogleToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tab)}`;
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.message || `read ${r.status}`);
  return (data.values || []) as string[][];
}

// Detect the SKU column from a header row (any header containing "sku"); col A fallback.
function skuColIndex(headers: string[]): number {
  const i = headers.findIndex(h => String(h ?? '').toLowerCase().includes('sku'));
  return i < 0 ? 0 : i;
}

// Normalized SKU list from a tab.
async function readSkuColumn(sheetId: string, tab: string): Promise<string[]> {
  const rows = await readSheetRaw(sheetId, tab);
  if (rows.length === 0) return [];
  const col = skuColIndex(rows[0]);
  return rows.slice(1).map(row => normSku(row[col])).filter(Boolean);
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
  if (!action) return fail(400, 'Missing action', req);

  const ODETTE_TAB = 'ARYA STOCK';

  try {
    // ── Reconcile: per-size — which active master size-variants are NOT on the
    //    Odette sheet. Master lists base SKUs + a SIZE column; Odette lists
    //    `<base>-<size>` rows. Each missing (product, size) → one detail row. ──
    if (action === 'reconcile') {
      // Odette set — raw size-variant SKUs on the ARYA STOCK tab (col A)
      const odetteSet = new Set(await readSkuColumn(getSheetId(), ODETTE_TAB));

      const masterId = getMasterSheetId();
      const SOURCE_COL = 'Source Tab';
      const MISSING_SIZE_COL = 'Missing Size';
      const EXPECTED_COL = 'Expected Odette SKU';
      const columns: string[] = [];           // ordered, union of tab headers
      const colSet = new Set<string>();
      const expectedSeen = new Set<string>(); // dedupe expected variants globally
      const missing: Record<string, string>[] = [];
      const tabsRead: { name: string; count: number }[] = [];
      const warnings: string[] = [];
      let activeVariants = 0, presentVariants = 0, skipped = 0;

      for (const tab of MASTER_TABS) {
        try {
          const rows = await readSheetRaw(masterId, tab);
          if (rows.length === 0) { tabsRead.push({ name: tab, count: 0 }); continue; }
          const headers = rows[0].map(h => String(h ?? '').trim());
          for (const h of headers) if (h && !colSet.has(h)) { colSet.add(h); columns.push(h); }
          const skuIdx = skuColIndex(headers);
          // Prefer "STOCK STATUS" — a tab may also have "ORDER STATUS" etc.,
          // so a bare includes('status') could pick the wrong column.
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
            // Only Active rows (Inactive/discontinued excluded)
            const active = statusIdx < 0 || String(row[statusIdx] ?? '').trim().toLowerCase() === 'active';
            if (!active) continue;
            // Semi-stitched / unstitched products aren't size-split on Odette — skip.
            // Match "stit" so abbreviations (SEMI-STIT) are caught too; no real
            // size value contains "stit".
            const sizeRaw = sizeIdx < 0 ? '' : String(row[sizeIdx] ?? '');
            if (/stit/i.test(sizeRaw)) { skipped++; continue; }
            tabCount++;
            // Expand to expected Odette SKUs: one per real size, else the bare base
            const sizes = sizeRaw.split(/[,/|\s]+/).map(t => t.trim().toUpperCase()).filter(t => SIZE_TOKENS.has(t));
            const expected = sizes.length
              ? sizes.map(s => ({ size: s, sku: normSku(`${base}-${s}`) }))
              : [{ size: '', sku: base }];
            for (const e of expected) {
              if (expectedSeen.has(e.sku)) continue;
              expectedSeen.add(e.sku);
              activeVariants++;
              if (odetteSet.has(e.sku)) { presentVariants++; continue; }
              const obj: Record<string, string> = {};
              headers.forEach((h, i) => { if (h) obj[h] = String(row[i] ?? ''); });
              obj[MISSING_SIZE_COL] = e.size || '(no size)';
              obj[EXPECTED_COL] = e.sku;
              obj[SOURCE_COL] = tab;
              missing.push(obj);
            }
          }
          tabsRead.push({ name: tab, count: tabCount });
        } catch (e) {
          warnings.push(`Cannot read master "${tab}" — is the sheet shared with the service account? (${(e as Error).message})`);
        }
      }
      if (colSet.size === 0) {
        return fail(502, 'Could not read any master tab', req, warnings.join(' | ') || 'No data in master tabs');
      }
      columns.push(MISSING_SIZE_COL, EXPECTED_COL, SOURCE_COL);

      return json({
        ok: true,
        columns,
        missing,
        counts: { active: activeVariants, odette: presentVariants, missing: missing.length, skipped },
        tabsRead,
        warnings: warnings.length ? warnings : undefined,
      }, req);
    }

    const sheetName = body?.sheetName;
    if (!sheetName) return fail(400, 'Missing sheetName', req);
    const ALLOWED_TABS = [ODETTE_TAB];
    if (!ALLOWED_TABS.includes(sheetName)) return fail(400, `Sheet tab "${sheetName}" not allowed`, req);

    if (action === 'push') {
      const rows = body.rows;
      if (!Array.isArray(rows) || rows.length === 0) return fail(400, 'rows missing or empty', req);

      // Build SKU→Qty map from computed results
      const qtyMap: Record<string, string | number> = {};
      for (const r of rows) qtyMap[String(r[0] || '').toUpperCase()] = r[1] ?? 0;

      // Read column A (ARYA SKU) for matching
      const token = await getGoogleToken();
      const sid = getSheetId();
      const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${encodeURIComponent(sheetName + '!A:A')}`;
      const readResp = await fetch(readUrl, { headers: { authorization: `Bearer ${token}` } });
      const readData = await readResp.json();
      if (!readResp.ok) throw new Error(`Sheets read ${readResp.status}: ${readData.error?.message || 'unknown'}`);
      const sheetRows: string[][] = readData.values || [];

      // Build column B values matching each row's SKU from col A (skip header row)
      const colB = sheetRows.slice(1).map((row: string[]) => {
        const sku = (row[0] || '').trim().toUpperCase();
        if (!sku) return [''];
        return [qtyMap[sku] !== undefined ? qtyMap[sku] : ''];
      });

      // Write column B starting at B2 (preserve header)
      const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${encodeURIComponent(sheetName + '!B2')}?valueInputOption=USER_ENTERED`;
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
      return json({ ok: true, count: rows.length, matched, totalRows: sheetRows.length }, req);
    }
    return fail(400, `Unknown action: ${action}`, req);
  } catch (e) {
    const msg = (e as Error)?.message || 'Server error';
    console.error('odette-export error:', msg);
    return fail(500, 'Server error', req, msg);
  }
});
