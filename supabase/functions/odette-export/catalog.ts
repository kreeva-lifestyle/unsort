// Catalog Downloads (RateCard Studio → Catalog downloads): vendor packs from
// Dropbox. `catalog_folder` finds the catalog's folder inside the configured
// search roots, lists its SKU sub-folders and marks each active / inactive
// from the master mirror (product_catalog.is_active); `catalog_zip` streams
// one SKU folder as a zip (Dropbox builds it, we only pipe). The browser
// assembles the active folders into one pack — nothing is buffered here.
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
  asciiArg: (o: unknown) => string;
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

// Per-IP limiter for the no-login (share token) path. In-memory per isolate,
// which is plenty: one vendor building one pack makes one folder call and
// one zip call per active SKU.
const hits = new Map<string, { n: number; at: number }>();
const limited = (req: Request, key: string, max: number): boolean => {
  const ip = (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'ip').split(',')[0].trim();
  const k = `${key}:${ip}`; const now = Date.now();
  const h = hits.get(k);
  if (!h || now - h.at > 60_000) { hits.set(k, { n: 1, at: now }); return false; }
  h.n += 1;
  return h.n > max;
};

async function authed(body: any, req: Request, d: Deps, key: string, max: number): Promise<Response | null> {
  if (await d.callerRole(req)) return null;
  const tok = String(body?.shareToken || '').trim();
  if (!tok || !(await d.ratecardShareOk(tok))) return d.fail(401, 'Sign in to DailyOffice first, or open this from the seller link', req);
  if (limited(req, key, max)) return d.fail(429, 'Too many requests - wait a minute and try again', req);
  return null;
}

const inside = (path: string, roots: string[]) => roots.some(rp => path === rp || path.startsWith(rp + '/'));

// Bucket names on the sheet that are not catalogs (same list as listing-ai's
// ratecard_catalogs, which feeds the From-Master dropdown).
const NON_CATALOG = new Set(['singles', 'single', 'noncatalog', 'nocatalog', 'na', 'none']);

/** Catalogs from the master mirror with how many designs are active — the
 *  Catalog Downloads dropdown hides the ones with none. */
export async function catalogList(body: any, req: Request, d: Deps): Promise<Response> {
  const denied = await authed(body, req, d, 'cl', 20); if (denied) return denied;
  const sr = await fetch(`${d.sbUrl}/rest/v1/product_catalog?select=catalog,is_active&catalog=not.is.null&limit=20000`, { headers: { apikey: d.sbSvc, authorization: `Bearer ${d.sbSvc}` } });
  if (!sr.ok) return d.fail(502, 'Could not read the master mirror', req);
  const rows: { catalog: string | null; is_active: boolean }[] = await sr.json().catch(() => []);
  const counts = new Map<string, { count: number; active: number }>();
  for (const r of rows) {
    const name = String(r.catalog || '').trim();
    if (!name || NON_CATALOG.has(normName(name))) continue;
    const c = counts.get(name) || { count: 0, active: 0 };
    c.count += 1; if (r.is_active) c.active += 1;
    counts.set(name, c);
  }
  const catalogs = [...counts.entries()].map(([name, c]) => ({ name, ...c })).sort((a, b) => a.name.localeCompare(b.name));
  return d.json({ ok: true, catalogs }, req);
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

  // One recursive listing: every SKU sub-folder with its file count and size.
  const sub = new Map<string, FolderIn>();
  let loose = 0; let truncated = false;
  let ls = await d.dbx(token, 'files/list_folder', { path: folder.path, recursive: true, limit: 2000 });
  for (let page = 0; ; page++) {
    if (ls.status >= 400) return d.fail(502, 'Could not list that catalog folder in Dropbox', req, JSON.stringify(ls.data).slice(0, 200));
    for (const e of (ls.data.entries || [])) {
      const pl = String(e.path_lower || '');
      if (!pl.startsWith(folder.path + '/')) continue;
      const rel = pl.slice(folder.path.length + 1);
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

  const sr = await fetch(`${d.sbUrl}/rest/v1/product_catalog?catalog=eq.${encodeURIComponent(catalog)}&select=sku,sku_norm,is_active&limit=2000`, { headers: { apikey: d.sbSvc, authorization: `Bearer ${d.sbSvc}` } });
  const sheet: SheetRow[] = sr.ok ? await sr.json().catch(() => []) : [];
  if (!sr.ok) return d.fail(502, 'Could not read the master mirror for that catalog', req);
  const folders = [...sub.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const out = classifyFolders(folders, sheet, d.nameMatchesSku, d.normSku);
  return d.json({ ok: true, folder, ...out, loose, sheetCount: sheet.length, truncated }, req);
}

export async function catalogZip(body: any, req: Request, d: Deps): Promise<Response> {
  const denied = await authed(body, req, d, 'cz', 120); if (denied) return denied;
  const path = String(body?.path || '').trim().toLowerCase();
  if (!path.startsWith('/')) return d.fail(400, 'Bad folder path', req);
  let token = '';
  try { token = await d.getDropboxToken(); } catch { return d.json({ ok: false, error: 'dropbox_not_connected' }, req, 409); }
  const roots = await d.resolveGenRootPaths(token);
  if (!inside(path, roots)) return d.fail(403, 'That folder is outside the configured search folders', req);
  const meta = await d.dbx(token, 'files/get_metadata', { path });
  if (meta.status >= 400 || meta.data?.['.tag'] !== 'folder') return d.fail(404, 'That folder no longer exists in Dropbox', req);
  const r = await fetch('https://content.dropboxapi.com/2/files/download_zip', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'Dropbox-API-Arg': d.asciiArg({ path }) },
  });
  if (!r.ok || !r.body) {
    const t = await r.text().catch(() => '');
    return d.fail(502, r.status === 429 ? 'Rate limited — try again in a minute' : `Dropbox could not zip ${meta.data.name} (${r.status})`, req, t.slice(0, 200));
  }
  return new Response(r.body, { status: 200, headers: { ...d.corsHeaders(req), 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${safeFile(String(meta.data.name))}.zip"`, 'cache-control': 'no-store' } });
}
