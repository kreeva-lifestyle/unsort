// store_setup { website_id } (admin / manager, the website's Connection section; owner, 2026-11-17: "make all
// collections as per categories in playbook" and "Product Specifications & Custom Attributes (Metafields) as per
// playbook", for SuratMandi). On the website's store, with what storeFields.ts describes:
//   1. a product field (metafield definition, namespace `custom`, pinned, readable by the theme) for each Playbook
//      attribute, plus set_contents and faq — one the store already has is kept; one with the same key but another
//      kind of field is reported (Shopify cannot change a field's kind; the owner deletes it in Settings → Custom data);
//   2. a collection for each Playbook category, filled by Shopify from the product type (the category) and shown on
//      the Online Store — one already there by handle or title is kept as it is.
// Nothing is deleted or changed on the store, so tapping it again only adds what is new (a new category or
// attribute). Each item is tried on its own: one Shopify refuses does not stop the rest. Fields go first, so a store
// whose app lacks a permission says so before any collection is made.
import { uuid, type Body } from './actions.ts';
import { enc, logActivity, one } from './db.ts';
import { HttpError, plain } from './http.ts';
import { toOnlineStore } from './publishParts.ts';
import { gql } from './shopify.ts';
import { type FieldDef, type Have, collectionInput, fieldDefs, sameCollection } from './storeFields.ts';
import { loadTaxonomy } from './taxonomy.ts';
import { WEBSITE_COLS, type WebsiteRow } from './types.ts';

type Status = 'made' | 'kept' | 'clash' | 'failed';
export interface SetupItem { name: string; status: Status; note?: string }

const DEFS = `query PbDefs { metafieldDefinitions(first: 250, ownerType: PRODUCT, namespace: "custom") { nodes { key name type { name } } } }`;
const DEF_CREATE = `mutation PbDef($d: MetafieldDefinitionInput!) { metafieldDefinitionCreate(definition: $d) { createdDefinition { id } userErrors { field message code } } }`;
const COLLECTIONS = `query PbCols($after: String) { collections(first: 250, after: $after) { nodes { id handle title } pageInfo { hasNextPage endCursor } } }`;
const COL_CREATE = `mutation PbCol($c: CollectionCreateInput!) { collectionCreate(collection: $c) { collection { id handle } userErrors { field message } } }`;
const MS = 30_000;
/** A failure of the store itself (credentials, a permission, frozen, busy): said once, not item by item. Shopify's
 *  answer about one item ("Shopify said …") is that item's note. */
const storeWide = (e: unknown) => !(e instanceof HttpError && e.status === 400 && /: Shopify said "/.test(e.message));

async function fields(site: WebsiteRow, defs: FieldDef[]): Promise<SetupItem[]> {
  const have = (await gql<{ metafieldDefinitions: { nodes: { key: string; name: string; type: { name: string } }[] } }>(site, DEFS, {}, MS)).metafieldDefinitions.nodes;
  const out: SetupItem[] = [];
  for (const d of defs) {
    const there = have.find(h => h.key === d.key);
    if (there) {
      out.push(there.type.name === d.type ? { name: d.name, status: 'kept' }
        : { name: d.name, status: 'clash', note: `The store already has a field custom.${d.key} of another kind (${there.type.name}). Delete it in Shopify → Settings → Custom data → Products, then tap Set up again.` });
      continue;
    }
    try {
      const r = await gql<{ metafieldDefinitionCreate: { userErrors: { message: string }[] } }>(site, DEF_CREATE, { d: {
        name: d.name, namespace: 'custom', key: d.key, type: d.type, description: d.description, ownerType: 'PRODUCT', pin: true, access: { storefront: 'PUBLIC_READ' },
      } }, MS);
      const ue = r.metafieldDefinitionCreate.userErrors;
      out.push(ue.length ? { name: d.name, status: 'failed', note: ue.map(e => e.message).join('; ').slice(0, 200) } : { name: d.name, status: 'made' });
    } catch (e) {
      if (storeWide(e)) throw e;
      out.push({ name: d.name, status: 'failed', note: plain(e).slice(0, 200) });
    }
  }
  return out;
}

async function collections(site: WebsiteRow, categories: string[]): Promise<SetupItem[]> {
  const have: Have[] = [];
  for (let after: string | null = null, i = 0; i < 8; i++) { // up to 2,000 collections
    const r: { collections: { nodes: Have[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } = await gql(site, COLLECTIONS, { after }, MS);
    have.push(...r.collections.nodes);
    if (!r.collections.pageInfo.hasNextPage) break;
    after = r.collections.pageInfo.endCursor;
  }
  const out: SetupItem[] = [];
  for (const c of categories) {
    if (sameCollection(have, c)) { out.push({ name: c, status: 'kept' }); continue; }
    try {
      const r = await gql<{ collectionCreate: { collection: { id: string; handle: string } | null; userErrors: { message: string }[] } }>(site, COL_CREATE, { c: collectionInput(c) }, MS);
      const made = r.collectionCreate.collection, ue = r.collectionCreate.userErrors;
      if (!made || ue.length) { out.push({ name: c, status: 'failed', note: ue.map(e => e.message).join('; ').slice(0, 200) || 'Shopify did not make it.' }); continue; }
      have.push({ id: made.id, handle: made.handle, title: c });
      const shown = await toOnlineStore(site, made.id, MS); // a collection is hidden from shoppers until it is on a channel
      out.push(shown ? { name: c, status: 'made', note: shown.replace(/^Saved on Shopify, but it/, 'Made, but it') } : { name: c, status: 'made' });
    } catch (e) {
      if (storeWide(e)) throw e;
      out.push({ name: c, status: 'failed', note: plain(e).slice(0, 200) });
    }
  }
  return out;
}

export async function storeSetup(b: Body, userId: string | null) {
  const site = await one<WebsiteRow>(`pb_websites?id=eq.${enc(uuid(b.website_id, 'website_id'))}&select=${WEBSITE_COLS}`);
  if (!site) throw new HttpError(404, 'That website no longer exists.');
  const tax = await loadTaxonomy();
  const f = await fields(site, fieldDefs(tax.attrs.map(a => ({ key: a.key, name: a.name, multi: a.multi }))));
  const c = await collections(site, tax.categories);
  const n = (list: SetupItem[], s: Status) => list.filter(x => x.status === s).length;
  await logActivity({ website_id: site.id, action: 'store_setup', user_id: userId, details: {
    fields_made: n(f, 'made'), fields_kept: n(f, 'kept'), fields_clash: n(f, 'clash'), fields_failed: n(f, 'failed'),
    collections_made: n(c, 'made'), collections_kept: n(c, 'kept'), collections_failed: n(c, 'failed'),
  } });
  return { ok: true, fields: f, collections: c };
}
