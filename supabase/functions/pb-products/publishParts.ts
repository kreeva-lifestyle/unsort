// The small parts of a publish (publish.ts), from the Shopify sync check of
// 2026-11-12. What an update may change on the store, and what it must leave:
//   tags    Playbook's own, plus the ones the store has that Playbook did not
//           put there (typed in Shopify, added by an app): mergeTags;
//   photos  a photo the store already has goes by its id (nothing is uploaded
//           twice, a new description updates it), a new one by its address,
//           and media Playbook did not put there stays: filesFor. productSet
//           replaces the whole gallery with the list it is given;
//   fields  metafieldsSet saves all or nothing, so the fields the store
//           refuses are left out and the rest are sent again: sendFields;
//   channel the Online Store step: toOnlineStore.
// A passing failure (Shopify busy: 429, 5xx, THROTTLED → HttpError 503) is
// tried again and does not use up the listing's attempts: temporary.
import { enc, one, patch, publicUrl, sel, uniqueCi } from './db.ts';
import { METAFIELDS_SET, type FieldInput } from './fields.ts';
import { HttpError, plain } from './http.ts';
import { keptColour, PUBLISH } from './productInput.ts';
import { gql, onlineStoreId } from './shopify.ts';
import type { Existing } from './shopifyProduct.ts';
import type { ProductRow, WebsiteRow } from './types.ts';

/** The colour part this send uses for the product's codes (skuCode.ts): the one decided for it, else worked out now —
 *  '' for a product that is on a store from before codes carried a colour, else its colour as it is. Nothing is saved
 *  here: a send the store refuses decides nothing, so a colour corrected afterwards is the one that counts. */
export async function skuColour(p: ProductRow): Promise<string> {
  if (typeof p.sku_colour === 'string') return p.sku_colour;
  const onStore = await sel<{ id: string }>(`pb_listings?product_id=eq.${enc(p.id)}&shopify_product_id=not.is.null&select=id&limit=1`);
  return onStore.length ? '' : keptColour(p);
}

/** The store took the product with these codes: the colour part is decided from now on, for every website (called
 *  right after productSet, before anything else can fail, so a retry finds it). Returns the decided one — another
 *  website's send may have got here first, with the colour worded differently. */
export async function keepColour(p: ProductRow, used: string): Promise<string> {
  if (typeof p.sku_colour === 'string') return p.sku_colour;
  if ((await patch('pb_products', `id=eq.${enc(p.id)}&sku_colour=is.null`, { sku_colour: used })).length) return used;
  const now = await one<{ sku_colour: string | null }>(`pb_products?id=eq.${enc(p.id)}&select=sku_colour`);
  return typeof now?.sku_colour === 'string' ? now.sku_colour : used;
}

/** Shopify was busy, not wrong: the same request can pass a little later. */
export const temporary = (e: unknown) => e instanceof HttpError && e.status === 503;
/** This many passing failures in a row are free; after that they count like any other, so nothing is retried for ever. */
export const FREE_RETRIES = 10;

/** How many of the latest failures (newest first) were passing ones, counting back to the last publish. */
export function busyStreak(failed: { created_at: string; details: { temporary?: boolean } | null }[], lastPublished: string | null): number {
  let n = 0;
  for (const f of failed) { if (!f.details?.temporary || (lastPublished && f.created_at <= lastPublished)) break; n++; }
  return n;
}

/** The tags an update sends. `sent` = Playbook's own tags at the last publish (null = no record: every store tag stays).
 *  A tag Playbook sent then and no longer has is dropped; Shopify takes 250 tags at most. */
export function mergeTags(store: string[], sent: string[] | null, mine: string[]): string[] {
  const low = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const was = new Set((sent || []).map(low));
  return uniqueCi([...mine, ...store.filter(t => !was.has(low(t)))]).slice(0, 250);
}

export interface Photo { path: string; id: string }
/** `files` for productSet (null = leave the gallery as it is) and, in the order they sit in `files`, the photos uploaded afresh. */
export interface Gallery { files: Record<string, unknown>[] | null; fresh: string[] }
type StoreMedia = Existing['media'];

/** The photos Playbook sent at the last publish with the ids Shopify gave them. None when the ids are not on
 *  record (never guessed from the order: someone may have moved the photos in Shopify) and for a recovered
 *  lost create, whose photos are sent again and replace what is there. */
export function knownPhotos(last: { photos?: string[]; media?: string[] } | null | undefined, store: StoreMedia | null, adopted: boolean): Photo[] {
  const photos = last?.photos || [], media = last?.media || [];
  return store && !adopted && photos.length && media.length === photos.length ? photos.map((path, i) => ({ path, id: media[i] })) : [];
}

/** A product on the store whose photo ids are not on record, and whose photos in Playbook are the ones sent
 *  last time: the gallery is left alone (sending them afresh would replace everything the store has). */
export const leaveGallery = (last: { photos?: string[] } | null | undefined, paths: string[], known: Photo[], onStore: boolean, adopted: boolean) =>
  onStore && !adopted && !known.length && !!paths.length && (last?.photos || []).join('|') === paths.join('|');

/** The product's gallery for productSet. Nothing known about the store's photos (a create, a recovered lost
 *  create) → every photo afresh. Otherwise: a photo removed in Shopify by someone stays removed; one Shopify
 *  could not process is sent again; while Playbook's photos and their order are unchanged the gallery keeps
 *  the order it has on the store, and only a changed description goes out. An empty description never wipes one. */
export function filesFor(a: { paths: string[]; alts: string[]; known: Photo[]; store: StoreMedia | null }): Gallery {
  const alt = (path: string) => String(a.alts[a.paths.indexOf(path)] || '').slice(0, 512);
  const fresh = (path: string): Record<string, unknown> => ({ originalSource: publicUrl(path), alt: alt(path), contentType: 'IMAGE' });
  if (!a.paths.length) return { files: null, fresh: [] };
  if (!a.store || !a.known.length) return { files: a.paths.map(fresh), fresh: [...a.paths] };
  const onStore = new Map(a.store.map(m => [m.id, m]));
  const idOf = new Map(a.known.map(k => [k.path, k.id]));
  const pathOf = new Map(a.known.filter(k => a.paths.includes(k.path)).map(k => [k.id, k.path]));
  const live = (path: string) => { const m = onStore.get(idOf.get(path) || ''); return m && !m.failed ? m : null; };
  const keep = (m: { id: string; alt: string }): Record<string, unknown> => { const now = pathOf.has(m.id) ? alt(pathOf.get(m.id)!) : ''; return now && now !== m.alt ? { id: m.id, alt: now } : { id: m.id }; };
  const added = a.paths.filter(p => !idOf.has(p) || onStore.get(idOf.get(p)!)?.failed);
  const moved = a.known.filter(k => live(k.path)).map(k => k.path).join('|') !== a.paths.filter(p => live(p)).join('|');
  if (!added.length && !moved) { // the same photos: the store's own order stays
    const list = a.store.map(keep);
    return { files: list.some(f => 'alt' in f) ? list : null, fresh: [] };
  }
  const ours = new Set(a.known.map(k => k.id));
  const mine = a.paths.flatMap(p => (added.includes(p) ? [fresh(p)] : live(p) ? [keep(live(p)!)] : []));
  return { files: [...mine, ...a.store.filter(m => !ours.has(m.id)).map(m => ({ id: m.id }))], fresh: added };
}

/** Which Shopify media each of Playbook's photos is, after productSet answered with the gallery (`replied`,
 *  media ids in order). null when that cannot be told (the next publish then sends the photos afresh). */
export function photoRecord(g: Gallery, paths: string[], known: Photo[], replied: string[]): string[] | null {
  const idOf = new Map(known.map(k => [k.path, k.id]));
  if (g.files) {
    const kept = new Set(g.files.map(f => f.id).filter(Boolean));
    const made = replied.filter(id => !kept.has(id)); // what Shopify made of the new uploads, in the order they were sent
    if (made.length !== g.fresh.length) return null;
    g.fresh.forEach((path, i) => idOf.set(path, made[i]));
  }
  return paths.length && paths.every(p => idOf.has(p)) ? paths.map(p => idOf.get(p)!) : null;
}

const NO_FIELDS = 'Saved on Shopify, but its custom fields (fabric, work, FAQ…) were not';
interface FieldError { message: string; elementIndex?: number | null }

/** The listing's custom fields. Returns a warning for the listing, or null when all went in. */
export async function sendFields(site: WebsiteRow, fields: FieldInput[], ms: number): Promise<string | null> {
  if (!fields.length) return null;
  const set = async (list: FieldInput[]) => (await gql<{ metafieldsSet: { userErrors: FieldError[] } | null }>(site, METAFIELDS_SET, { metafields: list }, ms)).metafieldsSet?.userErrors || [];
  const said = (ue: FieldError[]) => [...new Set(ue.map(e => e.message))].join('; ').slice(0, 200);
  try {
    const ue = await set(fields);
    if (!ue.length) return null;
    const bad = new Set(ue.map(e => e.elementIndex).filter((i): i is number => Number.isInteger(i)));
    if (!bad.size || bad.size >= fields.length) return `${NO_FIELDS}: ${said(ue)}`;
    const rest = await set(fields.filter((_, i) => !bad.has(i))); // one refused field must not cost the others
    if (rest.length) return `${NO_FIELDS}: ${said(rest)}`;
    return `Saved on Shopify, but the store did not take these custom fields: ${fields.filter((_, i) => bad.has(i)).map(f => f.key).join(', ')} (${said(ue)}).`;
  } catch (e) {
    if (temporary(e)) throw e;
    return `${NO_FIELDS}: ${plain(e)}`;
  }
}

/** Put the product on the Online Store channel (a product made through the API is on no channel until then).
 *  Returns a warning, or null when it is on the channel. Shopify busy or unreachable → thrown, so the listing
 *  is tried again and not called published while no shopper can see it. */
export async function toOnlineStore(site: WebsiteRow, productId: string, ms: number): Promise<string | null> {
  try {
    const pub = await onlineStoreId(site, ms);
    if (!pub) return 'Saved on Shopify, but the store has no Online Store channel to show it on.';
    const r = await gql<{ publishablePublish: { userErrors: { message: string }[] } | null }>(site, PUBLISH, { id: productId, input: [{ publicationId: pub }] }, ms);
    const ue = r.publishablePublish?.userErrors || [];
    if (!ue.length) return null;
    // The saved channel id may be out of date (the channel was removed and added again): look it up afresh next time.
    await patch('pb_website_secrets', `website_id=eq.${enc(site.id)}`, { online_store_publication_id: null }).catch(w => console.error(`pb-products channel id reset: ${plain(w)}`));
    return `Saved on Shopify, but it could not be shown on the Online Store: ${ue.map(e => e.message).join('; ').slice(0, 200)}`;
  } catch (e) {
    if (e instanceof HttpError && e.status >= 500) throw e;
    return `Saved on Shopify, but it could not be shown on the Online Store (give the app read_publications and write_publications): ${plain(e)}`;
  }
}
