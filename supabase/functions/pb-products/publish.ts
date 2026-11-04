// Step 4 — Publish one CLAIMED listing ('publishing') to its Shopify store
// with productSet (synchronous) and, for live sites, publishablePublish to the
// Online Store. Never makes a second copy: before a create, a product this
// listing made earlier (id lost to a timeout / crash) is found by handle +
// metafield and updated instead, and the Shopify id is saved the moment
// productSet returns. Unpublish lives in unpublish.ts.
import { ago, enc, logActivity, nowIso, one, patch, sel } from './db.ts';
import { HttpError, plain } from './http.ts';
import { buildProductInput, PRODUCT_SET, PUBLISH, STOCK_WARNING } from './productInput.ts';
import { gql, onlineStoreId } from './shopify.ts';
import { adoptable, type Existing, existingProduct } from './shopifyProduct.ts';
import { LISTING_COLS, MAX_ATTEMPTS, PRODUCT_COLS, RETRY_MS, STALE_MS, WEBSITE_COLS, type Budget, type ListingRow, type ProductRow, type WebsiteRow } from './types.ts';

/** Time a publish needs left before it starts: lookups + a slow productSet + the Online Store step. */
export const PUBLISH_NEEDS_MS = 60_000;
const SET_MS = 90_000;

const due = () => {
  const t = ago(STALE_MS);
  return `or=(and(status.eq.publishing,or(claimed_at.is.null,claimed_at.lt.${t})),and(status.eq.failed,attempts.lt.${MAX_ATTEMPTS},updated_at.lt.${ago(RETRY_MS)}))`;
};
export const pubCandidates = (limit: number) =>
  sel<{ id: string }>(`pb_listings?${due()}&select=id,pb_websites!inner(active)&pb_websites.active=eq.true&order=updated_at.asc&limit=${limit}`);

export async function claimPublish(id: string, manual: boolean): Promise<ListingRow | null> {
  const t = ago(STALE_MS);
  const filter = manual
    ? `generated_at=not.is.null&or=(status.in.(review,failed,published,skipped),and(status.eq.publishing,or(claimed_at.is.null,claimed_at.lt.${t})))`
    : due();
  return (await patch<ListingRow>('pb_listings', `id=eq.${enc(id)}&${filter}`, { status: 'publishing', claimed_at: nowIso() }, LISTING_COLS))[0] ?? null;
}

interface SetReply { productSet: { product: { id: string; status: string; handle: string } | null; userErrors: { field: string[] | null; message: string; code: string | null }[] } }

export async function publishOne(l: ListingRow, o: { manual: boolean; userId: string | null; budget: Budget }): Promise<ListingRow> {
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
  try {
    const [p, site, imgs, last] = await Promise.all([
      one<ProductRow>(`pb_products?id=eq.${enc(l.product_id)}&select=${PRODUCT_COLS}`),
      one<WebsiteRow>(`pb_websites?id=eq.${enc(l.website_id)}&select=${WEBSITE_COLS}`),
      sel<{ path: string }>(`pb_product_images?product_id=eq.${enc(l.product_id)}&select=path&order=position.asc&limit=20`),
      one<{ details: { photos?: string[] } }>(`pb_activity?product_id=eq.${enc(l.product_id)}&listing_id=eq.${enc(l.id)}&action=eq.published&select=details&order=created_at.desc`),
    ]);
    if (!p || !site) throw new HttpError(404, 'The product or website for this listing no longer exists.');
    if (p.status === 'archived') {
      const r = await patch<ListingRow>('pb_listings', mine, { status: 'skipped', error: 'The product was archived.', claimed_at: null }, LISTING_COLS);
      if (o.manual) throw new HttpError(400, 'This product is archived.');
      return r[0] ?? l;
    }
    if (!String(l.title || '').trim()) throw new HttpError(400, 'This listing has no title — regenerate it or type one.');
    if (!(Number(l.price) > 0)) throw new HttpError(400, 'This listing has no price — regenerate it or type one.');
    const vendor = p.vendor_id ? await one<{ name: string }>(`pb_vendors?id=eq.${enc(p.vendor_id)}&select=name`) : null;
    const paths = imgs.map(i => i.path);
    const live = site.publish_mode !== 'draft'; // review sites go live once a person approved
    const altHandle = (h: string | null) => `${String(h || 'product').slice(0, 72)}-${l.id.slice(0, 6)}`;

    // What the store already has: the known product, else one this listing made before (lost id).
    let existing: Existing | null = l.shopify_product_id ? await existingProduct(site, l.shopify_product_id, ms(30_000)) : null;
    const adopted = !existing ? await adoptable(site, l.id, [l.handle || '', altHandle(l.handle)], ms(30_000)) : null;
    existing = existing || adopted;
    const photosChanged = !existing || !!adopted || (last?.details?.photos || []).join('|') !== paths.join('|');

    const run = (handle: string | null) => gql<SetReply>(site, PRODUCT_SET, {
      input: buildProductInput({ l: { ...l, handle }, p, site, vendor: vendor?.name || '', paths, withFiles: photosChanged, live, existing }),
      identifier: existing ? { id: existing.id } : null,
    }, ms(SET_MS));
    let handle = l.handle;
    let res = await run(handle);
    let errs = res.productSet.userErrors || [];
    if (errs.some(e => /handle/i.test((e.field || []).join('.') + e.message))) { // handle taken on this store
      handle = altHandle(handle);
      res = await run(handle); errs = res.productSet.userErrors || [];
    }
    if (errs.length || !res.productSet.product) throw new HttpError(400, `${site.name}: Shopify said "${errs.map(e => e.message).join('; ').slice(0, 250) || 'the product was not saved'}".`);
    const prod = res.productSet.product;
    // Saved at once, whatever happens next, so a retry updates this product instead of making another.
    await patch('pb_listings', `id=eq.${enc(l.id)}`, { shopify_product_id: prod.id, shopify_status: prod.status, handle: prod.handle || handle });

    const warnings: string[] = [];
    if (site.track_inventory && !existing) warnings.push(STOCK_WARNING);
    if (live) {
      try {
        const pub = await onlineStoreId(site, ms(30_000));
        if (!pub) warnings.push('Saved on Shopify, but the store has no Online Store channel to show it on.');
        else {
          const r = await gql<{ publishablePublish: { userErrors: { message: string }[] } }>(site, PUBLISH, { id: prod.id, input: [{ publicationId: pub }] }, ms(30_000));
          const ue = r.publishablePublish?.userErrors || [];
          if (ue.length) warnings.push(`Saved on Shopify, but it could not be shown on the Online Store: ${ue.map(e => e.message).join('; ').slice(0, 200)}`);
        }
      } catch (e) {
        warnings.push(`Saved on Shopify, but it could not be shown on the Online Store (give the app read_publications and write_publications): ${plain(e)}`);
      }
    }
    const warning = warnings.join(' ') || null;
    const saved = await patch<ListingRow>('pb_listings', mine, {
      status: 'published', shopify_status: prod.status, published_at: nowIso(), attempts: 0, error: warning, claimed_at: null,
    }, LISTING_COLS);
    await logActivity({ product_id: l.product_id, website_id: l.website_id, listing_id: l.id, action: 'published', details: { shopify_product_id: prod.id, status: prod.status, update: !!existing, ...(adopted ? { adopted: true } : {}), photos: paths, ...(warning ? { warning } : {}) }, user_id: o.userId });
    if (!saved[0]) throw new HttpError(409, 'Published on Shopify, but the listing changed meanwhile — open it again.');
    return saved[0];
  } catch (e) {
    const msg = plain(e);
    if (!(e instanceof HttpError && e.status === 409)) {
      const r = await patch('pb_listings', mine, { status: 'failed', attempts: (l.attempts || 0) + 1, error: msg, claimed_at: null });
      if (r.length) await logActivity({ product_id: l.product_id, website_id: l.website_id, listing_id: l.id, action: 'failed', details: { step: 'publish', error: msg }, user_id: o.userId });
    }
    throw e instanceof HttpError ? e : new HttpError(502, msg);
  }
}
