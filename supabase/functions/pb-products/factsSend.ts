// A product's type, tags and custom fields have their own small send to Shopify (owner, 20 Nov 2026: "Category
// changes: a change does not reach products already on the store. Corrected tags and fields: these are not sent again
// by themselves. … solve these biggest issues with permanent fixes"). Before, they left Playbook only inside a full
// re-send of the listing, and nothing asked for one when a category was renamed or moved, a value was corrected or a
// change was taken back. Now, as stock has had since 13 Nov (stockSend.ts):
//   * the database marks every listing that is on sale on Shopify when its product changes in a way the store shows
//     (pb_listings.facts_due, set by the pb_facts_follow triggers: 20261120100000_pb_facts_send.sql), whichever way
//     the change was made;
//   * sendFacts sends only the product type (the category), Playbook's own tags (the store's own tags stay) and the
//     custom fields, and takes a field off whose value went empty. No title, text, price, size or photo is touched,
//     so it needs no approval on a "Review first" website and reaches a product held in Needs info too;
//   * what was sent is recorded on the listing (pb_listings.sent, listingFacts.ts). A listing whose record already
//     equals what its product gives now is cleared without a call to the store, so a mark too many costs nothing;
//   * a collection is never left behind: before a product's type changes, the collection it falls into is made if
//     the store files by type and lacks it (storeCollections.ts);
//   * a website that is switched off is sent nothing and a pause holds it (worker.ts); the marks wait. A send that
//     fails stays owed and is tried again 5 minutes later; only its first failure is written to the timeline, and
//     the listing says so in its note (FACTS_NOTE) until a send goes through, so the failure is seen in the app.
// Each try is stamped (facts_tried_at). A change of the product while the try is on its way wipes the stamp (the
// trigger), and the mark is cleared only where the stamp still stands: the newer change is never lost.
// A full publish sends the same facts (publish.ts) and records them, but never clears the mark: the next run here
// finds the record equal and clears it.
import { ago, enc, logActivity, nowIso, one, patch, sel } from './db.ts';
import { fieldInputs } from './fields.ts';
import { dropFields, sendFields } from './fieldsSend.ts';
import { HttpError, plain } from './http.ts';
import { emptied, listingFacts, sameFacts, sameTags, sentOf } from './listingFacts.ts';
import { mergeTags, temporary } from './publishParts.ts';
import { gql } from './shopify.ts';
import { offSale } from './stockSend.ts';
import { type ColCache, ensureCollection } from './storeCollections.ts';
import { LISTING_COLS, PRODUCT_COLS, STALE_MS, WEBSITE_COLS, type ListingRow, type ProductRow, type WebsiteRow } from './types.ts';

const RETRY_MS = 5 * 60_000, AT_ONCE = 3, PAGE = 30;
/** The start of a listing's note while its facts could not be sent (only ever put on a listing with no other note). */
export const FACTS_NOTE = 'Its category, tags and custom fields could not be sent to Shopify yet, and Playbook tries again every 5 minutes: ';
/** The listing's note after a send: a field the store did not take, or nothing. A note that is not this file's own
 *  (a publish's warning, a person's reason) is left as it is. */
const noteAfter = (l: ListingRow, notes: string[]) => (!l.error || l.error.startsWith(FACTS_NOTE) ? { error: notes.join(' ') || null } : {});
const READ = 'query PbFactsRead($id: ID!) { product(id: $id) { id tags } }';
const UPDATE = `mutation PbFacts($product: ProductUpdateInput!) {
  productUpdate(product: $product) { product { id } userErrors { field message } }
}`;
/** Owed and not tried in the last 5 minutes (a try in flight carries a fresh stamp). */
const untried = () => `or=(facts_tried_at.is.null,facts_tried_at.lt.${ago(RETRY_MS)})`;

/** Playbook's own tags at the last full publish, for a listing with no record of its own yet (null = none at all). */
async function lastTags(l: ListingRow): Promise<string[] | null> {
  const r = await one<{ details: { tags?: string[] } | null }>(`pb_activity?product_id=eq.${enc(l.product_id)}&listing_id=eq.${enc(l.id)}&action=eq.published&select=details&order=created_at.desc`);
  return Array.isArray(r?.details?.tags) ? r.details.tags : null;
}

/** Send one listing's facts. 'done' = nothing is owed any more; 'wait' = still owed, nothing went wrong (a publish
 *  holds the listing, its website is off, another run has it, or the product changed meanwhile); 'failed' = this
 *  product could not be updated; 'busy' = the store itself could not answer (its other listings wait for the next run). */
export async function sendFacts(l: ListingRow, userId: string | null, cols: ColCache, ms = 20_000): Promise<'done' | 'wait' | 'failed' | 'busy'> {
  const due = `id=eq.${enc(l.id)}&facts_due=eq.true`;
  const clear = { facts_due: false, facts_force: false, facts_tried_at: null };
  if (offSale(l) || !l.shopify_product_id) { await patch('pb_listings', due, clear); return 'done'; }
  // A run is publishing this listing right now: it sends these facts as they are now, and records them.
  if (l.status === 'publishing' && l.claimed_at && Date.parse(l.claimed_at) > Date.now() - STALE_MS) return 'wait';
  const [p, site] = await Promise.all([
    one<ProductRow>(`pb_products?id=eq.${enc(l.product_id)}&select=${PRODUCT_COLS}`),
    one<WebsiteRow>(`pb_websites?id=eq.${enc(l.website_id)}&select=${WEBSITE_COLS}`),
  ]);
  // An archived product's listing stays on the store as it was (publish.ts KEPT): nothing is sent for it.
  if (!p || !site || p.status === 'archived') { await patch('pb_listings', due, clear); return 'done'; }
  if (!site.active) return 'wait';
  const at = nowIso(), mine = `${due}&facts_tried_at=eq.${enc(at)}`;
  if (!(await patch('pb_listings', `${due}&${untried()}`, { facts_tried_at: at })).length) return 'wait'; // another run has it
  const who = { product_id: l.product_id, website_id: l.website_id, listing_id: l.id, user_id: userId };
  const id = l.shopify_product_id;
  try {
    const now = await listingFacts(l, p, site), was = l.sent ?? null;
    if (!l.facts_force && sameFacts(now, was)) { await patch('pb_listings', mine, { ...clear, ...(l.error?.startsWith(FACTS_NOTE) ? { error: null } : {}) }); return 'done'; } // the store has them already
    const old = String(was?.type ?? l.product_type ?? '');
    await ensureCollection(site, now.type, old, cols, ms);
    const d = await gql<{ product: { id: string; tags: string[] } | null }>(site, READ, { id }, ms);
    if (!d.product) { await patch('pb_listings', mine, clear); return 'done'; } // deleted in Shopify: the next publish says so on the listing
    const tags = mergeTags(d.product.tags || [], Array.isArray(was?.tags) ? was.tags : await lastTags(l), now.tags);
    const r = await gql<{ productUpdate: { userErrors: { message: string }[] } | null }>(site, UPDATE, { product: { id, ...(now.type ? { productType: now.type } : {}), tags } }, ms);
    const ue = r.productUpdate?.userErrors || [];
    if (ue.length) throw new HttpError(400, `${site.name}: Shopify said "${ue.map(e => e.message).join('; ').slice(0, 200)}".`);
    const cleared = now.fields ? emptied(now, was) : [];
    const notes = now.fields ? [await sendFields(site, fieldInputs(id, p, [], now.attrs), ms), await dropFields(site, id, cleared, ms)].filter((x): x is string => !!x) : [];
    // What the store has now goes on record whatever happened meanwhile; the mark goes only if nothing did.
    const row = { sent: sentOf(now, was), ...(now.type ? { product_type: now.type } : {}), ...noteAfter(l, notes) };
    const done = (await patch('pb_listings', mine, { ...clear, ...row })).length > 0;
    if (!done) await patch('pb_listings', `id=eq.${enc(l.id)}`, row);
    // The listing shows the tags the store has; tags a person typed meanwhile are theirs.
    if (!sameTags(now.tags, l.tags || [])) await patch('pb_listings', `id=eq.${enc(l.id)}&locked=not.cs.${enc('{tags}')}`, { tags: now.tags });
    await logActivity({ ...who, action: 'facts_sent', details: {
      ...(now.type && now.type !== old ? { type: now.type, ...(old ? { was_type: old } : {}) } : {}), tags: now.tags,
      ...(now.fields ? { fields: Object.keys(now.fields).length } : {}), ...(cleared.length ? { cleared } : {}),
      ...(l.facts_force ? { asked: true } : {}), ...(notes.length ? { warning: notes.join(' ') } : {}) } });
    return done ? 'done' : 'wait';
  } catch (e) {
    // The stamp stays, so it is tried again in 5 minutes: only the first failure in a row goes on the timeline.
    if (!l.facts_tried_at) await logActivity({ ...who, action: 'failed', details: { step: 'facts', error: plain(e) } }).catch(w => console.error(`pb-products facts log ${l.id}: ${plain(w)}`));
    else console.error(`pb-products facts ${l.id}: ${plain(e)}`);
    // Seen on the listing too, unless it already carries a note of its own. Shopify only being busy is not worth one.
    if (!l.error && !temporary(e)) await patch('pb_listings', `${due}&error=is.null`, { error: `${FACTS_NOTE}${plain(e)}`.slice(0, 900) }).catch(w => console.error(`pb-products facts note ${l.id}: ${plain(w)}`));
    return temporary(e) ? 'busy' : 'failed';
  }
}

/** The listings whose facts are owed and due for a try, on websites that are switched on: never tried first, then
 *  the oldest try. `skipSites`: stores that could not answer in this run. */
export const factsCandidates = (limit: number, skipSites: string[] = []) =>
  sel<ListingRow>(`pb_listings?facts_due=eq.true&${untried()}${skipSites.length ? `&website_id=not.in.(${skipSites.map(enc).join(',')})` : ''}`
    + `&select=${LISTING_COLS},pb_websites!inner(active)&pb_websites.active=eq.true&order=facts_tried_at.asc.nullsfirst,updated_at.asc&limit=${limit}`);

/** The worker's step: up to `limit` listings, three at a time, while `inTime`. Returns how many were settled. A store
 *  that cannot answer is left for the next run; one product that fails does not hold the others back. */
export async function sendFactsDue(limit: number, inTime: () => boolean, userId: string | null): Promise<number> {
  let n = 0;
  const down = new Set<string>(), cols: ColCache = new Map();
  while (n < limit && inTime()) {
    const list = await factsCandidates(Math.min(PAGE, limit - n), [...down]), wasDown = down.size;
    let moved = 0;
    for (let i = 0; i < list.length && inTime(); i += AT_ONCE) {
      const part = list.slice(i, i + AT_ONCE).filter(l => !down.has(l.website_id));
      const res = await Promise.all(part.map(l => sendFacts(l, userId, cols, 10_000)));
      res.forEach((r, j) => {
        if (r === 'done') { n++; moved++; } else if (r === 'failed') moved++; else if (r === 'busy') down.add(part[j].website_id);
      });
    }
    if (!moved && down.size === wasDown) break; // nothing left that can go now (a store that just failed: asked once more without it)
  }
  return n;
}
