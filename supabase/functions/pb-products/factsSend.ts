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
// Each try is stamped (facts_tried_at) BEFORE anything is read, and works from the row the stamp returns. A change of
// the product writes the listing's mark again and wipes the stamp (the trigger), and the mark is cleared only where the
// stamp still stands: a change that commits before the stamp is in what the send reads, and one after it leaves the
// listing owed, so the newer change is never lost (code check, 20 Nov 2026: reading first lost a change that landed
// between the read and the stamp). An older send that reaches the store after a newer one marks the listing again.
// A full publish sends the same tags and fields (publish.ts) and records them, but never clears the mark: the next run
// here finds the record equal and clears it. A changed product type is left to this send, which makes the collection.
import { ago, enc, logActivity, nowIso, one, patch, sel } from './db.ts';
import { fieldInputs } from './fields.ts';
import { syncFields, withoutFieldNotes } from './fieldsSend.ts';
import { HttpError, plain } from './http.ts';
import { emptied, listingFacts, sameFacts, sameTags, sentOf } from './listingFacts.ts';
import { mergeTags, temporary } from './publishParts.ts';
import { gql } from './shopify.ts';
import { offSale } from './stockSend.ts';
import { type ColCache, ensureCollection } from './storeCollections.ts';
import { LISTING_COLS, PRODUCT_COLS, STALE_MS, WEBSITE_COLS, type ListingRow, type ProductRow, type WebsiteRow } from './types.ts';

const RETRY_MS = 5 * 60_000, AT_ONCE = 3, PAGE = 30, STORE_FAILS = 3;
/** The start of a listing's note while its facts could not be sent (only ever put on a listing with no other note). */
export const FACTS_NOTE = 'Its category, tags and custom fields could not be sent to Shopify yet, and Playbook tries again every 5 minutes: ';
/** The listing's note after a send: this send's field warnings, or nothing. Its own earlier notes go (FACTS_NOTE, an
 *  old field warning the store has since taken the field for); any other note (a publish's warning, a person's
 *  reason) is left as it is, and nothing is added to it. */
function noteAfter(l: ListingRow, notes: string[]): { error?: string | null } {
  const rest = l.error?.startsWith(FACTS_NOTE) ? '' : withoutFieldNotes(l.error);
  if (rest === (l.error ?? '')) return rest ? {} : { error: notes.join(' ') || null };
  return { error: [rest, ...notes].filter(Boolean).join(' ') || null };
}
const READ = 'query PbFactsRead($id: ID!) { product(id: $id) { id tags } }';
const UPDATE = `mutation PbFacts($product: ProductUpdateInput!) {
  productUpdate(product: $product) { product { id } userErrors { field message } }
}`;
/** Owed and not tried in the last 5 minutes (a try in flight carries a fresh stamp). */
const untried = () => `or=(facts_tried_at.is.null,facts_tried_at.lt.${ago(RETRY_MS)})`;
/** A run is publishing this listing right now: it sends these facts as they are now, and records them. */
const held = (l: ListingRow) => l.status === 'publishing' && !!l.claimed_at && Date.parse(l.claimed_at) > Date.now() - STALE_MS;

/** Playbook's own tags at the last full publish, for a listing with no record of its own yet (null = none at all). */
async function lastTags(l: ListingRow): Promise<string[] | null> {
  const r = await one<{ details: { tags?: string[] } | null }>(`pb_activity?product_id=eq.${enc(l.product_id)}&listing_id=eq.${enc(l.id)}&action=eq.published&select=details&order=created_at.desc`);
  return Array.isArray(r?.details?.tags) ? r.details.tags : null;
}

/** Send one listing's facts. `c` = the listing as the candidates page read it. 'done' = nothing is owed any more;
 *  'wait' = still owed, nothing went wrong (a publish holds the listing, its website is off, another run has it, or
 *  the product changed meanwhile); 'failed' = this product could not be updated; 'busy' = the store itself could not
 *  answer (its other listings wait for the next run). */
export async function sendFacts(c: ListingRow, userId: string | null, cols: ColCache, ms = 20_000): Promise<'done' | 'wait' | 'failed' | 'busy'> {
  const due = `id=eq.${enc(c.id)}&facts_due=eq.true`;
  const clear = { facts_due: false, facts_force: false, facts_tried_at: null };
  if (offSale(c) || !c.shopify_product_id) { await patch('pb_listings', due, clear); return 'done'; }
  if (held(c)) return 'wait';
  // The stamp first; everything after it is read fresh, the listing included (`l`).
  const at = nowIso(), mine = `${due}&facts_tried_at=eq.${enc(at)}`;
  const [l] = await patch<ListingRow>('pb_listings', `${due}&${untried()}`, { facts_tried_at: at }, LISTING_COLS);
  if (!l) return 'wait'; // another run has it
  const settled = async (row: Record<string, unknown>) => ((await patch('pb_listings', mine, row)).length ? 'done' as const : 'wait' as const);
  const handBack = async () => { await patch('pb_listings', mine, { facts_tried_at: c.facts_tried_at ?? null }); return 'wait' as const; };
  const id = l.shopify_product_id;
  if (offSale(l) || !id) return settled(clear);
  if (held(l)) return handBack();
  const [p, site] = await Promise.all([
    one<ProductRow>(`pb_products?id=eq.${enc(l.product_id)}&select=${PRODUCT_COLS}`),
    one<WebsiteRow>(`pb_websites?id=eq.${enc(l.website_id)}&select=${WEBSITE_COLS}`),
  ]);
  // An archived product's listing stays on the store as it was (publish.ts KEPT): nothing is sent for it. Restoring
  // it marks the listing again (the trigger), so what changed meanwhile goes then.
  if (!p || !site || p.status === 'archived') return settled(clear);
  if (!site.active) return handBack();
  const who = { product_id: l.product_id, website_id: l.website_id, listing_id: l.id, user_id: userId };
  const here = `id=eq.${enc(l.id)}&shopify_product_id=eq.${enc(id)}`; // still this store's product (a store move forgets the record)
  try {
    const now = await listingFacts(l, p, site), was = l.sent ?? null;
    if (!l.facts_force && sameFacts(now, was)) return settled({ ...clear, ...noteAfter(l, []) }); // the store has them already
    const old = String(was?.type || l.product_type || ''); // an empty type on record is no type: the listing's own says what the store has
    await ensureCollection(site, now.type, old, cols, ms);
    const d = await gql<{ product: { id: string; tags: string[] } | null }>(site, READ, { id }, ms);
    if (!d.product) return settled(clear); // deleted in Shopify: the next publish says so on the listing
    const tags = mergeTags(d.product.tags || [], Array.isArray(was?.tags) ? was.tags : await lastTags(l), now.tags);
    const r = await gql<{ productUpdate: { userErrors: { message: string }[] } | null }>(site, UPDATE, { product: { id, ...(now.type ? { productType: now.type } : {}), tags } }, ms);
    const ue = r.productUpdate?.userErrors || [];
    if (ue.length) throw new HttpError(400, `${site.name}: Shopify said "${ue.map(e => e.message).join('; ').slice(0, 200)}".`);
    // The type and tags are on record the moment the store took them: if the fields fail now, the next try still
    // knows which of the store's tags are Playbook's.
    const typed = now.type ? { product_type: now.type } : {};
    if (now.fields) await patch('pb_listings', here, { sent: { type: now.type || old, tags: now.tags, fields: was?.fields ?? {} }, ...typed });
    const cleared = now.fields ? emptied(now, was) : [];
    const f = now.fields ? await syncFields(site, id, fieldInputs(id, p, [], now.attrs), cleared, ms) : { notes: [], notIn: [], stayed: [], again: false };
    const sent = sentOf(now, was, f.notIn, f.stayed);
    if (f.again) { // the store did not answer for its fields: what it took is on record, the rest stays owed
      await patch('pb_listings', here, { sent, ...typed });
      throw new HttpError(504, f.notes.join(' '));
    }
    // What the store has now goes on record whatever happened meanwhile; the mark goes only if nothing did. Where
    // the stamp is gone (the product changed, or a newer send finished first and this older one reached the store
    // last), the listing is owed again and the next send goes whatever the record says.
    const row = { sent, ...typed, ...noteAfter(l, f.notes) };
    const done = (await patch('pb_listings', mine, { ...clear, ...row })).length > 0;
    if (!done) await patch('pb_listings', here, { ...row, facts_due: true, facts_force: true, facts_tried_at: null });
    // The listing shows the tags the store has; tags a person typed meanwhile are theirs.
    if (!sameTags(now.tags, l.tags || [])) await patch('pb_listings', `id=eq.${enc(l.id)}&locked=not.cs.${enc('{tags}')}`, { tags: now.tags });
    await logActivity({ ...who, action: 'facts_sent', details: {
      ...(now.type && now.type !== old ? { type: now.type, ...(old ? { was_type: old } : {}) } : {}), tags: now.tags,
      ...(now.fields ? { fields: Object.keys(sent.fields).length } : {}), ...(cleared.length ? { cleared } : {}),
      ...(l.facts_force ? { asked: true } : {}), ...(f.notes.length ? { warning: f.notes.join(' ') } : {}) } });
    return done ? 'done' : 'wait';
  } catch (e) {
    // The stamp stays, so it is tried again in 5 minutes: only the first failure in a row goes on the timeline.
    if (!c.facts_tried_at) await logActivity({ ...who, action: 'failed', details: { step: 'facts', error: plain(e) } }).catch(w => console.error(`pb-products facts log ${l.id}: ${plain(w)}`));
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
 *  that cannot answer is left for the next run, and so is one that refuses three products in a row (its key was
 *  rejected, it is frozen): one product that fails does not hold the others back, a store that refuses everything is
 *  not asked for every product it is owed. */
export async function sendFactsDue(limit: number, inTime: () => boolean, userId: string | null): Promise<number> {
  let n = 0;
  const down = new Set<string>(), fails = new Map<string, number>(), cols: ColCache = new Map();
  while (n < limit && inTime()) {
    const list = await factsCandidates(Math.min(PAGE, limit - n), [...down]), wasDown = down.size;
    let moved = 0;
    for (let i = 0; i < list.length && inTime(); i += AT_ONCE) {
      const part = list.slice(i, i + AT_ONCE).filter(l => !down.has(l.website_id));
      const res = await Promise.all(part.map(l => sendFacts(l, userId, cols, 10_000)));
      res.forEach((r, j) => {
        const w = part[j].website_id;
        if (r === 'done') { n++; moved++; fails.set(w, 0); }
        else if (r === 'failed') { moved++; fails.set(w, (fails.get(w) ?? 0) + 1); if (fails.get(w)! >= STORE_FAILS) down.add(w); }
        else if (r === 'busy') down.add(w);
      });
    }
    if (!moved && down.size === wasDown) break; // nothing left that can go now (a store that just failed: asked once more without it)
  }
  return n;
}
