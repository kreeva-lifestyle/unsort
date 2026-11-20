// A store's collections for Playbook's categories (owner, 17 Nov 2026: "make all collections as per categories in
// playbook"). Shopify fills each one itself from the product type, which is the category (storeFields.ts). Store
// setup makes them (storeSetup.ts). Since 20 Nov 2026 ("Category changes: a change does not reach products already
// on the store") they also follow a category change by themselves:
//   * ensureCollection — before a product on the store is given another product type (factsSend.ts): when the store
//     files by type (it has a collection for the old type) and has none for the new one, that collection is made
//     first, exactly as store setup makes it — or, when the old name is gone from Playbook (a rename the store missed:
//     it failed then, or its website was off), the old collection takes the new name as a rename gives it; and a
//     collection still titled after a name that is gone (a rename taken back that the store missed) takes the title of
//     the type it files. A product is never re-typed out of a collection into none;
//   * renameCollections — a renamed category keeps its collection: the same page, address and menu links, under the
//     new name. It is given a second rule for the new product type and keeps the old one, so it holds the category's
//     products the whole time they are re-typed one by one, and a rename taken back only changes the title again.
//     (Tried on SuratMandi, 20 Nov 2026: a collection's rules add up — a product matching either one is in it.)
//     It runs BEFORE the database renames the products (categoryMove.ts): the moment a product is owed its new type,
//     the collection for it is already there, so no send can find it missing and make a second one.
// A category's collection is the one that FILES its products (a rule on the product type), whatever it is called:
// storeFields.ts sameCollection. Nothing is ever deleted on a store, a rule included.
import { countRows, enc, one, sel } from './db.ts';
import { HttpError, plain } from './http.ts';
import { toOnlineStore } from './publishParts.ts';
import { gql } from './shopify.ts';
import { type Have, collectionInput, filesType, namedFor, sameCollection } from './storeFields.ts';
import { WEBSITE_COLS, type WebsiteRow } from './types.ts';

const COLLECTIONS = `query PbCols($after: String) { collections(first: 100, after: $after) { nodes { id handle title
  sources { id title ... on CollectionConditionsSource { inclusion { conditions { __typename ... on CollectionSourceInclusionConditionProductType { relation values } } } } } }
  pageInfo { hasNextPage endCursor } } }`;
const COL_CREATE = `mutation PbCol($c: CollectionCreateInput!) { collectionCreate(collection: $c) { collection { id handle } userErrors { field message } } }`;
const COL_UPDATE = `mutation PbColUpdate($c: CollectionUpdateInput!) { collectionUpdate(collection: $c) { collection { id title } userErrors { field message } } }`;
const MS = 30_000;
interface Source { id: string; title: string; inclusion?: { conditions?: { relation?: string; values?: string[] | null }[] | null } | null }
interface Node { id: string; handle: string; title: string; sources?: Source[] | null }

/** Every collection of the store (up to 2,000), each with the product types its rules file. */
export async function listCollections(site: WebsiteRow, ms = MS): Promise<Have[]> {
  const have: Have[] = [];
  for (let after: string | null = null, i = 0; i < 20; i++) {
    const r: { collections: { nodes: Node[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } = await gql(site, COLLECTIONS, { after }, ms);
    for (const c of r.collections.nodes) {
      have.push({ id: c.id, handle: c.handle, title: c.title, rules: (c.sources || []).map(x => ({ id: x.id, title: x.title,
        types: (x.inclusion?.conditions || []).filter(k => k.relation === 'EQUALS').flatMap(k => k.values || []) })) });
    }
    if (!r.collections.pageInfo.hasNextPage) break;
    after = r.collections.pageInfo.endCursor;
  }
  return have;
}

/** Make the category's collection and show it on the Online Store (a collection is hidden from shoppers until it is on
 *  a channel). `made` null: Shopify refused, `note` says why. `note` with `made`: made, but not shown yet. */
export async function makeCollection(site: WebsiteRow, category: string, ms = MS): Promise<{ made: Have | null; note?: string }> {
  const input = collectionInput(category);
  const r = await gql<{ collectionCreate: { collection: { id: string; handle: string } | null; userErrors: { message: string }[] } }>(site, COL_CREATE, { c: input }, ms);
  const made = r.collectionCreate.collection, ue = r.collectionCreate.userErrors;
  if (!made || ue.length) return { made: null, note: ue.map(e => e.message).join('; ').slice(0, 200) || 'Shopify did not make it.' };
  const shown = await toOnlineStore(site, made.id, ms);
  return { made: { id: made.id, handle: made.handle, title: category, rules: [{ id: '', title: input.sources[0].source.title, types: [category] }] }, ...(shown ? { note: shown.replace(/^Saved on Shopify, but it/, 'Made, but it') } : {}) };
}

/** One store's collections, read once per worker run (keyed by website and shop: a store move keeps the website's id). */
export type ColCache = Map<string, Have[]>;

/** One store at a time: two listings sent side by side must not both find the collection missing and make it twice. */
const turns = new Map<string, Promise<unknown>>();

/** Is this category name gone from Playbook: off the list, and no product filed under it? What a rename leaves of the
 *  old name (and a move that also took the name off the list). */
async function nameGone(name: string): Promise<boolean> {
  const v = (await one<{ value: unknown }>('pb_settings?key=eq.categories&select=value'))?.value;
  if ((Array.isArray(v) ? v.map(String) : []).some(c => c.trim().toLowerCase() === name.trim().toLowerCase())) return false;
  return (await countRows(`pb_products?select=id&category=eq.${enc(name)}`)) === 0;
}

/** Before a product's type changes on the store from `was` to `type`. Throws when the collection it should fall into
 *  could not be made: the product then keeps its old type, and its old collection, until the next try. */
export function ensureCollection(site: WebsiteRow, type: string, was: string, cache: ColCache, ms = MS): Promise<void> {
  if (!type || type === was) return Promise.resolve();
  const key = `${site.id}|${String(site.shop_domain || '').trim().toLowerCase()}`;
  const mine = (turns.get(key) ?? Promise.resolve()).then(async () => {
    let have = cache.get(key);
    if (!have) { have = await listCollections(site, ms); cache.set(key, have); }
    const found = sameCollection(have, type);
    if (found) {
      // It files this type but is still titled after the name being left (a rename taken back that the store missed):
      // once that name is gone from Playbook, this very collection takes the title of the type it files. Only the
      // title: the product files there already, so a failure here never holds the product back.
      const t = found.title.trim().toLowerCase();
      if (was && t === was.trim().toLowerCase() && t !== type.trim().toLowerCase()) {
        try {
          if (await nameGone(was)) {
            const r = await gql<{ collectionUpdate: { userErrors: { message: string }[] } | null }>(site, COL_UPDATE, { c: { id: found.id, title: type } }, ms);
            const ue = r.collectionUpdate?.userErrors || [];
            if (ue.length) console.error(`pb-products collection title ${site.name}: ${ue.map(e => e.message).join('; ')}`);
            else found.title = type;
          }
        } catch (e) { console.error(`pb-products collection title ${site.name}: ${plain(e)}`); }
      }
      return;
    }
    if (!was || !sameCollection(have, was)) return; // this store does not file that type in a collection: nothing to keep whole
    // Asked again right before one is made: this run's list can be minutes old, and a rename may have given the old
    // collection this very name meanwhile (code check, 20 Nov 2026: a second collection of the same name).
    have = await listCollections(site, ms); cache.set(key, have);
    if (sameCollection(have, type) || !sameCollection(have, was)) return;
    // The old name is gone from Playbook: this is a rename the store missed. Its collection takes the new name.
    if (await nameGone(was)) {
      const r = await renameOn(site, have, was, type, ms);
      if (r.status === 'failed') throw new HttpError(400, `${site.name}: Shopify did not rename the collection of ${was} to ${type} (${r.note}), so the product keeps its old product type for now.`);
      cache.delete(key); // read again by the next listing: it has the new name and rule now
      return;
    }
    const r = await makeCollection(site, type, ms);
    if (!r.made) throw new HttpError(400, `${site.name}: Shopify did not make the collection for ${type} (${r.note}), so the product keeps its old product type for now.`);
    have.push(r.made);
  });
  turns.set(key, mine.catch(() => undefined));
  return mine;
}

export interface StoreRename { website: string; status: 'renamed' | 'kept' | 'none' | 'failed'; note?: string }

/** One store: the collection that files `from` also files `to` from now on (a second rule; the old one stays), and
 *  takes the new title when its title was the old name (a title of the store's own, "Sarees", stays). 'none': the store
 *  has no collection for it; 'kept': the new name has a collection of its own that files it (products move over as
 *  they are re-typed) — one that merely carries the name, or files the type among others, does not stop the rename. */
async function renameOn(site: WebsiteRow, have: Have[], from: string, to: string, ms = MS): Promise<StoreRename> {
  const old = sameCollection(have, from);
  if (!old) return { website: site.name, status: 'none' };
  if (have.some(c => c.id !== old.id && namedFor(c, to) && filesType(c, to))) return { website: site.name, status: 'kept' };
  const title = old.title.trim().toLowerCase() === from.trim().toLowerCase() && old.title !== to;
  const rule = !(old.rules || []).some(r => r.types.includes(to)); // exactly, capitals included: right whether or not Shopify minds them
  if (!title && !rule) return { website: site.name, status: 'renamed' };
  const r = await gql<{ collectionUpdate: { userErrors: { message: string }[] } | null }>(site, COL_UPDATE,
    { c: { id: old.id, ...(title ? { title: to } : {}), ...(rule ? { sourcesToCreate: collectionInput(to).sources } : {}) } }, ms);
  const ue = r.collectionUpdate?.userErrors || [];
  return ue.length ? { website: site.name, status: 'failed', note: ue.map(e => e.message).join('; ').slice(0, 200) } : { website: site.name, status: 'renamed' };
}

/** A category is renamed `from` → `to`: on every website that is switched on, its collection takes the new name
 *  (renameOn). Never throws: a store that fails is said in its row, and the rename goes on — ensureCollection then
 *  gives the collection its new name when the first product is re-typed. */
export async function renameCollections(from: string, to: string): Promise<StoreRename[]> {
  const out: StoreRename[] = [];
  let sites: WebsiteRow[] = [];
  try { sites = await sel<WebsiteRow>(`pb_websites?active=eq.true&connected_at=not.is.null&select=${WEBSITE_COLS}&order=name.asc`); }
  catch (e) { return [{ website: 'The websites', status: 'failed', note: plain(e).slice(0, 200) }]; }
  for (const site of sites) {
    try { out.push(await renameOn(site, await listCollections(site), from, to)); }
    catch (e) { out.push({ website: site.name, status: 'failed', note: plain(e).slice(0, 200) }); }
  }
  return out;
}
