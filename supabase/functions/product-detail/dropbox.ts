// Dropbox side of the Product Detail Generator: the design's photo folder
// (the master sheet's IMAGE link first, else a search of the configured
// Link Generator roots), a VIEW-ONLY shared link for it, and a few
// thumbnails for the model to look at. Same vault keys and endpoints as
// odette-export, so one Dropbox connection serves every tool.
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

/** The folder's shared link — existing one first, else a new VIEW-ONLY
 *  link (audience public, access viewer): anyone with it can look and
 *  download, nobody can change the photos. */
export async function ensureSharedLink(token: string, path: string): Promise<{ url?: string; error?: string }> {
  const ll = await dbx(token, 'sharing/list_shared_links', { path, direct_only: true });
  if (ll.status === 429) return { error: 'Dropbox rate limit — try again in a minute' };
  if (ll.status < 300) { const url = ll.data?.links?.[0]?.url || ''; if (url) return { url }; }
  let cl = await dbx(token, 'sharing/create_shared_link_with_settings', { path, settings: { audience: 'public', access: 'viewer', allow_download: true } });
  if (cl.status === 409 && String(cl.data?.error_summary || '').includes('shared_link_already_exists')) {
    const url = cl.data?.error?.shared_link_already_exists?.metadata?.url || ''; if (url) return { url };
  } else if (cl.status === 409 && String(cl.data?.error_summary || '').includes('settings_error')) {
    cl = await dbx(token, 'sharing/create_shared_link_with_settings', { path }); if (cl.data?.url) return { url: cl.data.url };
  } else if (cl.status === 401 || String(cl.data?.error_summary || '').includes('missing_scope')) {
    return { error: 'Dropbox needs the sharing.write permission — reconnect it in Trackly → Image Link Check' };
  } else if (cl.status < 300 && cl.data?.url) return { url: cl.data.url };
  return { error: `Could not create the share link (${cl.status})` };
}

export const normSku = (v: unknown) => String(v ?? '').trim().toUpperCase();
const nameMatchesSku = (rawName: string, sku: string) => {
  const name = normSku(rawName).replace(/\.ZIP$/i, '');
  return !!name && (name === sku || (name.startsWith(sku) && !/[A-Z0-9]/.test(name.charAt(sku.length))));
};
const isImage = (n: string) => /\.(jpe?g|png|webp|gif|bmp)$/i.test(n);

export interface Folder { path_lower: string; path_display: string; name: string }

/** The design's folder: the sheet's IMAGE link when it is a Dropbox folder
 *  link, else a filename search of the configured roots (exact name first). */
export async function findFolder(token: string, code: string, imageLink: string): Promise<{ folder: Folder | null; url?: string; note?: string }> {
  if (/^https:\/\/(www\.)?dropbox\.com\//i.test(imageLink)) {
    const meta = await dbx(token, 'sharing/get_shared_link_metadata', { url: imageLink });
    if (meta.status < 300 && meta.data?.['.tag'] === 'folder' && meta.data.path_lower) {
      return { folder: { path_lower: meta.data.path_lower, path_display: meta.data.path_display || meta.data.path_lower, name: meta.data.name || code }, url: imageLink };
    }
  }
  let roots: { url: string; enabled?: boolean }[] = [];
  try { roots = JSON.parse((await getSecret('dropbox_linkgen_roots')) || '[]'); } catch { roots = []; }
  const rootPaths: string[] = [];
  for (const r of roots.filter(r => r.enabled !== false && r.url)) {
    const meta = await dbx(token, 'sharing/get_shared_link_metadata', { url: r.url });
    if (meta.status < 300 && meta.data?.path_lower) rootPaths.push(meta.data.path_lower);
  }
  if (rootPaths.length === 0) return { folder: null, note: 'No Dropbox search folders are configured (Trackly → Image Link Check → Settings)' };
  const searches = await Promise.all(rootPaths.map(rp => dbx(token, 'files/search_v2', { query: code, options: { path: rp, max_results: 25, filename_only: true } })));
  const found: any[] = [];
  for (const sr of searches) { if (sr.status >= 400) continue; for (const m of (sr.data.matches || [])) { const md = m.metadata?.metadata; if (md && md['.tag'] === 'folder') found.push(md); } }
  const seen = new Set<string>();
  const uniq = found.filter(f => { if (seen.has(f.path_lower)) return false; seen.add(f.path_lower); return true; });
  const exact = uniq.filter(f => normSku(f.name) === code);
  const cands = exact.length ? exact : uniq.filter(f => nameMatchesSku(f.name, code));
  if (cands.length === 0) return { folder: null, note: `No Dropbox folder named "${code}" in the configured search folders` };
  const f = cands[0];
  return { folder: { path_lower: f.path_lower, path_display: f.path_display, name: f.name }, note: cands.length > 1 ? `"${code}" exists in ${cands.length} folders — photos taken from ${f.path_display}` : undefined };
}

/** Up to `max` JPEG thumbnails (1024px) of the folder's images, in filename
 *  order — enough for colour, motif and trims; small enough to send. */
export async function folderThumbs(token: string, folder: Folder, max: number): Promise<{ name: string; b64: string }[]> {
  const ls = await dbx(token, 'files/list_folder', { path: folder.path_lower, limit: 200 });
  if (ls.status >= 400) return [];
  const files = (ls.data.entries || []).filter((e: any) => e['.tag'] === 'file' && isImage(e.name))
    .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true })).slice(0, max);
  const out: { name: string; b64: string }[] = [];
  for (const f of files) {
    const r = await fetch('https://content.dropboxapi.com/2/files/get_thumbnail_v2', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'Dropbox-API-Arg': asciiArg({ resource: { '.tag': 'path', path: f.path_lower }, format: 'jpeg', size: 'w1024h768', mode: 'bestfit' }) },
    });
    if (!r.ok) { try { await r.body?.cancel(); } catch { /* noop */ } continue; }
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    out.push({ name: String(f.name), b64: btoa(bin) });
  }
  return out;
}
