// Step 4 — Publish one CLAIMED listing ('publishing') to its Shopify store
// with productSet (synchronous), then its custom fields (metafieldsSet) and the
// Online Store channel. Never makes a second copy: before a create, a product
// this listing made earlier (id lost to a timeout / crash) is found by handle +
// metafield and updated instead, and the Shopify id is saved the moment
// productSet returns. Unpublish lives in unpublish.ts; the parts in
// publishParts.ts.
// Shopify sync check, 2026-11-12:
//   * an update keeps what people did in Shopify: their tags, their media, the
//     channels they chose (the channel step runs on a create, on Put back and
//     after it failed, not on every update), status and category;
//   * a product someone deleted in Shopify is not made again by the worker
//     (the listing is set aside with a note; "Put back on site" lists it again);
//   * Shopify being busy does not use up the listing's three attempts, and a
//     listing is not called published while the channel step still has to pass
//     (pre-launch check, 2026-11-13: nor when that step is refused — saved on
//     Shopify but shown nowhere is Failed, with the reason, not Published);
//   * a store that does not sell in rupees gets nothing (shopify.ts CURRENCY).
import { enc, logActivity, nowIso, one, patch, sel } from './db.ts';
import { makeHandle } from './content.ts';
import { faqHtml, fieldInputs } from './fields.ts';
import { HttpError, plain } from './http.ts';
import { compareAt } from './pricing.ts';
import { galleryOf } from './photos.ts';
import { profileOf } from './profile.ts';
import { buildProductInput, PRODUCT_SET, STOCK_WARNING } from './productInput.ts';
import { busyStreak, filesFor, FREE_RETRIES, type Gallery, knownPhotos, leaveGallery, mergeTags, photoRecord, sendFields, skuColour, temporary, toOnlineStore } from './publishParts.ts';
import { seoGet } from './seoStore.ts';
import { CURRENCY, gql, shopCurrency, wrongCurrency } from './shopify.ts';
import { adoptable, type Existing, existingProduct } from './shopifyProduct.ts';
import { PERM_NOTE, retire, stockMoved } from './stockSend.ts';
import { ARCHIVED, LISTING_COLS, NEEDS_INFO, PRODUCT_COLS, WEBSITE_COLS, permOut, type Budget, type ListingRow, type ProductRow, type WebsiteRow } from './types.ts';

/** Time a publish needs left before it starts: lookups + a slow productSet + the Online Store step. */
export const PUBLISH_NEEDS_MS = 60_000;
const SET_MS = 90_000;

export { claimPublish, pubCandidates } from './publishQueue.ts';

interface SetReply { productSet: { product: { id: string; status: string; handle: string; media?: { nodes: { id: string }[] } } | null; userErrors: { field: string[] | null; message: string; code: string | null }[] } }
interface Sent { photos?: string[]; media?: string[]; tags?: string[]; channel?: boolean }
/** The listing's note when its product was deleted in Shopify and the worker left it that way. */
export const GONE = 'This product was deleted in Shopify, so Playbook stopped sending it. Tap Put back on site to list it again.';
/** An archived product's listing that is on Shopify: nothing is sent, and it is not called removed while it is on sale. */
const KEPT = 'This product is archived, so the last change was not sent. It is still on Shopify as it was: tap Remove from site to take it off.';

/** `putBack`: staff tapped "Put back on site" on a removed listing — the only update that sets the Shopify status again. */
export async function publishOne(l: ListingRow, o: { manual: boolean; putBack?: boolean; userId: string | null; budget: Budget }): Promise<ListingRow> {
  const mine = `id=eq.${enc(l.id)}&status=eq.publishing`;
  if (!l.generated_at) { // never written (should not happen) — send it back to the writer
    const r = await patch<ListingRow>('pb_listings', mine, { status: 'queued', claimed_at: null }, LISTING_COLS);
    if (o.manual) throw new HttpError(400, 'This listing has not been written yet — it is queued for the AI first.');
    return r[0] ?? l;
  }
  const left = () => o.budget.hard - Date.now();
  const ms = (cap: number) => Math.max(5_000, Math.min(cap, left() - 5_000));
  if (left() < PUBLISH_NEEDS_MS) { // not enough time to finish safely: release the claim, no attempt counted
    const r = await patch<ListingRow>('pb_listings', mine, { claimed_at: null }, LISTING_COLS);
    if (o.manual) throw new HttpError(503, 'The server ran out of time for this — tap Publish again.');
    return r[0] ?? l;
  }
  const sent: string[] = []; // handles sent to productSet, kept on a failure so a lost create is found again
  let streak = 0, onStore = false, owed = false; // passing failures in a row before this run; productSet went through in this run; the Online Store step is still to do
  try {
    const [p, site, imgs, last, tried] = await Promise.all([
      one<ProductRow>(`pb_products?id=eq.${enc(l.product_id)}&select=${PRODUCT_COLS}`),
      one<WebsiteRow>(`pb_websites?id=eq.${enc(l.website_id)}&select=${WEBSITE_COLS}`),
      galleryOf(l.product_id),
      one<{ details: Sent | null; created_at: string }>(`pb_activity?product_id=eq.${enc(l.product_id)}&listing_id=eq.${enc(l.id)}&action=eq.published&select=details,created_at&order=created_at.desc`),
      sel<{ details: { handles?: string[]; temporary?: boolean; channel_due?: boolean } | null; created_at: string }>(`pb_activity?product_id=eq.${enc(l.product_id)}&listing_id=eq.${enc(l.id)}&action=eq.failed&select=details,created_at&order=created_at.desc&limit=12`),
    ]);
    streak = busyStreak(tried, last?.created_at ?? null);
    if (!p || !site) throw new HttpError(404, 'The product or website for this listing no longer exists.');
    if (p.status === 'archived') {
      // Not sent. A listing that is on Shopify stays "published" (it is on sale there; Remove from site takes it off).
      const r = await patch<ListingRow>('pb_listings', mine, l.shopify_product_id ? { status: 'published', error: KEPT, attempts: 0, claimed_at: null } : { status: 'skipped', error: ARCHIVED, claimed_at: null }, LISTING_COLS);
      if (o.manual) throw new HttpError(400, 'This product is archived.');
      return r[0] ?? l;
    }
    if (p.status === 'needs_info') throw new HttpError(400, NEEDS_INFO);
    const gone = permOut(p); // a permanent stock-out: this send archives the Shopify product (productInput.ts)
    if (gone && o.manual) throw new HttpError(400, 'The vendor said this product is permanently out of stock. Switch Stock on first to sell it again.');
    if (!String(l.title || '').trim()) throw new HttpError(400, 'This listing has no title — regenerate it or type one.');
    if (!(Number(l.price) > 0)) throw new HttpError(400, 'This listing has no price — regenerate it or type one.');
    const currency = await shopCurrency(site, ms(15_000));
    if (currency && currency !== CURRENCY) throw new HttpError(400, wrongCurrency(site.name, currency));
    const seoRows = await seoGet([l.id]);
    const profile = profileOf(site), faq = seoRows.get(l.id)?.faq ?? [];
    const paths = imgs.map(i => i.path), was = last?.details ?? null;
    const live = site.publish_mode !== 'draft'; // review sites go live once a person approved
    const altHandle = (h: string) => `${h.slice(0, 72)}-${l.id.slice(0, 6)}`;
    const first = l.handle || makeHandle(l.title || '', p.sku, p.id); // never without one: a lost create is found again by its handle
    // A price typed by hand keeps its compare-at in step with the site's pricing.
    const compare = (l.locked || []).includes('price') ? compareAt(Number(l.price), site.pricing || {}) : l.compare_at_price;
    const earlier = tried.flatMap(t => (Array.isArray(t.details?.handles) ? t.details.handles : []));

    // What the store already has: the known product, else one this listing made before (lost id).
    let existing: Existing | null = l.shopify_product_id ? await existingProduct(site, l.shopify_product_id, ms(30_000)) : null;
    let adopted = !existing ? await adoptable(site, l.id, [first, altHandle(first), ...earlier], ms(30_000)) : null;
    existing = existing || adopted;
    if (gone && !existing) { // not on this store (never was, or deleted there): nothing to take off, and nothing is made
      const r = await patch<ListingRow>('pb_listings', mine, { status: 'skipped', error: PERM_NOTE, shopify_product_id: null, shopify_status: null, claimed_at: null }, LISTING_COLS);
      await retire(p.id);
      return r[0] ?? l;
    }
    if (l.shopify_product_id && !existing && !o.manual) { // deleted in Shopify by someone: only a person brings it back
      const r = await patch<ListingRow>('pb_listings', mine, { status: 'skipped', error: GONE, shopify_product_id: null, shopify_status: null, claimed_at: null }, LISTING_COLS);
      if (r.length) await logActivity({ product_id: l.product_id, website_id: l.website_id, listing_id: l.id, action: 'unpublished', details: { deleted_in_shopify: true, shopify_product_id: l.shopify_product_id }, user_id: o.userId });
      return r[0] ?? l;
    }

    const coded = { ...p, sku_colour: await skuColour(p) }; // its codes' colour part: decided and saved before the first send
    // Status goes out on a create (and a recovered lost create) and on Put back; a plain update leaves
    // whatever people set in Shopify (e.g. a draft site's product made visible there).
    let sendStatus = false, gallery: Gallery = { files: null, fresh: [] }, known = knownPhotos(was, null, false);
    let noCategory = false, noFiles = false, triedAlt = false;
    let handle = l.handle || existing?.handle || first; // a product on the store keeps the address it has
    const run = () => {
      sendStatus = !existing || !!adopted || !!o.putBack;
      known = knownPhotos(was, existing?.media ?? null, !!adopted);
      gallery = noFiles || leaveGallery(was, paths, known, !!existing, !!adopted) ? { files: null, fresh: [] }
        : filesFor({ paths, alts: l.image_alts || [], known, store: existing?.media ?? null });
      const tags = existing ? mergeTags(existing.tags, adopted ? null : was?.tags ?? null, l.tags || []) : l.tags || [];
      const input = buildProductInput({ l: { ...l, handle, tags, compare_at_price: compare }, p: coded, site, vendor: profile.brand, files: gallery.files, live, sendStatus, existing, tail: profile.faq_in_description ? faqHtml(faq) : '', noCategory });
      sent.push(handle);
      return gql<SetReply>(site, PRODUCT_SET, { input, identifier: existing ? { id: existing.id } : null }, ms(SET_MS));
    };
    let res = await run(), errs = res.productSet.userErrors || [];
    for (let i = 0; i < 4 && errs.length; i++) { // each thing Shopify can refuse is given up once, in any order
      const about = (re: RegExp) => errs.some(e => re.test(`${(e.field || []).join('.')} ${e.message}`));
      if (!noCategory && about(/categor|taxonom/i)) noCategory = true; // the category is extra: never the reason a product stays off the store
      else if (!triedAlt && about(/handle/i)) {
        // Taken: perhaps by this listing's own product (a create Shopify finished after Playbook stopped waiting).
        const own = existing ? null : await adoptable(site, l.id, [handle], ms(30_000));
        if (own) { existing = own; adopted = own; } else { triedAlt = true; handle = altHandle(handle); }
      } else if (existing && gallery.files && about(/file|media|image/i)) noFiles = true; // the text and price still go out
      else break;
      res = await run(); errs = res.productSet.userErrors || [];
    }
    if (errs.length || !res.productSet.product) throw new HttpError(400, `${site.name}: Shopify said "${errs.map(e => e.message).join('; ').slice(0, 250) || 'the product was not saved'}".`);
    const prod = res.productSet.product;
    onStore = true;
    // The Online Store step: on a create (a draft site's product too, so it shows the moment someone makes it
    // Active in Shopify), on Put back, and while an earlier run still owes it — not on every update, which would
    // undo a channel choice made in Shopify.
    const since = last?.created_at ?? '';
    owed = !gone && (sendStatus || !l.published_at || was?.channel === false || tried.some(t => t.details?.channel_due && t.created_at > since));
    // Saved at once, whatever happens next, so a retry updates this product instead of making another.
    // Only while this run still holds the listing (a store move or takeover re-queued it meanwhile).
    const held = await patch('pb_listings', mine, { shopify_product_id: prod.id, shopify_status: prod.status, handle: prod.handle || handle, compare_at_price: compare });
    if (!held.length) throw new HttpError(409, 'The listing changed while it was being published — open it again.');

    const warnings: string[] = [];
    if (site.track_inventory && !existing) warnings.push(STOCK_WARNING);
    if (noCategory) warnings.push('Saved on Shopify without its standard category (the store did not accept it): choose the category in Shopify.');
    if (noFiles) warnings.push('Saved on Shopify, but the store did not take the change to its photos: check the photos there.');
    const fw = await sendFields(site, profile.custom_fields ? fieldInputs(prod.id, p, faq) : [], ms(30_000));
    if (fw) warnings.push(fw);
    if (owed) { // not shown to shoppers = not published: the listing fails here (owed stays → channel_due) and is tried again
      const cw = await toOnlineStore(site, prod.id, ms(30_000));
      if (cw) throw new HttpError(400, cw);
      owed = false;
    }
    const warning = warnings.join(' ') || null;
    // What the store has of Playbook's photos now. The store refused the change → what it had before.
    const media = photoRecord(gallery, paths, known, (prod.media?.nodes || []).map(m => m.id));
    // `photos_tried`: the list the store refused, so routing does not send the same list again by itself (route.ts `behind`).
    const photos = noFiles ? { photos: was?.photos ?? [], ...(was?.media ? { media: was.media } : {}), photos_tried: paths } : { photos: paths, ...(media ? { media } : {}) };
    const at = nowIso();
    const saved = await patch<ListingRow>('pb_listings', mine, gone
      ? { status: 'skipped', shopify_status: prod.status, attempts: 0, error: PERM_NOTE, claimed_at: null } // archived on Shopify: off the website
      : { status: 'published', shopify_status: prod.status, published_at: at, ...(l.first_published_at ? {} : { first_published_at: at }), // the first time only: a re-send does not make it new again
        attempts: 0, error: warning, claimed_at: null, ...(gallery.fresh.length ? { media_checked_at: null } : {}) }, LISTING_COLS);
    await logActivity({ product_id: l.product_id, website_id: l.website_id, listing_id: l.id, action: 'published', details: { shopify_product_id: prod.id, status: prod.status, update: !!existing, ...(adopted ? { adopted: true } : {}), ...photos, tags: l.tags || [], sizes: p.sizes || [], sku: p.sku || '', in_stock: p.in_stock !== false, ...(warning ? { warning } : {}) }, user_id: o.userId });
    if (gone) await retire(l.product_id); else await stockMoved(l.id, p); // the stock changed while this was sent → its own send follows
    if (!saved[0]) throw new HttpError(409, 'Published on Shopify, but the listing changed meanwhile — open it again.');
    return saved[0];
  } catch (e) {
    const msg = plain(e);
    if (!(e instanceof HttpError && e.status === 409)) {
      // A failed "Put back on site" goes back to Removed, not Failed: the retry of a failed listing is a plain
      // update, which never sets the Shopify status, so it would call the listing Published while the product
      // stays a hidden draft on the store. The person who tapped it sees the error and can tap it again. Once
      // productSet went through the status is set, and the listing fails like any other.
      const free = temporary(e) && streak < FREE_RETRIES; // Shopify was busy: tried again, no attempt used up
      const r = await patch('pb_listings', mine, o.putBack && !onStore ? { status: 'skipped', claimed_at: null }
        : { status: 'failed', attempts: (l.attempts || 0) + (free ? 0 : 1), error: msg, claimed_at: null });
      if (r.length) await logActivity({ product_id: l.product_id, website_id: l.website_id, listing_id: l.id, action: 'failed', details: { step: 'publish', error: msg, ...(temporary(e) ? { temporary: true } : {}), ...(onStore && owed ? { channel_due: true } : {}), ...(sent.length ? { handles: [...new Set(sent)] } : {}) }, user_id: o.userId });
    }
    throw e instanceof HttpError ? e : new HttpError(502, msg);
  }
}
