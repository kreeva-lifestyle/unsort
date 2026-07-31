// Client Finder - reverse image search over Google Cloud Vision WEB_DETECTION.
//
// "Which websites have posted this product?" No language model can answer that;
// there is no image index behind one. Vision's WEB_DETECTION does exactly this
// job: given image bytes it returns pagesWithMatchingImages - the URLs of pages
// hosting that image - plus full/partial matching image URLs and a best-guess
// label.
//
// Kept OUT of listing-ai (~130k chars): every deploy of that file risks live
// features, and this shares nothing with it but the service-account pattern.
//
// Honest limits, worth remembering before trusting a result:
//   - Only what Google has INDEXED is findable. Login-walled B2B portals,
//     WhatsApp catalogues and private drives are invisible.
//   - Marketplaces re-encode, crop and watermark, so partial matches are the
//     norm and byte-identical ones the exception.
//   - "No hits" never proves nobody copied a design.
//
// Spend control: access is any signed-in user (owner's call), so the cap is
// enforced HERE, server-side, where the client cannot bypass it.

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const svcHeaders = { apikey: SB_SVC, authorization: `Bearer ${SB_SVC}`, 'content-type': 'application/json' };

// Searches per user per rolling 24h. Deliberately low to start: this is a paid
// per-image API and the point is to learn result quality before opening taps.
const DAILY_CAP = 25;
// Re-searching the same bytes inside this window reuses the stored hits.
const DEDUPE_HOURS = 24;

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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ping-secret',
  };
}
const json = (body: unknown, req: Request, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'content-type': 'application/json' } });
const fail = (status: number, error: string, req: Request, details?: string) =>
  json({ ok: false, error, details }, req, status);

// ── Caller ──────────────────────────────────────────────────────────────────
async function caller(req: Request): Promise<{ id: string; role: string } | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: SB_SVC } });
  if (!u.ok) return null;
  const user = await u.json().catch(() => null);
  if (!user?.id) return null;
  const p = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=role,is_active`, { headers: svcHeaders });
  const rows = await p.json().catch(() => []);
  const prof = rows?.[0];
  if (!prof || prof.is_active === false) return null;
  return { id: user.id, role: prof.role ?? '' };
}

// ── Google auth (same service account as master-sync / listing-ai) ───────────
function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// cloud-platform is the scope Vision accepts; the sheets/drive scopes used by
// master-sync do NOT cover it.
const SCOPES = 'https://www.googleapis.com/auth/cloud-platform';

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

// ── Bytes helpers ───────────────────────────────────────────────────────────
// Chunked: String.fromCharCode(...arr) overflows the call stack on a photo-
// sized array, which would look like a random crash on bigger uploads only.
function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
}
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── SKU -> image bytes ──────────────────────────────────────────────────────
// The master sheet's IMAGE column holds a Dropbox FOLDER link (/scl/fo/...),
// not an image, so it cannot be fetched directly. odette-export's `linkgen`
// with mode=separate already resolves a SKU to one link per image inside that
// folder - reuse it rather than reimplementing Dropbox listing here.
// A SKU that lives in more than one Dropbox folder is a QUESTION, not a
// failure: linkgen answers with the candidate folders and takes a `folder`
// argument to settle it. Carried as a typed error so the handler can hand the
// list to the UI - the previous version kept linkgen's "tap the folder you
// want" wording and threw the candidates away, so the app printed an
// instruction with nothing to tap.
class NeedsFolder extends Error {
  constructor(message: string, readonly candidates: unknown[]) { super(message); }
}

async function skuImageBytes(sku: string, authHeader: string, folder?: string): Promise<{ bytes: Uint8Array; url: string }> {
  const r = await fetch(`${SB_URL}/functions/v1/odette-export`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: authHeader, apikey: SB_SVC },
    body: JSON.stringify({ action: 'linkgen', sku, mode: 'separate', folder: folder || undefined }),
  });
  const data = await r.json().catch(() => ({}));
  if (!data?.ok && Array.isArray(data?.candidates) && data.candidates.length) {
    throw new NeedsFolder(String(data?.details || data?.error || `"${sku}" was found in more than one folder`), data.candidates);
  }
  if (!data?.ok) throw new Error(data?.details || data?.error || `Could not find images for ${sku}`);
  const first = (data.links || []).find((l: { url?: string; error?: string }) => l?.url && !l.error);
  if (!first) throw new Error(`No usable image found in the Dropbox folder for ${sku}`);
  // A share link serves an HTML preview page by default; raw=1 serves the file.
  const raw = String(first.url).replace(/([?&])dl=0\b/, '$1raw=1').replace(/([?&])dl=1\b/, '$1raw=1');
  const img = await fetch(raw.includes('raw=1') ? raw : `${raw}${raw.includes('?') ? '&' : '?'}raw=1`);
  if (!img.ok) throw new Error(`Dropbox returned ${img.status} for the image of ${sku}`);
  const buf = new Uint8Array(await img.arrayBuffer());
  if (buf.length < 512) throw new Error(`Image for ${sku} came back empty or as a preview page, not a photo`);
  return { bytes: buf, url: String(first.url) };
}

// ── Vision ──────────────────────────────────────────────────────────────────
interface WebPage { url?: string; pageTitle?: string; score?: number; fullMatchingImages?: { url?: string }[]; partialMatchingImages?: { url?: string }[] }
interface WebDetection {
  webEntities?: { description?: string; score?: number }[];
  fullMatchingImages?: { url?: string }[];
  partialMatchingImages?: { url?: string }[];
  pagesWithMatchingImages?: WebPage[];
  visuallySimilarImages?: { url?: string }[];
  bestGuessLabels?: { label?: string }[];
}

async function visionWebDetection(b64: string): Promise<WebDetection> {
  const token = await googleToken();
  const r = await fetch('https://vision.googleapis.com/v1/images:annotate', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ requests: [{ image: { content: b64 }, features: [{ type: 'WEB_DETECTION', maxResults: 50 }] }] }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Vision ${r.status}: ${data?.error?.message || 'unknown error'}`);
  const resp = data?.responses?.[0];
  // Vision reports per-image failures INSIDE a 200 response. Surfacing this is
  // the difference between "no websites found" and "the call never ran".
  if (resp?.error?.message) throw new Error(`Vision: ${resp.error.message}`);
  return resp?.webDetection ?? {};
}

// A retailer serves its images from a CDN alias of itself, so myntra.com and
// assets.myntassets.com are ONE seller listed twice. Folded deliberately and
// conservatively - a wrong fold would merge two genuinely different sellers,
// which is worse than a duplicate row.
const CDN_PARENT: Record<string, string> = {
  'myntassets.com': 'myntra.com',
  'ytimg.com': 'youtube.com',
  'fbsbx.com': 'facebook.com',
  'in.pinterest.com': 'pinterest.com',
};

const domainOf = (u: string): string => {
  try {
    const h = new URL(u).hostname.replace(/^www\./, '').toLowerCase();
    if (CDN_PARENT[h]) return CDN_PARENT[h];
    for (const [suffix, parent] of Object.entries(CDN_PARENT)) {
      if (h === suffix || h.endsWith('.' + suffix)) return parent;
    }
    return h;
    // No generic cdn./assets./img. prefix-stripping here — it turned
    // cdn.shopify.com into "shopify.com", and the per-domain dedupe below then
    // DELETED every Shopify-hosted store after the first one. Multi-tenant
    // hosts are not CDN aliases of one seller. Folding stays opt-in via the
    // hardcoded CDN_PARENT map, exactly as its comment demands.
  } catch { return ''; }
};

// Hosts where one domain serves MANY unrelated sellers. Deduping these by
// domain would keep one store and silently drop the rest — for Indian
// ethnicwear, Shopify resellers are the dominant copy vector, so that was
// likely the single largest source of missed clients. Dedupe by full URL
// instead: a duplicate row is cheaper than a deleted client.
const MULTI_TENANT = ['shopify.com', 'myshopify.com', 'wixstatic.com', 'wixsite.com', 'squarespace-cdn.com', 'squarespace.com', 'bigcartel.com', 'blogspot.com', 'wordpress.com', 'cloudfront.net'];
const isMultiTenant = (d: string) => MULTI_TENANT.some(s => d === s || d.endsWith('.' + s));

type Hit = {
  domain: string; url: string; page_title: string | null;
  match_kind: 'full' | 'partial' | 'page' | 'similar'; score: number | null;
  // The matching IMAGE. For a page hit `url` is the page (that is what a human
  // wants to open), so the image is carried separately - it is what gets
  // measured. null width/height/bytes mean NOT MEASURED, never "small".
  image_url: string | null; width: number | null; height: number | null; bytes: number | null;
};

const unmeasured = { image_url: null, width: null, height: null, bytes: null };

// Pages are the answer to the actual question ("who posted it").
//
// A page carrying NEITHER fullMatchingImages NOR partialMatchingImages is
// dropped. Those are label associations, not image matches: searching DRS199
// returned Amazon "Gown: Clothing", Zappos nightwear, four YouTube videos and
// Collins Dictionary - all because the best-guess label was "gown". Eleven of
// fourteen hits were that, burying the one result that mattered (a wholesaler
// listing the design by name). They matched the WORD, not the photo.
//
// visuallySimilarImages are kept but marked 'similar' and never mixed in: they
// show a competitor working in the same style, never that anyone used your
// image, and the UI must not blur that line.
function toHits(w: WebDetection): Hit[] {
  const hits: Hit[] = [];
  const seenDomain = new Set<string>();
  for (const p of w.pagesWithMatchingImages ?? []) {
    if (!p?.url) continue;
    const d = domainOf(p.url);
    if (!d) continue;
    const full = (p.fullMatchingImages?.length ?? 0) > 0;
    const partial = (p.partialMatchingImages?.length ?? 0) > 0;
    if (!full && !partial) continue;              // word match, not image match
    hits.push({
      domain: d, url: p.url, page_title: p.pageTitle?.slice(0, 300) || null,
      match_kind: full ? 'full' : 'partial', score: p.score ?? null,
      ...unmeasured,
      // Vision hands back the image URLs on the page and this used to throw
      // them away after a length check. They are the only thing measurable.
      image_url: p.fullMatchingImages?.[0]?.url ?? p.partialMatchingImages?.[0]?.url ?? null,
    });
    seenDomain.add(d);
  }
  const seenUrl = new Set<string>();
  const addImages = (arr: { url?: string }[] | undefined, kind: 'full' | 'partial' | 'similar') => {
    for (const im of arr ?? []) {
      if (!im?.url) continue;
      const d = domainOf(im.url);
      if (!d) continue;
      // Multi-tenant hosts dedupe by URL, everything else by domain — ten
      // Shopify stores hosting the design must yield ten rows, not one.
      if (isMultiTenant(d) ? seenUrl.has(im.url) : seenDomain.has(d)) continue;
      // Here the hit IS the image, so both fields point at it.
      hits.push({ domain: d, url: im.url, page_title: null, match_kind: kind, score: null, ...unmeasured, image_url: im.url });
      seenDomain.add(d);
      seenUrl.add(im.url);
    }
  };
  addImages(w.fullMatchingImages, 'full');
  addImages(w.partialMatchingImages, 'partial');
  addImages(w.visuallySimilarImages, 'similar');
  const rank = { full: 0, partial: 1, page: 2, similar: 3 };
  return hits.sort((a, b) => rank[a.match_kind] - rank[b.match_kind] || (b.score ?? 0) - (a.score ?? 0));
}

// -- Image measurement -------------------------------------------------------
// Vision returns no dimensions and no file size, so the only way to rank by
// "biggest copy" is to go and look. A ranged GET pulls a few KB of header
// rather than a whole 3 MB photo.
const MEASURE_MAX = 60;        // hits measured per search
const MEASURE_CONCURRENCY = 8;
const MEASURE_TIMEOUT_MS = 4_000;
const MEASURE_BUDGET_MS = 15_000;
const HEADER_BYTES = 65_535;

const be16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const le16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const be32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

// Dimensions from a file header. Returns null rather than guessing - a wrong
// number here would reorder the results and mislead.
function imageSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 16) return null;

  // PNG: 8-byte signature, then IHDR length+type, then w/h as big-endian u32.
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { width: be32(b, 16), height: be32(b, 20) };
  }
  // GIF: logical screen descriptor, little-endian u16.
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { width: le16(b, 6), height: le16(b, 8) };
  }
  // WebP: RIFF container, three possible codec chunks.
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const tag = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (tag === 'VP8 ' && b.length >= 30) {
      // 3-byte frame tag, 3-byte sync code (9D 01 2A), then 14-bit dims.
      return { width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff };
    }
    if (tag === 'VP8L' && b.length >= 25) {
      const n = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: (n & 0x3fff) + 1, height: ((n >> 14) & 0x3fff) + 1 };
    }
    if (tag === 'VP8X' && b.length >= 30) {
      return {
        width: (b[24] | (b[25] << 8) | (b[26] << 16)) + 1,
        height: (b[27] | (b[28] << 8) | (b[29] << 16)) + 1,
      };
    }
    return null;
  }
  // JPEG: walk the marker chain BY LENGTH. Scanning for an SOF byte pattern
  // instead would find the SOF of the EXIF thumbnail inside APP1 and report
  // the thumbnail's size as the image's.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 3 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }        // resync over fill bytes
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0x01 || (m >= 0xd0 && m <= 0xd9)) { i += 2; continue; }  // standalone
      const len = be16(b, i + 2);
      if (len < 2) return null;
      // SOF0-SOF15, excluding DHT (C4), JPG (C8) and DAC (CC), which sit in
      // the same range but are not frame headers.
      const isSof = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
      if (isSof) {
        if (i + 9 > b.length) return null;
        return { height: be16(b, i + 5), width: be16(b, i + 7) };
      }
      if (m === 0xda) return null;                 // start of scan, no SOF seen
      i += 2 + len;
    }
    return null;
  }
  return null;
}

type Measured = { width: number | null; height: number | null; bytes: number | null };

async function measureImage(url: string): Promise<Measured> {
  const miss: Measured = { width: null, height: null, bytes: null };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), MEASURE_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal, redirect: 'follow',
      headers: {
        Range: `bytes=0-${HEADER_BYTES}`,
        // Some CDNs serve a block page to an unrecognised agent.
        accept: 'image/*,*/*;q=0.8',
      },
    });
    if (!r.ok) { try { await r.body?.cancel(); } catch { /* noop */ } return miss; }

    // 206 gives the true total after the slash; a server ignoring Range
    // answers 200 and Content-Length is then the whole file.
    const cr = r.headers.get('content-range') || '';
    const total = cr.includes('/') ? Number(cr.split('/')[1]) : Number(r.headers.get('content-length') || '');
    const bytes = Number.isFinite(total) && total > 0 ? total : null;

    // Read AT MOST the header window, then hang up. arrayBuffer() here trusted
    // the Range header to have been honoured — but plenty of hosts answer a
    // ranged GET with 200 and the whole file, and 8 workers each buffering a
    // print-res JPEG is how an edge isolate hits its memory ceiling and takes
    // the entire (already paid-for) search down with it.
    const CAP = HEADER_BYTES + 1;
    let buf = new Uint8Array(0);
    const reader = r.body?.getReader();
    if (reader) {
      const parts: Uint8Array[] = [];
      let got = 0;
      while (got < CAP) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) { parts.push(value); got += value.length; }
      }
      try { await reader.cancel(); } catch { /* already closed */ }
      buf = new Uint8Array(Math.min(got, CAP));
      let off = 0;
      for (const p of parts) {
        if (off >= buf.length) break;
        buf.set(p.subarray(0, Math.min(p.length, buf.length - off)), off);
        off += p.length;
      }
    }
    const dim = imageSize(buf);
    // Sanity bound mirrors the DB CHECK, so a parser slip can never poison a
    // whole insert batch.
    if (!dim || dim.width <= 0 || dim.height <= 0 || dim.width > 100000 || dim.height > 100000) {
      return { width: null, height: null, bytes };
    }
    return { width: dim.width, height: dim.height, bytes };
  } catch {
    return miss;                                   // timeout, DNS, TLS, abort
  } finally {
    clearTimeout(t);
  }
}

// Measures in place, bounded three ways: how many, how parallel, how long.
// Returns how many were skipped so the caller can SAY so rather than let the
// user assume everything was measured.
async function measureAll(hits: Hit[]): Promise<{ measured: number; skipped: number }> {
  const targets = hits.slice(0, MEASURE_MAX).filter(h => h.image_url);
  const skipped = hits.length - targets.length;
  const deadline = Date.now() + MEASURE_BUDGET_MS;
  let cursor = 0, measured = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      if (Date.now() > deadline) return;           // out of time: leave as null
      const h = targets[cursor++];
      const m = await measureImage(h.image_url as string);
      h.width = m.width; h.height = m.height; h.bytes = m.bytes;
      if (m.width || m.bytes) measured++;
    }
  };
  await Promise.all(Array.from({ length: MEASURE_CONCURRENCY }, () => worker()));
  return { measured, skipped };
}

// Biggest copy first, but never at the cost of the full/partial vs similar
// distinction: a look-alike from another brand outranking a genuine match
// would read as someone copying a design when they have not.
// Unmeasured sorts last - it means "unknown", not "small".
const px = (h: Hit) => (h.width ?? 0) * (h.height ?? 0);
function bySize(a: Hit, b: Hit): number {
  const band = (h: Hit) => (h.match_kind === 'similar' ? 1 : 0);
  if (band(a) !== band(b)) return band(a) - band(b);
  const known = (h: Hit) => (h.width && h.height ? 0 : h.bytes ? 1 : 2);
  if (known(a) !== known(b)) return known(a) - known(b);
  return px(b) - px(a) || (b.bytes ?? 0) - (a.bytes ?? 0);
}

// ── Handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return fail(405, 'Method not allowed', req);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body?.action || 'search');

  // Diagnostic only: proves the service account can actually reach Vision.
  // Authorised by a signed-in user OR the x-ping-secret shared secret - same
  // store and handling as master_sync_secret - so connectivity can be checked
  // server-side (pg_net, cron, a deploy smoke test) without a browser session.
  // Reads no user data, writes nothing, and costs one 1x1 pixel.
  if (action === 'ping') {
    const ping = (req.headers.get('x-ping-secret') || '').trim();
    let allowed = false;
    if (ping) {
      const s = await fetch(`${SB_URL}/rest/v1/app_secrets?key=eq.client_finder_ping_secret&select=value`, { headers: svcHeaders });
      const want = String((await s.json().catch(() => []))?.[0]?.value || '');
      allowed = want.length > 0 && ping === want;
    }
    if (!allowed && !(await caller(req))) return fail(401, 'Sign in to DailyOffice first', req);
    // With no image: a 1x1 pixel, so the check costs nothing and only asks
    // "can we reach Vision at all". With image_url: a real dry run that
    // reports what would be found, WITHOUT writing a search or spending a
    // user's daily quota - this is how result quality gets measured honestly.
    const PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const probeUrl = String(body?.image_url || '').trim();
    // The image dry-run needs the ping SECRET, not just a session: for a
    // signed-in user it was an unmetered billed Vision call (no search row, no
    // daily cap, no audit trail) plus an open server-side fetch of any URL
    // they typed. Ops holding the secret keep the full dry-run; a session
    // gets the 1x1 reachability check only.
    if (probeUrl && !allowed) return fail(403, 'The image dry-run needs the ping secret', req);
    if (probeUrl && !/^https:\/\//i.test(probeUrl)) return fail(400, 'Only https image URLs can be probed', req);
    try {
      let b64 = PX;
      if (probeUrl) {
        const im = await fetch(probeUrl, { redirect: 'follow' });
        if (!im.ok) { try { await im.body?.cancel(); } catch { /* noop */ } return fail(502, `Could not fetch that image: HTTP ${im.status}`, req); }
        const len = Number(im.headers.get('content-length') || 0);
        if (len > 15_000_000) { try { await im.body?.cancel(); } catch { /* noop */ } return fail(413, 'That image is too large to probe', req); }
        b64 = bytesToB64(new Uint8Array(await im.arrayBuffer()));
      }
      const web = await visionWebDetection(b64);
      const hits = toHits(web);
      return json({
        ok: true, vision: 'reachable', dryRun: !!probeUrl,
        best_guess: web.bestGuessLabels?.[0]?.label ?? null,
        entities: (web.webEntities ?? []).filter(e => e.description).slice(0, 8).map(e => e.description),
        hit_count: hits.length, hits: hits.slice(0, 25),
      }, req);
    } catch (e) {
      return fail(502, (e as Error).message || 'Vision unreachable', req);
    }
  }

  const who = await caller(req);
  if (!who) return fail(401, 'Sign in to DailyOffice first', req);

  try {
    if (action !== 'search') return fail(400, 'Unknown action', req);

    // Rate limit BEFORE any paid work.
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const cntR = await fetch(
      `${SB_URL}/rest/v1/client_finder_searches?searched_by=eq.${who.id}&created_at=gte.${since}&select=id`,
      { headers: { ...svcHeaders, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' } });
    const used = Number((cntR.headers.get('content-range') || '/0').split('/')[1] || 0);
    // Fail CLOSED. An errored count query (or a content-range of "*" -> NaN)
    // used to read as used=0/NaN and wave every request past the cap — the one
    // control this file exists to enforce, off exactly when the DB is unwell.
    if (!cntR.ok || !Number.isFinite(used)) {
      return fail(503, 'Could not verify today\'s search count - try again in a moment', req);
    }
    if (used >= DAILY_CAP) {
      return fail(429, `Daily limit reached - ${DAILY_CAP} searches per person per day. Try again tomorrow.`, req);
    }

    const source = body?.source === 'sku' ? 'sku' : 'upload';
    let bytes: Uint8Array;
    let sku: string | null = null;

    if (source === 'sku') {
      sku = String(body?.sku || '').trim().toUpperCase();
      if (!sku) return fail(400, 'Enter a SKU', req);
      // The client now lists the SKU's photos itself and sends the one the
      // user picked, so there is nothing to resolve and nothing to guess.
      // Without it we fall back to the old first-photo path, so a half-deployed
      // client keeps working.
      const picked = String(body?.image_url || '').trim();
      if (picked) {
        const raw = picked.replace(/([?&])dl=[01]\b/, '$1raw=1');
        const img = await fetch(raw.includes('raw=1') ? raw : `${raw}${raw.includes('?') ? '&' : '?'}raw=1`);
        if (!img.ok) return fail(502, `Dropbox returned ${img.status} for that photo`, req);
        const buf = new Uint8Array(await img.arrayBuffer());
        if (buf.length < 512) return fail(502, 'That photo came back empty or as a preview page', req);
        bytes = buf;
      } else {
        try {
          const got = await skuImageBytes(sku, req.headers.get('authorization') || '', String(body?.folder || ''));
          bytes = got.bytes;
        } catch (e) {
          // 409, not 500: nothing is broken, the request is just ambiguous. The
          // candidates go back so the UI can offer a real choice. No Vision call
          // happens and no search row is written, so this costs no quota.
          if (e instanceof NeedsFolder) {
            return json({ ok: false, needsFolder: true, sku, error: e.message, candidates: e.candidates }, req, 409);
          }
          throw e;
        }
      }
    } else {
      const b64in = String(body?.image_b64 || '').replace(/^data:[^;]+;base64,/, '');
      if (!b64in) return fail(400, 'Attach an image first', req);
      const bin = atob(b64in);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      if (bytes.length < 512) return fail(400, 'That file does not look like a photo', req);
    }

    const sha = await sha256Hex(bytes);

    // Same bytes, same person, recently: reuse rather than pay again.
    const dSince = new Date(Date.now() - DEDUPE_HOURS * 3600_000).toISOString();
    const prevR = await fetch(
      `${SB_URL}/rest/v1/client_finder_searches?searched_by=eq.${who.id}&image_sha256=eq.${sha}&created_at=gte.${dSince}&select=id,best_guess&order=created_at.desc&limit=1`,
      { headers: svcHeaders });
    const prev = (await prevR.json().catch(() => []))?.[0];
    if (prev?.id) {
      // The size columns come back too: re-measuring on every cache hit would
      // be slow and would hammer the hosting sites for numbers already known.
      const hR = await fetch(`${SB_URL}/rest/v1/client_finder_hits?search_id=eq.${prev.id}&select=domain,url,page_title,match_kind,score,image_url,width,height,bytes`, { headers: svcHeaders });
      const hRaw = await hR.json().catch(() => []);
      // A PostgREST ERROR parses as an object, and .sort on it threw a 500 on
      // every repeat search. A failed cache read now falls through to a fresh
      // search instead of crashing (the sha-dedupe lookup takes the newest
      // row, so the duplicate search row is harmless).
      if (hR.ok && Array.isArray(hRaw)) {
        const hits = (hRaw as Hit[]).sort(bySize);
        return json({ ok: true, cached: true, search_id: prev.id, best_guess: prev.best_guess, hits, used: used, cap: DAILY_CAP }, req);
      }
      console.error('client-finder: cached hits read failed', hR.status);
    }

    const web = await visionWebDetection(bytesToB64(bytes));
    const hits = toHits(web);
    const bestGuess = web.bestGuessLabels?.[0]?.label ?? null;

    // Go and look at how big each hosted copy actually is, then rank by it.
    // No extra Vision calls, so this does not touch the daily cap.
    const sizing = await measureAll(hits);
    hits.sort(bySize);

    const insR = await fetch(`${SB_URL}/rest/v1/client_finder_searches`, {
      method: 'POST',
      headers: { ...svcHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({ searched_by: who.id, source, sku, image_sha256: sha, best_guess: bestGuess, hit_count: hits.length }),
    });
    const search = (await insR.json().catch(() => []))?.[0];
    if (!search?.id) return fail(500, 'Search ran but could not be saved', req, await insR.text().catch(() => ''));

    if (hits.length) {
      const hR = await fetch(`${SB_URL}/rest/v1/client_finder_hits`, {
        method: 'POST', headers: svcHeaders,
        body: JSON.stringify(hits.map(h => ({ ...h, search_id: search.id }))),
      });
      // A rejected batch (one bad column, one failed CHECK) stores NOTHING —
      // and the search row written above would then satisfy the 24h sha-dedupe
      // and serve an empty "cached" result for a photo that had matches. The
      // row must go too, so the next search genuinely re-runs; only then is
      // the warning below true. The search itself succeeded, so this stays a
      // warning on a 200, not a failure.
      if (!hR.ok) {
        console.error('client-finder: hits insert failed', hR.status, await hR.text().catch(() => ''));
        await fetch(`${SB_URL}/rest/v1/client_finder_searches?id=eq.${search.id}`, { method: 'DELETE', headers: svcHeaders })
          .catch(e => console.error('client-finder: poisoned search row cleanup failed', e));
        return json({
          ok: true, cached: false, search_id: search.id, best_guess: bestGuess,
          entities: (web.webEntities ?? []).filter(e => e.description).slice(0, 8).map(e => e.description),
          hits, used: used + 1, cap: DAILY_CAP,
          warning: 'Results are shown but could not be saved — searching this photo again will re-run it.',
        }, req);
      }
    }

    return json({
      ok: true, cached: false, search_id: search.id, best_guess: bestGuess,
      entities: (web.webEntities ?? []).filter(e => e.description).slice(0, 8).map(e => e.description),
      hits, used: used + 1, cap: DAILY_CAP,
      // Said out loud: silence here would read as "everything was measured".
      sized: sizing.measured, unsized: hits.length - sizing.measured, size_skipped: sizing.skipped,
    }, req);
  } catch (e) {
    return fail(500, (e as Error).message || 'Client Finder failed', req);
  }
});
