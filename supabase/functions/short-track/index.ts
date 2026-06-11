// short-track Edge Function — URL redirect + click tracking for Short N Track.
//
// Client contract:
//   GET  /:shortCode          -> 302 redirect to long_url (logs click)
//   POST { action: 'resolve', shortCode } -> { ok, longUrl } (used by preview)
//   POST { action: 'lookup', skus: string[] } -> { ok, results: [...] } (public SKU lookup via Google Sheet)
//   POST { action: 'sheet' } -> { ok, sheets: [{ tab, values }] } (raw stock sheet for vendor download)
//
// Click metadata parsed from request headers (User-Agent, Referer, CF geo headers).
// SKU lookup reads from a Google Sheet (READONLY scope — never writes).

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

const json = (body: any, req: Request, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } });
const fail = (status: number, error: string, req: Request) => json({ ok: false, error }, req, status);

function isSafeUrl(s: string): boolean {
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    return true;
  } catch {
    return false;
  }
}

async function visitorHash(ip: string, ua: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const raw = `${ip}|${ua}|${day}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const RATE_LIMIT_PER_MINUTE = 60;
const rateBuckets = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - 60_000;
  const arr = (rateBuckets.get(ip) || []).filter(t => t > cutoff);
  if (arr.length >= RATE_LIMIT_PER_MINUTE) return true;
  arr.push(now);
  rateBuckets.set(ip, arr);
  if (rateBuckets.size > 1000) {
    for (const [k, v] of rateBuckets) {
      if (v.length === 0 || v[v.length - 1] < cutoff) rateBuckets.delete(k);
    }
  }
  return false;
}

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  return xff.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown';
}

function parseUA(ua: string): { device: string; browser: string; os: string } {
  const device = /mobile|android|iphone|ipad/i.test(ua)
    ? (/ipad|tablet/i.test(ua) ? 'tablet' : 'mobile')
    : 'desktop';

  let browser = 'Unknown';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = 'Opera';
  else if (/chrome\//i.test(ua) && !/edg/i.test(ua)) browser = 'Chrome';
  else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/firefox\//i.test(ua)) browser = 'Firefox';

  let os = 'Unknown';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/macintosh|mac os/i.test(ua)) os = 'macOS';
  else if (/iphone|ipad/i.test(ua)) os = 'iOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/linux/i.test(ua)) os = 'Linux';

  return { device, browser, os };
}

// ── Google Sheets READONLY auth (for SKU stock lookup) ─────────────────
// Uses spreadsheets.readonly scope — this function can NEVER write to any sheet.

const STOCK_SHEET_ID = '1r1ZyfTcbd8QUI_AZ5ddmSR_uS9ogS6O5LeU4eyDlg-s';
// The OFFLINE MASTER SHEET has two brand tabs to look up — ARYA and DRESSTIVE.
// SKUs from both are merged into one stock map (Active wins on any collision).
const STOCK_TABS = ['ARYA', 'DRESSTIVE'];

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

let gToken: { token: string; expiresAt: number } | null = null;

async function googleReadToken(): Promise<string> {
  if (gToken && gToken.expiresAt > Date.now() + 60_000) return gToken.token;
  const email = Deno.env.get('GOOGLE_CLIENT_EMAIL');
  const pkRaw = Deno.env.get('GOOGLE_PRIVATE_KEY');
  if (!email) throw new Error('Missing GOOGLE_CLIENT_EMAIL');
  if (!pkRaw) throw new Error('Missing GOOGLE_PRIVATE_KEY');
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(pkRaw), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${b64url(new Uint8Array(sig))}`;
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Google OAuth ${resp.status}: ${data.error_description || data.error}`);
  gToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return gToken.token;
}

const norm = (s: string) => s.toUpperCase().replace(/[-\s.]/g, '');
const SIZES = ['XXXL', 'XXL', 'XL', 'XXS', 'XS', 'S', 'M', 'L'];
const NUM_SIZES: Record<string, string> = { '32': 'XXS', '34': 'XS', '36': 'S', '38': 'M', '40': 'L', '42': 'XL', '44': 'XXL', '46': 'XXXL' };

// Canonicalize a size token so "42", "XL", "xl ", "X-L" all collapse to one key.
const canonSize = (s: string): string => {
  const n = norm(s);
  return NUM_SIZES[n] ?? n;
};

// Column O values describing garment construction (unstitched / semi stitched /
// semi-stitched / etc.) are NOT real sizes — ignore them so the row matches on
// SKU alone. Tolerant of case, hyphens, extra spaces and stray punctuation.
const isNonSize = (s: string): boolean => { const l = s.toLowerCase().replace(/[^a-z]/g, ''); return l.includes('stitched') || l.includes('stiched') || l.includes('unstitched') || l.includes('unstiched'); };

const STOCK_SIZE_COL = 14; // Column O = SIZE (per spec)

type Stock = { skuMap: Map<string, string>; sizeMap: Map<string, string> };
let stockCache: { data: Stock; exp: number } | null = null;

const rank = (s: string) => (s === 'Active' ? 1 : 0); // Active wins for bare-SKU rollup

// Fold one tab's rows into the shared maps. Each tab has its own header row,
// so SKU/STATUS columns are detected per tab; SIZE is Column O (per spec).
function ingestRows(rows: string[][], skuMap: Map<string, string>, sizeMap: Map<string, string>) {
  if (!rows || rows.length < 2) return;
  const headers = rows[0].map((h: string) => String(h).trim().toUpperCase());
  const skuCol = headers.findIndex(h => h.includes('SKU') || h === 'ARTICLE' || h === 'CODE');
  const statusCol = headers.findIndex(h => h.includes('STATUS') || h.includes('STOCK') || h === 'ACTIVE');
  if (skuCol < 0) return; // tab without a SKU column — skip it

  for (let i = 1; i < rows.length; i++) {
    const skuRaw = String(rows[i]?.[skuCol] ?? '').trim();
    if (!skuRaw) continue;
    const sku = norm(skuRaw);

    let status = 'Active';
    if (statusCol >= 0) {
      const val = String(rows[i]?.[statusCol] ?? '').trim().toLowerCase();
      if (val === 'inactive' || val === 'discontinued' || val === 'no' || val === 'false' || val === '0' || val === 'out of stock') status = 'Inactive';
    }

    // Column O size — append to SKU unless it's a construction descriptor.
    const sizeRaw = String(rows[i]?.[STOCK_SIZE_COL] ?? '').trim();
    if (sizeRaw && !isNonSize(sizeRaw)) {
      const parts = sizeRaw.includes(',') ? sizeRaw.split(',').map(s => s.trim()).filter(Boolean) : [sizeRaw];
      for (const part of parts) {
        if (!isNonSize(part)) {
          const k = sku + canonSize(part);
          const prevSz = sizeMap.get(k);
          if (prevSz === undefined || rank(status) > rank(prevSz)) sizeMap.set(k, status);
        }
      }
    }

    // Bare-SKU rollup: Active wins so "any size in stock" reports Active.
    const prev = skuMap.get(sku);
    if (prev === undefined || rank(status) > rank(prev)) skuMap.set(sku, status);
  }
}

async function getStock(): Promise<Stock> {
  if (stockCache && stockCache.exp > Date.now()) return stockCache.data;
  const token = await googleReadToken();

  // Read both brand tabs (ARYA + DRESSTIVE) in a single batched request.
  const ranges = STOCK_TABS.map(t => `ranges=${encodeURIComponent(`'${t}'`)}`).join('&');
  const dataRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${STOCK_SHEET_ID}/values:batchGet?${ranges}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!dataRes.ok) throw new Error('Cannot read stock data');
  const payload = await dataRes.json();
  const valueRanges: any[] = payload.valueRanges || [];

  const skuMap = new Map<string, string>();   // base SKU             → status
  const sizeMap = new Map<string, string>();  // base SKU + canon size → status
  for (const vr of valueRanges) ingestRows(vr.values || [], skuMap, sizeMap);

  if (skuMap.size === 0) throw new Error('Stock sheet is empty');

  const data = { skuMap, sizeMap };
  stockCache = { data, exp: Date.now() + 5 * 60_000 };
  return data;
}

// ── Full-row stock (for compare action) ────────────────────────────────
type FullRow = { key: string; displaySku: string; status: string; cells: string[]; tab: string };
type FullStock = { headers: string[]; rows: FullRow[] };
let fullStockCache: { data: FullStock; exp: number } | null = null;

async function getFullStock(): Promise<FullStock> {
  if (fullStockCache && fullStockCache.exp > Date.now()) return fullStockCache.data;
  const token = await googleReadToken();
  const ranges = STOCK_TABS.map(t => `ranges=${encodeURIComponent(`'${t}'`)}`).join('&');
  const dataRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${STOCK_SHEET_ID}/values:batchGet?${ranges}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!dataRes.ok) throw new Error('Cannot read stock data');
  const payload = await dataRes.json();
  const valueRanges: any[] = payload.valueRanges || [];

  let headers: string[] = [];
  const rows: FullRow[] = [];

  for (let vi = 0; vi < valueRanges.length; vi++) {
    const vr = valueRanges[vi];
    const tabName = STOCK_TABS[vi] || `Tab${vi}`;
    const raw: string[][] = vr.values || [];
    if (raw.length < 2) continue;
    const hdr = raw[0].map((h: string) => String(h).trim());
    const hdrUpper = hdr.map(h => h.toUpperCase());
    const skuCol = hdrUpper.findIndex(h => h.includes('SKU') || h === 'ARTICLE' || h === 'CODE');
    const statusCol = hdrUpper.findIndex(h => h.includes('STATUS') || h.includes('STOCK') || h === 'ACTIVE');
    if (skuCol < 0) continue;

    // First tab sets the canonical header order; subsequent tabs remap cells
    let colMap: number[] | null = null;
    if (headers.length === 0) {
      headers = hdr;
    } else if (hdr.length !== headers.length || hdr.some((h, i) => h.toUpperCase() !== headers[i].toUpperCase())) {
      colMap = headers.map(h => hdr.findIndex(th => th.toUpperCase() === h.toUpperCase()));
    }

    for (let i = 1; i < raw.length; i++) {
      const rawCells = raw[i].map((c: any) => String(c ?? ''));
      const cells = colMap ? colMap.map(ci => ci >= 0 ? (rawCells[ci] || '') : '') : rawCells;
      const skuRaw = (colMap ? rawCells[skuCol] : cells[skuCol])?.trim() || '';
      if (!skuRaw) continue;
      const sku = norm(skuRaw);

      let status = 'Active';
      if (statusCol >= 0) {
        const statusVal = colMap ? rawCells[statusCol] : cells[statusCol];
        const val = (statusVal || '').trim().toLowerCase();
        if (val === 'inactive' || val === 'discontinued' || val === 'no' || val === 'false' || val === '0' || val === 'out of stock') status = 'Inactive';
      }

      const sizeVal = colMap ? (rawCells[STOCK_SIZE_COL] || '') : (cells[STOCK_SIZE_COL] || '');
      const sizeRaw = sizeVal.trim();
      if (sizeRaw && !isNonSize(sizeRaw)) {
        const parts = sizeRaw.includes(',') ? sizeRaw.split(',').map(s => s.trim()).filter(Boolean) : [sizeRaw];
        for (const part of parts) {
          if (!isNonSize(part)) {
            const cs = canonSize(part);
            rows.push({ key: sku + cs, displaySku: skuRaw + '-' + cs, status, cells, tab: tabName });
          }
        }
      } else {
        rows.push({ key: sku, displaySku: skuRaw, status, cells, tab: tabName });
      }
    }
  }

  if (rows.length === 0) throw new Error('Stock sheet is empty');
  const data: FullStock = { headers, rows };
  fullStockCache = { data, exp: Date.now() + 5 * 60_000 };
  return data;
}

// ── Raw sheet values (for vendor xlsx download) ────────────────────────
// Unprocessed per-tab values — getFullStock() explodes rows per size and
// rewrites the SKU cell, which is wrong for a sheet download.
type RawSheets = { tab: string; values: string[][] }[];
let rawSheetsCache: { data: RawSheets; exp: number } | null = null;

async function getRawSheets(): Promise<RawSheets> {
  if (rawSheetsCache && rawSheetsCache.exp > Date.now()) return rawSheetsCache.data;
  const token = await googleReadToken();
  const ranges = STOCK_TABS.map(t => `ranges=${encodeURIComponent(`'${t}'`)}`).join('&');
  const dataRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${STOCK_SHEET_ID}/values:batchGet?${ranges}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!dataRes.ok) throw new Error('Cannot read stock data');
  const payload = await dataRes.json();
  const valueRanges: any[] = payload.valueRanges || [];
  const data: RawSheets = valueRanges.map((vr, i) => ({
    tab: STOCK_TABS[i] || `Tab${i + 1}`,
    values: (vr.values || []).map((row: any[]) => row.map(c => String(c ?? ''))),
  }));
  if (data.every(s => s.values.length === 0)) throw new Error('Stock sheet is empty');
  rawSheetsCache = { data, exp: Date.now() + 5 * 60_000 };
  return data;
}

function matchSku(input: string, stock: Stock): string {
  const n = norm(input);
  const { skuMap, sizeMap } = stock;

  // 1. Vendor SKU already carries a canonical size (e.g. TF243XL)
  const direct = sizeMap.get(n);
  if (direct) return direct;

  // 2. Split a trailing size token, canonicalize it, match SKU + size
  for (const sz of SIZES) {
    if (n.length > sz.length && n.endsWith(sz)) {
      const hit = sizeMap.get(n.slice(0, -sz.length) + canonSize(sz));
      if (hit) return hit;
    }
  }
  for (const num of Object.keys(NUM_SIZES)) {
    if (n.length > num.length && n.endsWith(num)) {
      const hit = sizeMap.get(n.slice(0, -num.length) + canonSize(num));
      if (hit) return hit;
    }
  }

  // 3. Exact base SKU (size-agnostic rows, or "any size" rollup)
  const bare = skuMap.get(n);
  if (bare) return bare;

  // 4. Strip a trailing size token and match the base SKU
  for (const sz of SIZES) {
    if (n.length > sz.length && n.endsWith(sz)) { const m = skuMap.get(n.slice(0, -sz.length)); if (m) return m; }
  }
  for (const num of Object.keys(NUM_SIZES)) {
    if (n.length > num.length && n.endsWith(num)) { const m = skuMap.get(n.slice(0, -num.length)); if (m) return m; }
  }

  // 5. Prefix match (vendor SKU is prefix of master, or vice versa)
  for (const [key, status] of skuMap) {
    if (key.startsWith(n) || n.startsWith(key)) return status;
  }

  return 'Not Found';
}

// ── Main handler ───────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return new Response(JSON.stringify({ ok: false, error: 'Rate limited' }), {
      status: 429,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }

  const url = new URL(req.url);
  const ua = req.headers.get('user-agent') || '';
  const referer = req.headers.get('referer') || '';
  const country = req.headers.get('x-country') || req.headers.get('cf-ipcountry') || '';
  const city = req.headers.get('x-city') || req.headers.get('cf-ipcity') || '';
  const { device, browser, os } = parseUA(ua);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const vHash = await visitorHash(ip, ua);

  // GET /:shortCode — redirect
  if (req.method === 'GET') {
    const parts = url.pathname.split('/').filter(Boolean);
    const shortCode = parts[parts.length - 1];
    if (!shortCode || shortCode === 'short-track') {
      return fail(400, 'Missing short code', req);
    }

    const { data: longUrl } = await sb.rpc('record_link_click', {
      p_short_code: shortCode,
      p_user_agent: ua.slice(0, 500),
      p_device_type: device,
      p_browser: browser,
      p_os: os,
      p_referrer: referer.slice(0, 500),
      p_country: country,
      p_city: city,
      p_visitor_hash: vHash,
    });

    if (!longUrl || !isSafeUrl(longUrl)) {
      return new Response('<!doctype html><html><head><meta charset="utf-8"><title>Link not found</title><meta name="robots" content="noindex"><style>body{font-family:-apple-system,sans-serif;background:#060810;color:#E2E8F0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:20px}h1{font-size:20px;margin:0 0 8px}p{font-size:13px;color:#8896B0;margin:0}</style></head><body><div><h1>Link not found</h1><p>This link does not exist or has been removed.</p></div></body></html>', {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' },
      });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: longUrl, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    });
  }

  // POST — actions
  if (req.method === 'POST') {
    try {
      const body = await req.json();

      // SKU stock lookup against Google Sheet (READONLY)
      if (body.action === 'lookup') {
        const skus = body.skus;
        if (!Array.isArray(skus) || skus.length === 0) return fail(400, 'Provide at least one SKU', req);
        if (skus.length > 5000) return fail(400, 'Maximum 5000 SKUs per request', req);
        try {
          const stock = await getStock();
          const results = skus.map((raw: any) => {
            const input = String(raw).trim();
            if (!input) return null;
            return { input, status: matchSku(input, stock) };
          }).filter(Boolean);
          return json({ ok: true, results }, req);
        } catch (e: any) {
          return fail(500, e.message || 'Stock lookup failed', req);
        }
      }

      // Compare vendor SKUs against full master sheet (READONLY)
      if (body.action === 'compare') {
        const skus = body.skus;
        if (!Array.isArray(skus) || skus.length === 0) return fail(400, 'Provide at least one SKU', req);
        if (skus.length > 10000) return fail(400, 'Maximum 10000 SKUs per request', req);
        try {
          const full = await getFullStock();
          const normToOriginal = new Map<string, string>();
          for (const s of skus) { const n = norm(String(s)); if (!normToOriginal.has(n)) normToOriginal.set(n, String(s)); }
          const vendorSet = new Set(normToOriginal.keys());
          const allMasterKeys = new Set(full.rows.map(r => r.key));
          const inactive = full.rows.filter(r => r.status === 'Inactive' && (vendorSet.has(r.key) || vendorSet.has(r.key.replace(/(?:XXXL|XXL|XXS|XL|XS|S|M|L)$/, ''))));
          const inactiveBaseSkus = new Set(full.rows.filter(r => r.status === 'Inactive').map(r => r.key.replace(/(?:XXXL|XXL|XXS|XL|XS|S|M|L)$/, '')));
          const vendorBaseSkus = new Set([...vendorSet].map(k => k.replace(/(?:XXXL|XXL|XXS|XL|XS|S|M|L)$/, '')));
          const nonUploaded = full.rows.filter(r => r.status === 'Active' && !vendorSet.has(r.key) && !vendorBaseSkus.has(r.key.replace(/(?:XXXL|XXL|XXS|XL|XS|S|M|L)$/, '')) && !inactiveBaseSkus.has(r.key.replace(/(?:XXXL|XXL|XXS|XL|XS|S|M|L)$/, '')));
          const masterBaseSkus = new Set(full.rows.map(r => r.key.replace(/(?:XXXL|XXL|XXS|XL|XS|S|M|L)$/, '')));
          const notFound: string[] = [];
          for (const k of vendorSet) { if (!allMasterKeys.has(k) && !masterBaseSkus.has(k)) notFound.push(normToOriginal.get(k) || k); }
          const dupMap = new Map<string, Set<string>>();
          for (const r of full.rows) {
            const base = r.key.replace(/(?:XXXL|XXL|XXS|XL|XS|S|M|L)$/, '');
            if (!dupMap.has(base)) dupMap.set(base, new Set());
            dupMap.get(base)!.add(r.tab);
          }
          const duplicates: { sku: string; tabs: string[] }[] = [];
          const seen = new Set<string>();
          for (const [base, tabs] of dupMap) {
            if (tabs.size > 1 && !seen.has(base)) { seen.add(base); duplicates.push({ sku: base, tabs: [...tabs] }); }
          }
          const fmtCells = (r: FullRow) => { const c = [...r.cells]; c[0] = r.displaySku; return c; };
          return json({ ok: true, headers: full.headers, inactive: inactive.map(fmtCells), nonUploaded: nonUploaded.map(fmtCells), notFound, duplicates }, req);
        } catch (e: any) {
          return fail(500, e.message || 'Compare failed', req);
        }
      }

      // Full raw sheet values for vendor download (READONLY) — proxied through
      // the service account so vendors don't need Google access to the sheet.
      if (body.action === 'sheet') {
        try {
          const sheets = await getRawSheets();
          return json({ ok: true, sheets }, req);
        } catch (e: any) {
          return fail(500, e.message || 'Sheet download failed', req);
        }
      }

      // Resolve short link without redirect
      if (body.action === 'resolve') {
        const { data: longUrl } = await sb.rpc('record_link_click', {
          p_short_code: body.shortCode,
          p_user_agent: ua.slice(0, 500),
          p_device_type: device,
          p_browser: browser,
          p_os: os,
          p_referrer: referer.slice(0, 500),
          p_country: country,
          p_city: city,
          p_visitor_hash: vHash,
        });
        if (!longUrl || !isSafeUrl(longUrl)) return fail(404, 'Link not found', req);
        return json({ ok: true, longUrl }, req);
      }

      return fail(400, 'Unknown action', req);
    } catch {
      return fail(400, 'Invalid JSON body', req);
    }
  }

  return fail(405, 'Method not allowed', req);
});
