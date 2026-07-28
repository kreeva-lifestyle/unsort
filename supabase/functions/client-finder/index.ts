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

const domainOf = (u: string): string => {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
};

type Hit = { domain: string; url: string; page_title: string | null; match_kind: 'full' | 'partial' | 'page'; score: number | null };

// Pages are the answer to the actual question ("who posted it"). Bare image
// URLs are added only for domains no page already covers, so a site is never
// listed twice but a hosting domain is never silently dropped either.
function toHits(w: WebDetection): Hit[] {
  const hits: Hit[] = [];
  const seenDomain = new Set<string>();
  for (const p of w.pagesWithMatchingImages ?? []) {
    if (!p?.url) continue;
    const d = domainOf(p.url);
    if (!d) continue;
    const kind: Hit['match_kind'] = (p.fullMatchingImages?.length ?? 0) > 0 ? 'full'
      : (p.partialMatchingImages?.length ?? 0) > 0 ? 'partial' : 'page';
    hits.push({ domain: d, url: p.url, page_title: p.pageTitle?.slice(0, 300) || null, match_kind: kind, score: p.score ?? null });
    seenDomain.add(d);
  }
  const addImages = (arr: { url?: string }[] | undefined, kind: 'full' | 'partial') => {
    for (const im of arr ?? []) {
      if (!im?.url) continue;
      const d = domainOf(im.url);
      if (!d || seenDomain.has(d)) continue;
      hits.push({ domain: d, url: im.url, page_title: null, match_kind: kind, score: null });
      seenDomain.add(d);
    }
  };
  addImages(w.fullMatchingImages, 'full');
  addImages(w.partialMatchingImages, 'partial');
  const rank = { full: 0, partial: 1, page: 2 };
  return hits.sort((a, b) => rank[a.match_kind] - rank[b.match_kind] || (b.score ?? 0) - (a.score ?? 0));
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
    try {
      let b64 = PX;
      if (probeUrl) {
        const im = await fetch(probeUrl);
        if (!im.ok) return fail(502, `Could not fetch that image: HTTP ${im.status}`, req);
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
    if (used >= DAILY_CAP) {
      return fail(429, `Daily limit reached - ${DAILY_CAP} searches per person per day. Try again tomorrow.`, req);
    }

    const source = body?.source === 'sku' ? 'sku' : 'upload';
    let bytes: Uint8Array;
    let sku: string | null = null;

    if (source === 'sku') {
      sku = String(body?.sku || '').trim().toUpperCase();
      if (!sku) return fail(400, 'Enter a SKU', req);
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
      const hR = await fetch(`${SB_URL}/rest/v1/client_finder_hits?search_id=eq.${prev.id}&select=domain,url,page_title,match_kind,score`, { headers: svcHeaders });
      const hits = await hR.json().catch(() => []);
      return json({ ok: true, cached: true, search_id: prev.id, best_guess: prev.best_guess, hits, used: used, cap: DAILY_CAP }, req);
    }

    const web = await visionWebDetection(bytesToB64(bytes));
    const hits = toHits(web);
    const bestGuess = web.bestGuessLabels?.[0]?.label ?? null;

    const insR = await fetch(`${SB_URL}/rest/v1/client_finder_searches`, {
      method: 'POST',
      headers: { ...svcHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({ searched_by: who.id, source, sku, image_sha256: sha, best_guess: bestGuess, hit_count: hits.length }),
    });
    const search = (await insR.json().catch(() => []))?.[0];
    if (!search?.id) return fail(500, 'Search ran but could not be saved', req, await insR.text().catch(() => ''));

    if (hits.length) {
      await fetch(`${SB_URL}/rest/v1/client_finder_hits`, {
        method: 'POST', headers: svcHeaders,
        body: JSON.stringify(hits.map(h => ({ ...h, search_id: search.id }))),
      });
    }

    return json({
      ok: true, cached: false, search_id: search.id, best_guess: bestGuess,
      entities: (web.webEntities ?? []).filter(e => e.description).slice(0, 8).map(e => e.description),
      hits, used: used + 1, cap: DAILY_CAP,
    }, req);
  } catch (e) {
    return fail(500, (e as Error).message || 'Client Finder failed', req);
  }
});
