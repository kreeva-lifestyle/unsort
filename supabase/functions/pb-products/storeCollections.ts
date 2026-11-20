// A store's collections for Playbook's categories (owner, 17 Nov 2026: "make all collections as per categories in
// playbook"). Shopify fills each one itself from the product type, which is the category (storeFields.ts). Store
// setup makes them (storeSetup.ts). Since 20 Nov 2026 ("Category changes: a change does not reach products already
// on the store") they also follow a category change by themselves:
//   * ensureCollection — before a product on the store is given another product type (factsSend.ts): when the store
//     files by type (it has a collection for the old type) and has none for the new one, that collection is made
//     first, exactly as store setup makes it. A product is never re-typed out of a collection into none;
//   * renameCollections — a renamed category keeps its collection: the same page, address and menu links, under the
//     new name. It is given a second rule for the new product type and keeps the old one, so it holds the category's
//     products the whole time they are re-typed one by one, and a rename taken back only changes the title again.
//     (Tried on SuratMandi, 20 Nov 2026: a collection's rules add up — a product matching either one is in it.)
// Nothing is ever deleted on a store.
import { sel } from './db.ts';
import { HttpError, plain } from './http.ts';
import { toOnlineStore } from './publishParts.ts';
import { gql } from './shopify.ts';
import { type Have, collectionInput, sameCollection } from './storeFields.ts';
import { WEBSITE_COLS, type WebsiteRow } from './types.ts';

const COLLECTIONS = `query PbCols($after: String) { collections(first: 250, after: $after) { nodes { id handle title } pageInfo { hasNextPage endCursor } } }`;
const COL_CREATE = `mutation PbCol($c: CollectionCreateInput!) { collectionCreate(collection: $c) { collection { id handle } userErrors { field message } } }`;
const COL_RULES = `query PbColRules($id: ID!) { collection(id: $id) { id sources { id title } } }`;
const COL_UPDATE = `mutation PbColUpdate($c: CollectionUpdateInput!) { collectionUpdate(collection: $c) { collection { id title } userErrors { field message } } }`;
const MS = 30_000;

/** Every collection of the store (up to 2,000). */
export async function listCollections(site: WebsiteRow, ms = MS): Promise<Have[]> {
  const have: Have[] = [];
  for (let after: string | null = null, i = 0; i < 8; i++) {
    const r: { collections: { nodes: Have[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } = await gql(site, COLLECTIONS, { after }, ms);
    have.push(...r.collections.nodes);
    if (!r.collections.pageInfo.hasNextPage) break;
    after = r.collections.pageInfo.endCursor;
  }
  return have;
}

/** Make the category's collection and show it on the Online Store (a collection is hidden from shoppers until it is on
 *  a channel). `made` null: Shopify refused, `note` says why. `note` with `made`: made, but not shown yet. */
export async function makeCollection(site: WebsiteRow, category: string, ms = MS): Promise<{ made: Have | null; note?: string }> {
  const r = await gql<{ collectionCreate: { collection: { id: string; handle: string } | null; userErrors: { message: string }[] } }>(site, COL_CREATE, { c: collectionInput(category) }, ms);
  const made = r.collectionCreate.collection, ue = r.collectionCreate.userErrors;
  if (!made || ue.length) return { made: null, note: ue.map(e => e.message).join('; ').slice(0, 200) || 'Shopify did not make it.' };
  const shown = await toOnlineStore(site, made.id, ms);
  return { made: { id: made.id, handle: made.handle, title: category }, ...(shown ? { note: shown.replace(/^Saved on Shopify, but it/, 'Made, but it') } : {}) };
}

/** One store's collections, read once per worker run (keyed by website and shop: a store move keeps the website's id). */
export type ColCache = Map<string, Have[]>;

/** One store at a time: two listings sent side by side must not both find the collection missing and make it twice. */
const turns = new Map<string, Promise<unknown>>();

/** Before a product's type changes on the store from `was` to `type`. Throws when the collection it should fall into
 *  could not be made: the product then keeps its old type, and its old collection, until the next try. */
export function ensureCollection(site: WebsiteRow, type: string, was: string, cache: ColCache, ms = MS): Promise<void> {
  if (!type || type === was) return Promise.resolve();
  const key = `${site.id}|${String(site.shop_domain || '').trim().toLowerCase()}`;
  const mine = (turns.get(key) ?? Promise.resolve()).then(async () => {
    let have = cache.get(key);
    if (!have) { have = await listCollections(site, ms); cache.set(key, have); }
    if (sameCollection(have, type)) return;
    if (!was || !sameCollection(have, was)) return; // this store does not file that type in a collection: nothing to keep whole
    const r = await makeCollection(site, type, ms);
    if (!r.made) throw new HttpError(400, `${site.name}: Shopify did not make the collection for ${type} (${r.note}), so the product keeps its old product type for now.`);
    have.push(r.made);
  });
  turns.set(key, mine.catch(() => undefined));
  return mine;
}

export interface StoreRename { website: string; status: 'renamed' | 'kept' | 'none' | 'failed'; note?: string }

/** A category was renamed `from` → `to`: on every website that is switched on, its collection takes the new name.
 *  'none': the store has no collection for it; 'kept': the new name has a collection of its own already (products move
 *  over as they are re-typed). Never throws: the rename itself is done, and a store that fails is said in its row —
 *  ensureCollection then makes a collection for the new name when the first product is re-typed. */
export async function renameCollections(from: string, to: string): Promise<StoreRename[]> {
  const out: StoreRename[] = [];
  let sites: WebsiteRow[] = [];
  try { sites = await sel<WebsiteRow>(`pb_websites?active=eq.true&connected_at=not.is.null&select=${WEBSITE_COLS}&order=name.asc`); }
  catch (e) { return [{ website: 'The websites', status: 'failed', note: plain(e).slice(0, 200) }]; }
  for (const site of sites) {
    try {
      const have = await listCollections(site);
      const old = sameCollection(have, from), other = sameCollection(have, to);
      if (!old) { out.push({ website: site.name, status: 'none' }); continue; }
      if (other && other.id !== old.id) { out.push({ website: site.name, status: 'kept' }); continue; }
      const rules = (await gql<{ collection: { sources: { id: string; title: string }[] } | null }>(site, COL_RULES, { id: old.id }, MS)).collection?.sources || [];
      const want = collectionInput(to).sources, title = want[0].source.title.trim().toLowerCase();
      const r = await gql<{ collectionUpdate: { userErrors: { message: string }[] } | null }>(site, COL_UPDATE,
        { c: { id: old.id, title: to, ...(rules.some(s => s.title.trim().toLowerCase() === title) ? {} : { sourcesToCreate: want }) } }, MS);
      const ue = r.collectionUpdate?.userErrors || [];
      out.push(ue.length ? { website: site.name, status: 'failed', note: ue.map(e => e.message).join('; ').slice(0, 200) } : { website: site.name, status: 'renamed' });
    } catch (e) { out.push({ website: site.name, status: 'failed', note: plain(e).slice(0, 200) }); }
  }
  return out;
}
