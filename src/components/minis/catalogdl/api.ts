// Catalog Downloads ↔ odette-export. Session token when signed in, the
// seller-link share token otherwise (the edge fn accepts either).
import { supabase, SUPABASE_ANON_KEY } from '../../../lib/supabase';
import { FN, call, explainGen } from '../dropboxlinks/api';

export type FolderStatus = 'active' | 'inactive' | 'unknown';
export interface CatalogFolder { name: string; path: string; files: number; bytes: number; sku: string | null; status: FolderStatus }
export interface CatalogCandidate { name: string; path: string; display: string }
export interface CatalogResult {
  folder: { name: string; path: string }; items: CatalogFolder[]; missing: string[];
  totals: { active: number; files: number; bytes: number }; loose: number; sheetCount: number; truncated: boolean;
}

export async function catalogList(shareToken?: string): Promise<{ name: string; count: number; active: number }[]> {
  const { status, data } = await call({ action: 'catalog_list', ...(shareToken ? { shareToken } : {}) });
  if (!data?.ok) throw new Error(explainGen(data, status));
  return (data.catalogs || []) as { name: string; count: number; active: number }[];
}

export async function catalogFolder(catalog: string, shareToken?: string, path?: string): Promise<{ result?: CatalogResult; candidates?: CatalogCandidate[]; error?: string }> {
  const { status, data } = await call({ action: 'catalog_folder', catalog, ...(shareToken ? { shareToken } : {}), ...(path ? { path } : {}) });
  if (data?.needsFolder && Array.isArray(data.candidates)) return { candidates: data.candidates as CatalogCandidate[] };
  if (!data?.ok) return { error: explainGen(data, status) };
  return { result: data as CatalogResult };
}

/** One SKU folder as a zip, streamed from Dropbox through the edge fn.
 *  Bytes are collected here so the caller can report progress. */
export async function fetchFolderZip(path: string, shareToken: string | undefined, signal: AbortSignal, onBytes: (n: number) => void): Promise<Uint8Array> {
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token || SUPABASE_ANON_KEY;
  const r = await fetch(FN, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ action: 'catalog_zip', path, ...(shareToken ? { shareToken } : {}) }),
  });
  if (!r.ok || !r.body) { const data = await r.json().catch(() => ({})); throw new Error(explainGen(data, r.status)); }
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) { chunks.push(value); total += value.length; onBytes(value.length); }
  }
  const out = new Uint8Array(total); let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}
