// Catalog Downloads ↔ odette-export. Session token when signed in, the
// seller-link share token otherwise (the edge fn accepts either). The
// catalog list is cached per token for a few minutes: the studio's pills
// remount the picker, and a remount must not be a server call.
import { call, explainGen } from '../dropboxlinks/api';

export type FolderStatus = 'active' | 'inactive' | 'unknown';
export interface CatalogFolder { name: string; path: string; files: number; bytes: number; sku: string | null; status: FolderStatus }
export interface CatalogCandidate { name: string; path: string; display: string }
export interface CatalogResult {
  folder: { name: string; path: string }; items: CatalogFolder[]; missing: string[];
  totals: { active: number; files: number; bytes: number }; loose: number; sheetCount: number; truncated: boolean;
}
/** One catalog on one sheet tab; `last` is its highest row — newest first. */
export interface Catalog { name: string; tab: string; count: number; active: number; last: number }

const LIST_TTL = 5 * 60_000;
const listCache = new Map<string, { at: number; list: Catalog[] }>();
const inflight = new Map<string, Promise<Catalog[]>>();

export async function catalogList(shareToken?: string, force = false): Promise<Catalog[]> {
  const key = shareToken || 'session';
  const hit = listCache.get(key);
  if (!force && hit && Date.now() - hit.at < LIST_TTL) return hit.list;
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    const { status, data } = await call({ action: 'catalog_list', ...(shareToken ? { shareToken } : {}) });
    if (!data?.ok) throw new Error(explainGen(data, status));
    const list = (data.catalogs || []) as Catalog[];
    listCache.set(key, { at: Date.now(), list });
    return list;
  })();
  inflight.set(key, p);
  try { return await p; } finally { inflight.delete(key); }
}

export async function catalogFolder(catalog: string, shareToken?: string, path?: string): Promise<{ result?: CatalogResult; candidates?: CatalogCandidate[]; error?: string }> {
  const { status, data } = await call({ action: 'catalog_folder', catalog, ...(shareToken ? { shareToken } : {}), ...(path ? { path } : {}) });
  if (data?.needsFolder && Array.isArray(data.candidates)) return { candidates: data.candidates as CatalogCandidate[] };
  if (!data?.ok) return { error: explainGen(data, status) };
  return { result: data as CatalogResult };
}

export interface PackResult { url?: string; pending?: boolean; jobId?: string; packPath?: string; count?: number; files?: number; bytes?: number; reused?: boolean; error?: string }

/** Build or reuse the pack inside Dropbox. `pending` means the copy is
 *  still running — call again with the jobId. */
export async function catalogPack(catalog: string, path: string, shareToken?: string, jobId?: string): Promise<PackResult> {
  const { status, data } = await call({ action: 'catalog_pack', catalog, path, ...(shareToken ? { shareToken } : {}), ...(jobId ? { jobId } : {}) });
  if (!data?.ok) return { error: explainGen(data, status) };
  return data as PackResult;
}

export const mb = (bytes: number) => bytes >= 1024 * 1024 * 100 ? `${Math.round(bytes / 1048576)} MB` : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
