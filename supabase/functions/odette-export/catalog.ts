// Catalog Downloads (RateCard Studio → Catalog downloads): vendor packs from
// Dropbox. `catalog_folder` finds the catalog's folder inside the configured
// search roots, lists its SKU sub-folders and marks each active / inactive
// from the master mirror (product_catalog.is_active); `catalog_pack` copies
// the ACTIVE folders inside Dropbox into "/DailyOffice Vendor Packs/<Catalog>
// (active)" and hands back that folder's download link. Dropbox does the
// copying and the zipping, so no photo byte ever passes through this
// function or the browser — no egress, no long invocations, no phone memory.
// A pack whose folders already match the active set is reused as is.
//
// Both actions accept a signed-in user OR a valid rate-card share token, so
// a vendor on the public seller link can download. The token path is
// rate-limited per IP because that page has no login.
// Shared helpers live in index.ts and are handed in as `deps` — this file
// never talks to Dropbox or Supabase on its own.
// deno-lint-ignore-file no-explicit-any

export interface Deps {
  dbx: (token: string, endpoint: string, body: unknown) => Promise<{ status: number; data: any }>;
  getDropboxToken: () => Promise<string>;
  resolveGenRootPaths: (token: string) => Promise<string[]>;
  callerRole: (req: Request) => Promise<string | null>;
  ratecardShareOk: (token: string) => Promise<boolean>;
  nameMatchesSku: (rawName: string, sku: string) => boolean;
  normSku: (v: unknown) => string;
  json: (body: unknown, req: Request, status?: number) => Response;
  fail: (status: number, error: string, req: Request, details?: string) => Response;
  corsHeaders: (req: Request) => Record<string, string>;
  ensureSharedLink: (token: string, path: string) => Promise<{ url?: string; error?: string; needsReconnect?: boolean; rateLimited?: boolean }>;
  sbUrl: string; sbSvc: string;
}

export interface FolderIn { name: string; path: string; files: number; bytes: number }
export interface SheetRow { sku: string; sku_norm: string; is_active: boolean }
export type FolderStatus = 'active' | 'inactive' | 'unknown';
export interface FolderOut extends FolderIn { sku: string | null; status: FolderStatus }

/** Pure: which SKU each Dropbox sub-folder is, and whether that design is
 *  active on the sheet. Exact name first; then the Link Generator's boundary
 *  rule (DRS141-S is DRS141, DRS1410 is not), longest SKU winning. A folder
 *  the sheet's catalog does not know is `unknown` and never downloaded. */
export function classifyFolders(folders: FolderIn[], sheet: SheetRow[], nameMatchesSku: Deps['nameMatchesSku'], normSku: Deps['normSku']) {
  const bySku = new Map<string, SheetRow>();
  for (const r of sheet) { const k = normSku(r.sku_norm || r.sku); if (k && !bySku.has(k)) bySku.set(k, r); }
  const matched = new Set<string>();
  const items: FolderOut[] = folders.map(f => {
    const n = normSku(f.name).replace(/\.ZIP$/i, '');
    let hit = bySku.get(n) || null;
    if (!hit) {
      let best: SheetRow | null = null;
      for (const [k, r] of bySku) if (n.length > k.length && nameMatchesSku(f.name, k) && (!best || k.length > normSku(best.sku_norm || best.sku).length)) best = r;
      hit = best;
    }
    if (!hit) return { ...f, sku: null, status: 'unknown' as const };
    matched.add(normSku(hit.sku_norm || hit.sku));
    return { ...f, sku: hit.sku, status: hit.is_active ? 'active' as const : 'inactive' as const };
  });
  const missing = [...bySku.values()].filter(r => !matched.has(normSku(r.sku_norm || r.sku))).map(r => r.sku);
  const act = items.filter(i => i.status === 'active');
  return { items, missing, totals: { active: act.length, files: act.reduce((t, i) => t + i.files, 0), bytes: act.reduce((t, i) => t + i.bytes, 0) } };
}

const normName = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const safeFile = (s: string) => String(s || 'catalog').replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'catalog';

// Per-IP, per-minute limiter. In-memory per isolate (so the true cap is
// cap × warm isolates — still a ceiling where there was none). Signed-in
// callers get three times the share-token cap: staff must never be locked
// out by their own use, but a script driving Dropbox from a session must
// still hit a wall. The map is swept once it grows past 5000 keys.
const hits = new Map<string, { n: number; at: number }>();
const limited = (req: Request, key: string, max: number): boolean => {
  const ip = (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'ip').split(',')[0].trim();
  const k = `${key}:${ip}`; const now = Date.now();
  if (hits.size > 5000) for (const [hk, hv] of hits) if (now - hv.at > 60_000) hits.delete(hk);
  const h = hits.get(k);
  if (!h || now - h.at > 60_000) { hits.set(k, { n: 1, at: now }); return false; }
  h.n += 1;
  return h.n > max;
};

// A share token's validity is cached a minute: every seller click used to
// cost a PostgREST round trip just to re-learn the same yes.
const tokenOk = new Map<string, { ok: boolean; at: number }>();
async function shareOk(d: Deps, tok: string): Promise<boolean> {
  if (!/^[a-f0-9]{32}$/.test(tok)) return false;
  const hit = tokenOk.get(tok);
  if (hit && Date.now() - hit.at < 60_000) return hit.ok;
  const ok = await d.ratecardShareOk(tok);
  tokenOk.set(tok, { ok, at: Date.now() });
  return ok;
}

/** Auth + rate limit for the rate-card Dropbox actions: a signed-in user
 *  (3× cap) or a valid share token (cap). Null means "go ahead". */
export async function gate(body: any, req: Request, d: Deps, key: string, max: number): Promise<Response | null> {
  if (await d.callerRole(req)) return limited(req, key + ':s', max * 3) ? d.fail(429, 'Too many requests - wait a minute and try again', req) : null;
  const tok = String(body?.shareToken || '').trim();
  if (!tok || !(await shareOk(d, tok))) return d.fail(401, 'Sign in to DailyOffice first, or open this from the seller link', req);
  if (limited(req, key, max)) return d.fail(429, 'Too many requests - wait a minute and try again', req);
  return null;
}
const authed = gate;

// Small in-isolate caches for things that change on the sheet's or the
// Dropbox folder's timescale, not per click: the catalog list (5 min) and
// a catalog folder's listing (3 min).
const LIST_TTL = 5 * 60_000; const FOLDER_TTL = 3 * 60_000;
let listCache: { at: number; catalogs: unknown[] } | null = null;
const folderCache = new Map<string, { at: number; v: { sub: Map<string, FolderIn>; loose: number; truncated: boolean } }>();

const inside = (path: string, roots: string[]) => roots.some(rp => path === rp || path.startsWith(rp + '/'));

// Bucket names on the sheet that are not catalogs (same list as listing-ai's
// ratecard_catalogs, which feeds the From-Master dropdown).
const NON_CATALOG = new Set(['singles', 'single', 'noncatalog', 'nocatalog', 'na', 'none']);

/** Catalogs from the master mirror with brand (sheet tab), design and
 *  active counts, and the catalog's last row on the sheet — the dropdown
 *  groups by brand and shows the newest (highest row) first. */
export async function catalogList(body: any, req: Request, d: Deps): Promise<Response> {
  const denied = await authed(body, req, d, 'cl', 20); if (denied) return denied;
  if (listCache && Date.now() - listCache.at < LIST_TTL) return d.json({ ok: true, catalogs: listCache.catalogs, cached: true }, req);
  const h = { apikey: d.sbSvc, authorization: `Bearer ${d.sbSvc}` };
  const [pr, mr] = await Promise.all([
    fetch(`${d.sbUrl}/rest/v1/product_catalog?select=catalog,is_active,tab&catalog=not.is.null&limit=20000`, { headers: h }),
    fetch(`${d.sbUrl}/rest/v1/master_sheet_rows?select=tab,catalog,row_num&catalog=not.is.null&limit=50000`, { headers: h }),
  ]);
  if (!pr.ok || !mr.ok) return d.fail(502, 'Could not read the master mirror', req);
  const rows: { catalog: string | null; is_active: boolean; tab: string | null }[] = await pr.json().catch(() => []);
  const order: { tab: string | null; catalog: string | null; row_num: number }[] = await mr.json().catch(() => []);
  const counts = new Map<string, { name: string; tab: string; count: number; active: number; last: number }>();
  const keyOf = (tab: string, name: string) => `${tab} ${name}`;
  for (const r of rows) {
    const name = String(r.catalog || '').trim(); const tab = String(r.tab || '').trim().toUpperCase();
    if (!name || NON_CATALOG.has(normName(name))) continue;
    const c = counts.get(keyOf(tab, name)) || { name, tab, count: 0, active: 0, last: 0 };
    c.count += 1; if (r.is_active) c.active += 1;
    counts.set(keyOf(tab, name), c);
  }
  for (const o of order) {
    const c = counts.get(keyOf(String(o.tab || '').trim().toUpperCase(), String(o.catalog || '').trim()));
    if (c) c.last = Math.max(c.last, Number(o.row_num) || 0);
  }
  const catalogs = [...counts.values()].sort((a, b) => a.tab.localeCompare(b.tab) || b.last - a.last || a.name.localeCompare(b.name));
  listCache = { at: Date.now(), catalogs };
  return d.json({ ok: true, catalogs }, req);
}

/** One recursive listing of a folder: its direct sub-folders with file
 *  count and bytes, the loose files at its top level, and whether paging
 *  stopped early (20 pages of 2000). */
async function listSubfolders(d: Deps, token: string, path: string, cacheable = false): Promise<{ sub: Map<string, FolderIn>; loose: number; truncated: boolean; error?: string }> {
  const hit = cacheable ? folderCache.get(path) : undefined;
  if (hit && Date.now() - hit.at < FOLDER_TTL) return hit.v;
  const sub = new Map<string, FolderIn>();
  let loose = 0; let truncated = false;
  let ls = await d.dbx(token, 'files/list_folder', { path, recursive: true, limit: 2000 });
  for (let page = 0; ; page++) {
    if (ls.status >= 400) return { sub, loose, truncated, error: JSON.stringify(ls.data).slice(0, 200) };
    for (const e of (ls.data.entries || [])) {
      const pl = String(e.path_lower || '');
      if (!pl.startsWith(path + '/')) continue;
      const rel = pl.slice(path.length + 1);
      const top = rel.split('/')[0];
      if (e['.tag'] === 'folder') { if (!rel.includes('/')) sub.set(top, { name: String(e.name), path: pl, files: 0, bytes: 0 }); continue; }
      if (e['.tag'] !== 'file') continue;
      if (!rel.includes('/')) { loose += 1; continue; }
      const s = sub.get(top); if (s) { s.files += 1; s.bytes += Number(e.size || 0); }
    }
    if (!ls.data.has_more) break;
    if (page >= 20) { truncated = true; break; }
    ls = await d.dbx(token, 'files/list_folder/continue', { cursor: ls.data.cursor });
  }
  if (cacheable) { if (folderCache.size > 200) folderCache.clear(); folderCache.set(path, { at: Date.now(), v: { sub, loose, truncated } }); }
  return { sub, loose, truncated };
}

export async function catalogFolder(body: any, req: Request, d: Deps): Promise<Response> {
  const denied = await authed(body, req, d, 'cf', 20); if (denied) return denied;
  const catalog = String(body?.catalog || '').trim().slice(0, 120);
  const picked = String(body?.path || '').trim().toLowerCase();
  if (!catalog) return d.fail(400, 'Pick a catalog first', req);
  let token = '';
  try { token = await d.getDropboxToken(); } catch { return d.json({ ok: false, error: 'dropbox_not_connected' }, req, 409); }
  const roots = await d.resolveGenRootPaths(token);
  if (roots.length === 0) return d.json({ ok: false, error: 'No search folders are configured or reachable' }, req);

  let folder: { name: string; path: string } | null = null;
  if (picked) {
    if (!inside(picked, roots)) return d.fail(403, 'That folder is outside the configured search folders', req);
    const meta = await d.dbx(token, 'files/get_metadata', { path: picked });
    if (meta.status >= 400 || meta.data?.['.tag'] !== 'folder') return d.fail(404, 'That folder no longer exists in Dropbox', req);
    folder = { name: String(meta.data.name), path: String(meta.data.path_lower) };
  } else {
    // Direct path first (the search index lags behind new folders), then search.
    const direct = await Promise.all(roots.map(rp => d.dbx(token, 'files/get_metadata', { path: `${rp}/${catalog}` })));
    let found: any[] = direct.filter(m => m.status < 300 && m.data?.['.tag'] === 'folder').map(m => m.data);
    if (found.length === 0) {
      const searches = await Promise.all(roots.map(rp => d.dbx(token, 'files/search_v2', { query: catalog, options: { path: rp, max_results: 25, filename_only: true } })));
      if (searches.some(s => s.status === 429)) return d.json({ ok: false, error: 'Rate limited — try again in a minute' }, req);
      for (const s of searches) for (const m of (s.data?.matches || [])) {
        const md = m.metadata?.metadata;
        if (md && md['.tag'] === 'folder' && normName(md.name) === normName(catalog)) found.push(md);
      }
    }
    const seen = new Set<string>();
    found = found.filter(f => { const k = f.path_lower; if (seen.has(k)) return false; seen.add(k); return true; });
    if (found.length === 0) return d.json({ ok: false, error: `No folder named "${catalog}" inside the configured search folders — check the folder name in Dropbox, or add its parent folder in Settings` }, req);
    if (found.length > 1) return d.json({ ok: false, needsFolder: true, candidates: found.map(f => ({ name: String(f.name), path: String(f.path_lower), display: String(f.path_display || f.path_lower) })) }, req);
    folder = { name: String(found[0].name), path: String(found[0].path_lower) };
  }

  const { sub, loose, truncated, error } = await listSubfolders(d, token, folder.path, true);
  if (error) return d.fail(502, 'Could not list that catalog folder in Dropbox', req, error);

  const sr = await fetch(`${d.sbUrl}/rest/v1/product_catalog?catalog=eq.${encodeURIComponent(catalog)}&select=sku,sku_norm,is_active&limit=2000`, { headers: { apikey: d.sbSvc, authorization: `Bearer ${d.sbSvc}` } });
  const sheet: SheetRow[] = sr.ok ? await sr.json().catch(() => []) : [];
  if (!sr.ok) return d.fail(502, 'Could not read the master mirror for that catalog', req);
  const folders = [...sub.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const out = classifyFolders(folders, sheet, d.nameMatchesSku, d.normSku);
  // A book that is not on the master sheet (owner's ask): nothing to filter
  // by, so every folder counts and the pack takes them all.
  if (sheet.length === 0) out.totals = { active: out.items.length, files: out.items.reduce((t, i) => t + i.files, 0), bytes: out.items.reduce((t, i) => t + i.bytes, 0) };
  return d.json({ ok: true, folder, ...out, loose, sheetCount: sheet.length, truncated }, req);
}

// Packs live here, and ONLY here: the delete below refuses any other path.
export const PACK_ROOT = '/DailyOffice Vendor Packs';
const packName = (catalog: string, all = false) => `${safeFile(catalog)} (${all ? 'all' : 'active'})`;

/** Pure: does an existing pack already hold exactly the active folders
 *  (same names, same file counts, same bytes)? Then it is reused unchanged. */
export function samePack(active: FolderIn[], pack: Map<string, FolderIn>): boolean {
  if (pack.size !== active.length) return false;
  for (const a of active) {
    const p = pack.get(a.name.toLowerCase());
    if (!p || p.files !== a.files || p.bytes !== a.bytes) return false;
  }
  return true;
}

const dlLink = (url: string) => /[?&]dl=0/.test(url) ? url.replace(/([?&])dl=0/, '$1dl=1') : url + (url.includes('?') ? '&' : '?') + 'dl=1';

async function packLink(token: string, packPath: string, req: Request, d: Deps, extra: Record<string, unknown>): Promise<Response> {
  const mk = await d.ensureSharedLink(token, packPath);
  if (!mk.url) return d.json({ ok: false, error: mk.error || 'Could not create the download link', needsReconnect: mk.needsReconnect || undefined }, req);
  return d.json({ ok: true, url: dlLink(mk.url), packPath, ...extra }, req);
}

/** Build (or reuse) the vendor pack for a catalog folder and return its
 *  download link. Long copies come back `pending` with a job id the client
 *  polls with; every step stays inside Dropbox. */
export async function catalogPack(body: any, req: Request, d: Deps): Promise<Response> {
  const denied = await authed(body, req, d, 'cp', 10); if (denied) return denied;
  const catalog = String(body?.catalog || '').trim().slice(0, 120);
  const path = String(body?.path || '').trim().toLowerCase();
  const jobId = String(body?.jobId || '').trim();
  let packPath = `${PACK_ROOT}/${packName(catalog)}`;
  if (!catalog || !path.startsWith('/')) return d.fail(400, 'Pick a catalog first', req);
  let token = '';
  try { token = await d.getDropboxToken(); } catch { return d.json({ ok: false, error: 'dropbox_not_connected' }, req, 409); }

  // Polling a copy that was still running (the pack path travels with it).
  if (jobId) {
    const given = String(body?.packPath || '').trim();
    if (given.toLowerCase().startsWith(PACK_ROOT.toLowerCase() + '/')) packPath = given;
    const ck = await d.dbx(token, 'files/copy_batch/check_v2', { async_job_id: jobId });
    if (ck.status >= 400) return d.fail(502, 'Dropbox lost track of the copy — try again', req, JSON.stringify(ck.data).slice(0, 200));
    const tag = ck.data?.['.tag'];
    if (tag === 'in_progress') return d.json({ ok: true, pending: true, jobId, packPath }, req);
    if (tag !== 'complete') return d.fail(502, 'Dropbox could not copy the folders', req, JSON.stringify(ck.data).slice(0, 200));
    return packLink(token, packPath, req, d, {});
  }

  const roots = await d.resolveGenRootPaths(token);
  if (!inside(path, roots)) return d.fail(403, 'That folder is outside the configured search folders', req);
  const meta = await d.dbx(token, 'files/get_metadata', { path });
  if (meta.status >= 400 || meta.data?.['.tag'] !== 'folder') return d.fail(404, 'That folder no longer exists in Dropbox', req);
  const listed = await listSubfolders(d, token, path, true);
  if (listed.error) return d.fail(502, 'Could not list that catalog folder in Dropbox', req, listed.error);
  const sr = await fetch(`${d.sbUrl}/rest/v1/product_catalog?catalog=eq.${encodeURIComponent(catalog)}&select=sku,sku_norm,is_active&limit=2000`, { headers: { apikey: d.sbSvc, authorization: `Bearer ${d.sbSvc}` } });
  if (!sr.ok) return d.fail(502, 'Could not read the master mirror for that catalog', req);
  const sheet: SheetRow[] = await sr.json().catch(() => []);
  const out = classifyFolders([...listed.sub.values()], sheet, d.nameMatchesSku, d.normSku);
  // Not on the master sheet → every folder; on the sheet → active only.
  const active = sheet.length === 0 ? out.items : out.items.filter(i => i.status === 'active');
  if (active.length === 0) return d.json({ ok: false, error: 'No active design in this catalog folder' }, req);
  const extra = { count: active.length, files: active.reduce((t, i) => t + i.files, 0), bytes: active.reduce((t, i) => t + i.bytes, 0) };
  if (sheet.length === 0) packPath = `${PACK_ROOT}/${packName(catalog, true)}`;

  // Reuse a pack that already matches; otherwise rebuild it from scratch.
  const existing = await d.dbx(token, 'files/get_metadata', { path: packPath });
  if (existing.status < 300 && existing.data?.['.tag'] === 'folder') {
    const have = await listSubfolders(d, token, String(existing.data.path_lower));
    if (!have.error && !have.truncated && samePack(active, have.sub)) return packLink(token, String(existing.data.path_lower), req, d, { ...extra, reused: true });
    if (!String(existing.data.path_lower).startsWith(PACK_ROOT.toLowerCase() + '/')) return d.fail(500, 'Refusing to replace a folder outside the packs folder', req);
    const del = await d.dbx(token, 'files/delete_v2', { path: String(existing.data.path_lower) });
    if (del.status >= 400) return d.fail(502, 'Could not replace the old pack in Dropbox', req, JSON.stringify(del.data).slice(0, 200));
  }
  const mk = await d.dbx(token, 'files/create_folder_v2', { path: packPath, autorename: false });
  if (mk.status >= 400) return d.fail(502, 'Could not create the pack folder in Dropbox', req, JSON.stringify(mk.data).slice(0, 200));
  const cp = await d.dbx(token, 'files/copy_batch_v2', { entries: active.map(a => ({ from_path: a.path, to_path: `${packPath}/${a.name}` })), autorename: false });
  if (cp.status >= 400) return d.fail(502, 'Dropbox refused to copy the folders', req, JSON.stringify(cp.data).slice(0, 200));
  if (cp.data?.['.tag'] === 'complete') return packLink(token, packPath, req, d, extra);
  const id = String(cp.data?.async_job_id || '');
  if (!id) return d.fail(502, 'Dropbox gave no copy job id', req, JSON.stringify(cp.data).slice(0, 200));
  // Copies inside Dropbox usually finish in seconds — wait a little here
  // before handing the poll to the client.
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const ck = await d.dbx(token, 'files/copy_batch/check_v2', { async_job_id: id });
    if (ck.data?.['.tag'] === 'complete') return packLink(token, packPath, req, d, extra);
    if (ck.data?.['.tag'] !== 'in_progress') return d.fail(502, 'Dropbox could not copy the folders', req, JSON.stringify(ck.data).slice(0, 200));
  }
  return d.json({ ok: true, pending: true, jobId: id, packPath, ...extra }, req);
}
