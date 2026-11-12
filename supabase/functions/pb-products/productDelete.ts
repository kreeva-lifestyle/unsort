// Delete a product for good (owner, 2026-11-12: "More actions should also
// have a delete option … remove it from our database completely").
// Admin / manager only (index.ts). What goes:
//   * the product row, and with it — the database does this in the same
//     statement — its photos' rows, listings (and what hangs on a listing),
//     chosen tags, timeline, "already added?" answers and photo prints;
//   * the photo and video files in the playbook-products bucket.
// What stays: one line in pb_activity saying who deleted what (name, code,
// where it came from) — without it a product could vanish with no trace.
// Refused, in plain words, while deleting would leave something half-done:
//   * a listing that is on Shopify and not taken off the site (Playbook
//     would forget the Shopify product and could never unlist it; a later
//     import would list it twice) → "Remove from site" first;
//   * the AI is reading it, or a listing is being written / sent right now.
// Shopify is never touched here. The row goes first, the files second: a
// failed file removal leaves files nothing points to (reported, harmless),
// never a product whose photos are gone.
import { SB_URL, ago, enc, logActivity, one, remove, sel, svcHeaders } from './db.ts';
import { HttpError, fetchT, plain } from './http.ts';
import { BUCKET, STALE_MS } from './types.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface P { id: string; name: string | null; sku: string | null; status: string; source: string; source_ref: string | null; claimed_at: string | null }
interface L { id: string; status: string; shopify_product_id: string | null; claimed_at: string | null; pb_websites: { name: string } | null }

/** The listings that are on Shopify and were not taken off the site ("Removed" = Draft there). */
export const onShopify = (ls: Pick<L, 'status' | 'shopify_product_id' | 'pb_websites'>[]) => ls.filter(l => l.shopify_product_id && l.status !== 'skipped');

/** Remove files from the bucket (Storage API, service role). Returns how many could NOT be removed. */
async function removeFiles(paths: string[]): Promise<number> {
  if (!paths.length) return 0;
  try {
    const r = await fetchT(`${SB_URL}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: { ...svcHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) }, 30_000);
    if (!r.ok) { console.error(`pb-products delete: storage answered ${r.status} for ${paths.length} files`); await r.body?.cancel(); return paths.length; }
    const gone = await r.json().catch(() => null) as unknown[] | null;
    return Array.isArray(gone) ? Math.max(0, paths.length - gone.length) : 0;
  } catch (e) { console.error(`pb-products delete: storage ${plain(e)}`); return paths.length; }
}

export async function deleteProduct(b: { product_id?: unknown }, userId: string | null): Promise<{ ok: true; photos_left: number }> {
  const id = String(b.product_id ?? '');
  if (!UUID.test(id)) throw new HttpError(400, 'product_id is required.');
  const p = await one<P>(`pb_products?id=eq.${enc(id)}&select=id,name,sku,status,source,source_ref,claimed_at`);
  if (!p) throw new HttpError(404, 'That product no longer exists.');
  if (p.status === 'reading' && p.claimed_at && p.claimed_at > ago(STALE_MS)) throw new HttpError(409, 'The AI is reading this product right now. Try again in a minute.');
  const ls = await sel<L>(`pb_listings?product_id=eq.${enc(id)}&select=id,status,shopify_product_id,claimed_at,pb_websites(name)`);
  const live = onShopify(ls);
  if (live.length) {
    const names = [...new Set(live.map(l => l.pb_websites?.name || 'a website'))].join(', ');
    throw new HttpError(409, `This product is on Shopify (${names}). Take it off first: open that website on the product, tap Remove from site, then delete.`);
  }
  if (ls.some(l => (l.status === 'generating' || l.status === 'publishing') && l.claimed_at && l.claimed_at > ago(STALE_MS))) {
    throw new HttpError(409, 'A listing of this product is being written or sent to Shopify right now. Try again in a minute.');
  }
  const files = (await sel<{ path: string }>(`pb_product_images?product_id=eq.${enc(id)}&select=path`)).map(i => i.path).filter(Boolean);
  await remove('pb_products', `id=eq.${enc(id)}`);
  const left = await removeFiles(files);
  await logActivity({ action: 'deleted', user_id: userId, details: { name: p.name, sku: p.sku, source: p.source, source_ref: p.source_ref, files: files.length, ...(left ? { files_left: left } : {}) } });
  return { ok: true, photos_left: left };
}
