// Photos as the AI sees them. Claude refuses images over 5 MB, but the bucket
// takes up to 15 MB, so a large photo is sent as a resized copy from Supabase's
// image transform (longest side 1568 px). When that copy is not available
// (transforms off on the plan) the photo is left out instead of failing the
// whole read / write. Shopify still gets the full-size original (publicUrl).
import { type Block, imageBlock } from './ai.ts';
import { enc, publicUrl, sel, SB_URL } from './db.ts';
import { fetchT } from './http.ts';
import { BUCKET } from './types.ts';

/** A product's photos as the writer and the stores get them: in order, the first 20 (videos are for staff). One
 *  definition, because routing compares this list with what a store was last sent (route.ts `behind`). */
export const galleryOf = (productId: string) =>
  sel<{ path: string }>(`pb_product_images?product_id=eq.${enc(productId)}&kind=eq.image&select=path&order=position.asc&limit=20`);

const AI_MAX_BYTES = 4_500_000;
const CHECK_MS = 6_000;

const renderUrl = (path: string) =>
  `${SB_URL}/storage/v1/render/image/public/${BUCKET}/${path.split('/').map(enc).join('/')}?width=1568&height=1568&resize=contain&quality=80`;

async function sizeOf(url: string): Promise<number | null> {
  try {
    const r = await fetchT(url, { method: 'HEAD' }, CHECK_MS);
    const n = Number(r.headers.get('content-length'));
    return r.ok && Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; } // unknown size → send the original and let the AI call report it
}

async function renderOk(url: string): Promise<boolean> {
  try {
    const r = await fetchT(url, { method: 'GET' }, CHECK_MS * 2);
    await r.body?.cancel();
    const n = Number(r.headers.get('content-length'));
    return r.ok && /^image\//.test(r.headers.get('content-type') || '') && !(Number.isFinite(n) && n > AI_MAX_BYTES);
  } catch { return false; }
}

/** Image blocks for the AI, in order; photos that cannot be sent are dropped.
 *  `sent[k]` = the index in `paths` of the k-th block (to line up per-photo answers such as alt text). */
export async function aiPhotos(paths: string[]): Promise<{ blocks: Block[]; sent: number[] }> {
  const urls = await Promise.all(paths.map(async (path) => {
    const url = publicUrl(path);
    const size = await sizeOf(url);
    if (size === null || size <= AI_MAX_BYTES) return url;
    const small = renderUrl(path);
    return (await renderOk(small)) ? small : null;
  }));
  const sent = urls.flatMap((u, i) => (u ? [i] : []));
  return { blocks: sent.map(i => imageBlock(urls[i] as string)), sent };
}
