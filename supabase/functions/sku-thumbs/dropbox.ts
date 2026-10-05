// Dropbox side of sku-thumbs: the SKU's photo folder (a filename search of
// the configured Link Generator roots, exact folder name first — the same
// rule as product-detail/dropbox.ts and odette-export's photo actions) and a
// small JPEG thumbnail of its first photo. Same vault keys and endpoints as
// those functions, so one Dropbox connection serves every tool.
const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const svcHeaders = { apikey: SB_SVC, authorization: `Bearer ${SB_SVC}` };

export async function getSecret(key: string): Promise<string | null> {
  const r = await fetch(`${SB_URL}/rest/v1/app_secrets?key=eq.${encodeURIComponent(key)}&select=value`, { headers: svcHeaders });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return rows?.[0]?.value ?? null;
}

// Dropbox requires the Dropbox-API-Arg header to be ASCII.
const asciiArg = (o: unknown) => JSON.stringify(o).replace(/[^\x00-\x7e]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

let dbxCache: { token: string; expiresAt: number; rt: string } | null = null;
export async function getDropboxToken(): Promise<string> {
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

// One Retry-After-aware retry on 429, capped at 3s (same as odette-export).
export async function dbx(token: string, endpoint: string, body: unknown): Promise<{ status: number; data: any }> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
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

export const normSku = (v: unknown) => String(v ?? '').trim().toUpperCase();
const nameMatchesSku = (rawName: string, sku: string) => {
  const name = normSku(rawName).replace(/\.ZIP$/i, '');
  return !!name && (name === sku || (name.startsWith(sku) && !/[A-Z0-9]/.test(name.charAt(sku.length))));
};
const isImage = (n: string) => /\.(jpe?g|png|webp|gif|bmp)$/i.test(n);

// The configured search roots as Dropbox paths, kept 10 minutes per instance.
let rootsCache: { at: number; paths: string[] } | null = null;
export async function rootPaths(token: string): Promise<string[]> {
  if (rootsCache && Date.now() - rootsCache.at < 10 * 60_000) return rootsCache.paths;
  let roots: { url: string; enabled?: boolean }[] = [];
  try { roots = JSON.parse((await getSecret('dropbox_linkgen_roots')) || '[]'); } catch { roots = []; }
  const paths: string[] = [];
  for (const r of roots.filter(r => r.enabled !== false && r.url)) {
    const meta = await dbx(token, 'sharing/get_shared_link_metadata', { url: r.url });
    if (meta.status < 300 && meta.data?.path_lower) paths.push(meta.data.path_lower);
  }
  if (paths.length) rootsCache = { at: Date.now(), paths };
  return paths;
}

/** The SKU's first photo (natural file-name order, so 1.jpg before 10.jpg)
 *  across its matching folders, or null when there is none. */
export async function firstPhoto(token: string, roots: string[], sku: string): Promise<string | null> {
  const searches = await Promise.all(roots.map(rp => dbx(token, 'files/search_v2', { query: sku, options: { path: rp, max_results: 25, filename_only: true } })));
  const found: any[] = [];
  for (const sr of searches) { if (sr.status >= 400) continue; for (const m of (sr.data.matches || [])) { const md = m.metadata?.metadata; if (md && md['.tag'] === 'folder') found.push(md); } }
  const seen = new Set<string>();
  const uniq = found.filter(f => { if (seen.has(f.path_lower)) return false; seen.add(f.path_lower); return true; });
  const exact = uniq.filter(f => normSku(f.name) === sku);
  const cands = exact.length ? exact : uniq.filter(f => nameMatchesSku(f.name, sku));
  for (const f of cands.slice(0, 3)) {
    const ls = await dbx(token, 'files/list_folder', { path: f.path_lower, limit: 200 });
    if (ls.status >= 400) continue;
    const files = (ls.data.entries || []).filter((e: any) => e['.tag'] === 'file' && isImage(e.name))
      .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
    if (files.length) return String(files[0].path_lower);
  }
  return null;
}

/** A 256px JPEG thumbnail of one Dropbox file (Dropbox renders it). */
export async function thumbnail(token: string, path: string): Promise<Uint8Array> {
  const r = await fetch('https://content.dropboxapi.com/2/files/get_thumbnail_v2', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'Dropbox-API-Arg': asciiArg({ resource: { '.tag': 'path', path }, format: 'jpeg', size: 'w256h256', mode: 'bestfit' }) },
  });
  if (!r.ok) { try { await r.body?.cancel(); } catch { /* noop */ } throw new Error(`thumbnail ${r.status}`); }
  return new Uint8Array(await r.arrayBuffer());
}
