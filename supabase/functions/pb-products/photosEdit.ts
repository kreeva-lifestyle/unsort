// Remove a product's photos and put them in another order (launch check D10,
// 2026-11-13: photos could be added but never removed or reordered, the first
// one is the main image on every store, and a photo the AI could not open held
// the product back with no way to take it out).
// photos_set { product_id, order, remove }: `order` = the photos that stay,
// first = main photo; `remove` = the ones to delete for good (row, prints,
// file). A photo in neither list (someone added it meanwhile) is kept, after
// the others. Videos are not touched.
//   1. pb_photos_set, one transaction: positions 0…n-1, and each listing's
//      alt texts move with their photos;
//   2. the removed photos' rows go, then their files (a file that will not go
//      is reported; nothing points to it any more);
//   3. the gate runs: no photo left → Needs info;
//   4. what follows (`follow`, also run by photos_sync after photos were
//      added in the app): a product the AI gave up on because of a photo is
//      read again; on a Ready product, a published listing whose store
//      gallery is not the product's is sent to Shopify again (on a review
//      site it waits for approval first) and a listing the writer gave up on
//      because of a photo is queued again.
// A listing that is still waiting is NOT written again for a photo: its alt
// texts moved with the photos, and its text stays as the person saw it
// (Regenerate is one tap away). So this does not go through routeProduct,
// which rewrites every waiting listing.
// Refused while the AI reads the product or writes one of its listings: the
// alt texts being written line up with the photos as they were.
import { ago, enc, logActivity, one, patch, remove, rpc, sel } from './db.ts';
import { HttpError, plain } from './http.ts';
import { galleryOf } from './photos.ts';
import { removeFiles } from './productDelete.ts';
import { galleryBehind, lastSent } from './route.ts';
import { refresh } from './tagStore.ts';
import { STALE_MS } from './types.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 200;
/** ai.ts: the AI could not fetch or decode a photo. */
const NO_OPEN = /could not open one of the product photos/i;
const ids = (v: unknown): string[] | null => {
  const list = Array.isArray(v) ? v.map(x => String(x).toLowerCase()) : null;
  return list && list.length <= MAX && list.every(x => UUID.test(x)) && new Set(list).size === list.length ? list : null;
};
const fresh = (at: string | null) => !!at && at > ago(STALE_MS);

interface P { id: string; status: string; ai_error: string | null; claimed_at: string | null }
interface L { id: string; status: string; error: string | null; claimed_at: string | null; pb_websites: { name: string; active: boolean; publish_mode: string } | null }
/** `resent`: published listings on their way to Shopify again; `review`: the ones that wait for approval first. */
export interface Followed { status: string; resent: number; review: number; reread: boolean; warning?: string }
export interface PhotosResult extends Followed { ok: true; removed: number }

const product = (id: string) => one<P>(`pb_products?id=eq.${enc(id)}&select=id,status,ai_error,claimed_at`);

/** What a change of photos sets going. Never throws: the photos are saved by then, so a failure here is a warning
 *  and the worker checks the websites again by itself (route_due → route.ts, which finds the same difference). */
async function follow(id: string, removed: boolean, userId: string | null): Promise<Followed> {
  const out: Followed = { status: '', resent: 0, review: 0, reread: false };
  try {
    const p = await product(id);
    if (!p) return out;
    out.status = (await refresh([id]))[0]?.status ?? p.status;
    if (removed && ['new', 'needs_info', 'ready'].includes(out.status) && NO_OPEN.test(p.ai_error || '')) {
      out.reread = (await patch('pb_products', `id=eq.${enc(id)}&status=eq.${out.status}`, { status: 'new', ai_error: null, claimed_at: null })).length > 0;
      if (out.reread) out.status = 'new';
    }
    if (out.status !== 'ready') return out; // nothing is sent for a product that is held, archived or about to be read
    const [ls, photos, sent] = await Promise.all([
      sel<L>(`pb_listings?product_id=eq.${enc(id)}&select=id,status,error,claimed_at,pb_websites(name,active,publish_mode)`),
      galleryOf(id).then(g => g.map(i => i.path)), lastSent(id),
    ]);
    const sites: string[] = [];
    let busy = false;
    for (const l of ls) {
      if (!l.pb_websites?.active) continue;
      if (l.status === 'publishing' && fresh(l.claimed_at)) busy = true; // going out right now, perhaps with the photos as they were
      else if (l.status === 'published' && galleryBehind(sent.get(l.id), photos)) {
        const review = l.pb_websites.publish_mode === 'review';
        const done = await patch('pb_listings', `id=eq.${enc(l.id)}&status=eq.published`, { status: review ? 'review' : 'publishing', attempts: 0, error: null, claimed_at: null });
        if (done.length) { sites.push(l.pb_websites.name); if (review) out.review++; else out.resent++; }
      } else if (removed && l.status === 'failed' && NO_OPEN.test(l.error || '')) {
        await patch('pb_listings', `id=eq.${enc(l.id)}&status=eq.failed`, { status: 'queued', attempts: 0, error: null, claimed_at: null });
      }
    }
    if (busy) await patch('pb_products', `id=eq.${enc(id)}`, { route_due: true });
    if (sites.length) await logActivity({ product_id: id, action: 'routed', user_id: userId, details: { websites: [], resent: sites, photos: true } });
  } catch (e) {
    console.error(`pb-products photos follow-up ${id}: ${plain(e)}`);
    await patch('pb_products', `id=eq.${enc(id)}`, { route_due: true }).catch(w => console.error(`pb-products photos route_due ${id}: ${plain(w)}`));
    out.warning = `The websites could not be checked just now (${plain(e)}). Playbook checks them again by itself within a few minutes.`;
  }
  return out;
}

export async function photosSet(b: { product_id?: unknown; order?: unknown; remove?: unknown }, userId: string | null): Promise<PhotosResult> {
  const id = String(b.product_id ?? '').toLowerCase();
  if (!UUID.test(id)) throw new HttpError(400, 'product_id is required.');
  const order = ids(b.order), gone = ids(b.remove ?? []);
  if (!order || !gone || gone.some(x => order.includes(x))) throw new HttpError(400, 'The list of photos is not valid.');
  const p = await product(id);
  if (!p) throw new HttpError(404, 'That product no longer exists.');
  if (p.status === 'reading' && fresh(p.claimed_at)) throw new HttpError(409, 'The AI is reading this product right now. Try again in a minute.');
  if ((await sel(`pb_listings?product_id=eq.${enc(id)}&status=eq.generating&claimed_at=gt.${enc(ago(STALE_MS))}&select=id&limit=1`)).length) {
    throw new HttpError(409, 'A listing of this product is being written right now. Try again in a minute.');
  }
  const before = (await sel<{ id: string }>(`pb_product_images?product_id=eq.${enc(id)}&kind=eq.image&select=id&order=position.asc,created_at.asc,id.asc&limit=1000`)).map(x => x.id);
  const left = await rpc<{ id: string; path: string }[]>('pb_photos_set', { p_product: id, p_order: order });
  // Only what was asked for is deleted: a photo added meanwhile stays, after the others.
  const out = left.filter(x => gone.includes(String(x.id).toLowerCase()));
  let filesLeft = 0;
  if (out.length) {
    await remove('pb_product_images', `id=in.(${out.map(x => enc(x.id)).join(',')})&product_id=eq.${enc(id)}`);
    filesLeft = await removeFiles(out.map(x => x.path).filter(Boolean));
  }
  const kept = before.filter(x => !out.some(o => o.id === x));
  const now = [...order, ...kept.filter(x => !order.includes(x))];
  await logActivity({ product_id: id, action: 'photos_edited', user_id: userId, details: {
    removed: out.length, photos: now.length, ...(kept.join('|') !== now.join('|') ? { reordered: true } : {}),
    ...(before[0] && before[0] !== (now[0] ?? '') ? { main_changed: true } : {}), ...(filesLeft ? { files_left: filesLeft } : {}),
  } });
  const f = await follow(id, out.length > 0, userId);
  const warning = [
    ...(filesLeft ? [`${filesLeft} photo file${filesLeft === 1 ? '' : 's'} could not be removed from storage. Nothing points to ${filesLeft === 1 ? 'it' : 'them'} any more.`] : []),
    ...(f.warning ? [f.warning] : []),
  ].join(' ');
  return { ok: true, removed: out.length, status: f.status || p.status, resent: f.resent, review: f.review, reread: f.reread, ...(warning ? { warning } : {}) };
}

/** After photos were added in the app (the rows are written from there): the same follow-up, so they reach the stores. */
export async function photosSync(b: { product_id?: unknown }, userId: string | null): Promise<Followed & { ok: true }> {
  const id = String(b.product_id ?? '').toLowerCase();
  if (!UUID.test(id)) throw new HttpError(400, 'product_id is required.');
  if (!await product(id)) throw new HttpError(404, 'That product no longer exists.');
  return { ok: true, ...await follow(id, false, userId) };
}
