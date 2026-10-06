// sku-thumbs — one small product thumbnail per SKU, from Dropbox, made ONCE.
//
// POST { skus: string[] } (≤12, signed-in, active profile) →
//   { ok, results: [{ sku, status: 'ok'|'missing', version }] }
//
// For each SKU: if public.sku_thumbs already has it ('ok', or 'missing'
// checked within the last 3 days) the row answers without touching Dropbox.
// Otherwise the SKU's first photo is found in its Dropbox folder, Dropbox
// renders a 256px JPEG, and it is stored in the public sku-thumbs bucket as
// <SKU>.jpg; the row records status + version (the cache-buster the app adds
// to the URL). Every later view of that SKU is a plain CDN image — no edge
// call, no Dropbox call. Writes use the service role; the caller is checked.
//
// POST { big: sku } → the same photo at 2048px as raw bytes, for the zoom
// view. Only on a tap, only for a SKU that already has a thumbnail (its
// Dropbox path is on the row), and nothing is stored.
// deno-lint-ignore-file no-explicit-any
import { getDropboxToken, rootPaths, firstPhoto, thumbnail, normSku } from './dropbox.ts';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const svcHeaders = { apikey: SB_SVC, authorization: `Bearer ${SB_SVC}` };
const RECHECK_MISSING_MS = 3 * 24 * 3600_000;
const MAX_SKUS = 12;
const SKU_KEY = /^[A-Z0-9][A-Z0-9 _.-]{0,47}$/;

const ALLOWED_ORIGINS = ['https://dailyoffice.aryadesigns.co.in', 'http://localhost:5173', 'http://localhost:4173'];
function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}
const json = (body: unknown, req: Request, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'content-type': 'application/json' } });

/** Signed-in, active user — the anon key alone is not enough. */
async function callerOk(req: Request): Promise<boolean> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: SB_SVC } });
  if (!u.ok) return false;
  const user = await u.json().catch(() => null);
  if (!user?.id) return false;
  const p = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=is_active`, { headers: svcHeaders });
  const rows = await p.json().catch(() => []);
  return !!rows?.[0] && rows[0].is_active !== false;
}

async function knownRows(skus: string[]): Promise<Map<string, any>> {
  const list = skus.map(s => `"${s}"`).join(',');
  const r = await fetch(`${SB_URL}/rest/v1/sku_thumbs?sku=in.(${encodeURIComponent(list)})&select=sku,status,checked_at,version`, { headers: svcHeaders });
  const rows = r.ok ? await r.json().catch(() => []) : [];
  return new Map((Array.isArray(rows) ? rows : []).map((x: any) => [String(x.sku), x]));
}

async function saveRow(sku: string, status: 'ok' | 'missing', path: string | null, version: number) {
  const now = new Date().toISOString();
  const r = await fetch(`${SB_URL}/rest/v1/sku_thumbs`, {
    method: 'POST',
    headers: { ...svcHeaders, 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ sku, status, dropbox_path: path, version, checked_at: now, updated_at: now }]),
  });
  if (!r.ok) throw new Error(`sku_thumbs save ${r.status}`);
}

async function makeThumb(token: string, roots: string[], sku: string): Promise<{ sku: string; status: 'ok' | 'missing'; version: number }> {
  const path = await firstPhoto(token, roots, sku);
  if (!path) { await saveRow(sku, 'missing', null, 0); return { sku, status: 'missing', version: 0 }; }
  const bytes = await thumbnail(token, path);
  const up = await fetch(`${SB_URL}/storage/v1/object/sku-thumbs/${encodeURIComponent(sku)}.jpg`, {
    method: 'POST',
    headers: { ...svcHeaders, 'content-type': 'image/jpeg', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' },
    body: bytes,
  });
  if (!up.ok) throw new Error(`thumb upload ${up.status}`);
  const version = Math.floor(Date.now() / 1000);
  await saveRow(sku, 'ok', path, version);
  return { sku, status: 'ok', version };
}

async function bigPhoto(req: Request, sku: string): Promise<Response> {
  if (!SKU_KEY.test(sku)) return json({ ok: false, error: 'Invalid SKU' }, req, 400);
  const r = await fetch(`${SB_URL}/rest/v1/sku_thumbs?sku=eq.${encodeURIComponent(sku)}&status=eq.ok&select=dropbox_path`, { headers: svcHeaders });
  const path = r.ok ? (await r.json().catch(() => []))?.[0]?.dropbox_path : null;
  if (!path) return json({ ok: false, error: 'No photo for this SKU' }, req, 404);
  let token = '';
  try { token = await getDropboxToken(); } catch { return json({ ok: false, error: 'dropbox_not_connected' }, req, 409); }
  const bytes = await thumbnail(token, path, 'w2048h1536');
  // octet-stream so supabase-js hands the client a Blob.
  return new Response(bytes, { headers: { ...corsHeaders(req), 'content-type': 'application/octet-stream', 'cache-control': 'private, max-age=3600' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, req, 405);
  if (!(await callerOk(req))) return json({ ok: false, error: 'Sign in again to load product photos' }, req, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Invalid JSON body' }, req, 400); }
  if (typeof body?.big === 'string') {
    try { return await bigPhoto(req, normSku(body.big)); }
    catch (e) { return json({ ok: false, error: (e as Error).message || 'Could not load the photo' }, req, 500); }
  }
  const skus = [...new Set((Array.isArray(body?.skus) ? body.skus.slice(0, MAX_SKUS) : []).map(normSku).filter((s: string) => SKU_KEY.test(s)))] as string[];
  if (skus.length === 0) return json({ ok: true, results: [] }, req);

  try {
    const known = await knownRows(skus);
    const results: { sku: string; status: string; version: number }[] = [];
    const todo: string[] = [];
    for (const sku of skus) {
      const k = known.get(sku);
      if (k && (k.status === 'ok' || Date.now() - Date.parse(k.checked_at) < RECHECK_MISSING_MS)) results.push({ sku, status: k.status, version: Number(k.version) || 0 });
      else todo.push(sku);
    }
    if (todo.length === 0) return json({ ok: true, results }, req);

    let token = '';
    try { token = await getDropboxToken(); } catch { return json({ ok: false, error: 'dropbox_not_connected', results }, req, 409); }
    const roots = await rootPaths(token);
    if (roots.length === 0) return json({ ok: false, error: 'No Dropbox search folders are configured or reachable', results }, req);
    // Three SKUs at a time: quick for a page of jobs, gentle on Dropbox.
    const errors: string[] = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < todo.length) {
        const sku = todo[cursor++];
        try { results.push(await makeThumb(token, roots, sku)); }
        catch (e) { errors.push(`${sku}: ${(e as Error).message}`); }
      }
    };
    await Promise.all(Array.from({ length: 3 }, () => worker()));
    return json({ ok: errors.length === 0, results, error: errors.length ? errors.slice(0, 3).join('; ') : undefined }, req);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || 'Could not load product photos' }, req, 500);
  }
});
