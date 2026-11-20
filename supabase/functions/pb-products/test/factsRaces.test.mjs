// node --test --experimental-strip-types supabase/functions/pb-products/test/
// The small send of a product's type, tags and custom fields (factsSend.ts) under bad timing and half answers — what
// the code check of 20 Nov 2026 found before anything went live. Each test is one of its cases, over the fake Supabase
// and Shopify of factsWorld.mjs:
//   * a change that lands between the worker's page of candidates and the try is not lost (the try is stamped first
//     and reads everything fresh), nor is the button's "send anyway";
//   * an older send that reaches the store after a newer one leaves the listing owed;
//   * the record holds only what the store took: a field it did not take is sent again, one that could not be taken
//     off is taken off again, and a field that is the store's own is never Playbook's to delete;
//   * a store that refuses everything is not asked for every product it is owed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GID, world } from './factsWorld.mjs';

const { FACTS_NOTE, sendFacts, sendFactsDue } = await import('../factsSend.ts');
const send = (w, page) => sendFacts(page ?? { ...w.listing }, 'u1', new Map());
const nameOf = (init) => { try { return (/^\s*(?:query|mutation)\s+(\w+)/.exec(JSON.parse(init.body).query) || [])[1]; } catch { return ''; } };
/** Answer some Shopify calls differently: `on(name, init)` returns a Response, throws, or returns nothing (as usual). */
function shopify(on) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => (String(url).includes('myshopify') ? await on(nameOf(init), init) : null) ?? real(url, init);
}
const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
const again = (w) => Object.assign(w.listing, { facts_due: true, facts_tried_at: null }); // the mark, as the trigger writes it
const FULL = { type: 'Lehenga', tags: ['Lehenga', 'Maroon', 'Embroidery'], fields: { colour: 'Maroon', work: '["Embroidery"]' } };

test('the product changes after the worker read its page of candidates: the send reads it fresh, the change goes', async () => {
  const w = world();
  const page = { ...w.listing };                 // what the worker holds, up to 20 seconds old
  Object.assign(w.product, { category: 'Gown', color: 'Wine' }); w.values = [['Colour', 'Wine'], ['Work', 'Embroidery']];
  w.collections.push({ id: 'gid://shopify/Collection/3', handle: 'gown', title: 'Gown' });
  assert.equal(await send(w, page), 'done');
  assert.equal(w.store.productType, 'Gown');
  assert.deepEqual(w.store.tags, ['Gown', 'Wine', 'Embroidery', 'Typed In Shopify']);
  assert.deepEqual([w.listing.facts_due, w.listing.sent.type], [false, 'Gown']);
});

test('"Send tags and fields again" tapped after the worker read its page: it is sent anyway, not cleared as "nothing changed"', async () => {
  const w = world({ listing: { sent: FULL }, store: { id: GID, tags: ['Edited In Shopify'], productType: 'Something Else' } });
  const page = { ...w.listing };
  Object.assign(w.listing, { facts_due: true, facts_force: true, facts_tried_at: null }); // the button
  assert.equal(await send(w, page), 'done');
  assert.equal(w.store.productType, 'Lehenga');
  assert.deepEqual(w.store.tags, ['Lehenga', 'Maroon', 'Embroidery', 'Edited In Shopify']);
  assert.equal(w.listing.facts_force, false);
});

test('the stamp is gone when the send finishes (the product changed, or a newer send finished first): owed again, and the next send goes whatever the record says', async () => {
  const w = world({ onUpdate: (x) => Object.assign(x.listing, { facts_due: false, facts_tried_at: null }) }); // a newer send cleared the mark meanwhile
  assert.equal(await send(w), 'wait');
  assert.deepEqual([w.listing.facts_due, w.listing.facts_force, w.listing.facts_tried_at], [true, true, null]);
  assert.equal(w.listing.sent.type, 'Lehenga', 'what this send put on the store is on record');
  w.onUpdate = null;
  const before = w.shopify().length;
  assert.equal(await send(w), 'done');
  assert.ok(w.shopify().slice(before).some(c => c.name === 'PbFacts'), 'sent although the record equals the product');
});

test('the store does not answer for the fields: they are not on record, the listing stays owed and says so', async () => {
  const w = world();
  let down = true;
  shopify((name) => { if (down && name === 'PbFields') throw new DOMException('timeout', 'TimeoutError'); });
  assert.equal(await send(w), 'failed');
  assert.equal(w.listing.facts_due, true);
  assert.deepEqual(w.listing.sent, { type: 'Lehenga', tags: ['Lehenga', 'Maroon', 'Embroidery'], fields: {} }, 'the type and tags went, the fields did not');
  assert.ok(w.listing.error.startsWith(FACTS_NOTE));
  assert.deepEqual(w.activity.map(a => [a.action, a.details.step]), [['failed', 'facts']]);
  down = false; w.listing.facts_tried_at = new Date(Date.now() - 6 * 60_000).toISOString(); // five minutes later
  assert.equal(await send(w), 'done');
  assert.deepEqual(w.listing.sent.fields, FULL.fields);
  assert.deepEqual([w.listing.facts_due, w.listing.error], [false, null]);
});

test('an emptied field Shopify would not take off stays on record, so it is taken off again', async () => {
  const w = world({ values: [['Colour', 'Maroon']], listing: { sent: { type: 'Lehenga', tags: ['Lehenga', 'Maroon'], fields: { colour: 'Maroon', work: '["Zari"]' } } } });
  let refuse = true;
  shopify((name) => { if (refuse && name === 'PbFieldsDrop') return json({ data: { metafieldsDelete: { deletedMetafields: [], userErrors: [{ field: null, message: 'Internal error' }] } } }); });
  assert.equal(await send(w), 'done');
  assert.deepEqual(w.listing.sent.fields, { colour: 'Maroon', work: '["Zari"]' }, 'still there, still Playbook\'s');
  assert.match(w.listing.error, /these emptied custom fields stayed there: work/);
  refuse = false; again(w);
  const before = w.shopify().length;
  assert.equal(await send(w), 'done');
  assert.deepEqual(w.shopify().slice(before).find(c => c.name === 'PbFieldsDrop').v.metafields.map(m => m.key), ['work']);
  assert.deepEqual([w.listing.sent.fields, w.listing.error], [{ colour: 'Maroon' }, null], 'gone now, and the old warning with it');
});

test('a field that is the store\'s own (a kind no text goes in) is never on record, so it is never taken off', async () => {
  const w = world({ listing: { sent: null }, site: { id: 'eeeeeeee-0000-4000-8000-0000000000aa' } }); // its own website: the store's field kinds are kept per store
  w.listing.website_id = w.site.id;
  shopify((name) => { if (name === 'PbFieldKinds') return json({ data: { metafieldDefinitions: { nodes: [{ key: 'work', type: { name: 'list.metaobject_reference' } }] } } }); });
  assert.equal(await send(w), 'done');
  assert.deepEqual(w.shopify().find(c => c.name === 'PbFields').v.metafields.map(m => m.key), ['colour']);
  assert.deepEqual(w.listing.sent.fields, { colour: 'Maroon' });
  assert.match(w.listing.error, /did not take these custom fields: work/);
  w.values = [['Colour', 'Maroon']]; again(w); // the Work value is removed in Playbook
  await send(w);
  assert.ok(!w.names().includes('PbFieldsDrop'), 'the store\'s own field is left alone');
});

test('the fields fail after the type and tags went, then the product changes again: no old Playbook tag is left behind', async () => {
  const w = world(); // on record: Saree, Red. The product: a Maroon Lehenga
  let once = true;
  shopify((name) => { if (once && name === 'PbFields') { once = false; return json({}, 502); } });
  assert.equal(await send(w), 'busy');
  assert.deepEqual(w.listing.sent.tags, ['Lehenga', 'Maroon', 'Embroidery'], 'on record the moment the store took them');
  w.product.color = 'Wine'; w.values = [['Colour', 'Wine'], ['Work', 'Embroidery']]; again(w);
  assert.equal(await send(w), 'done');
  assert.deepEqual(w.store.tags, ['Lehenga', 'Wine', 'Embroidery', 'Typed In Shopify'], 'Maroon was Playbook\'s, and went');
});

test('a field warning goes once the store takes the field; another note on the listing is never touched', async () => {
  const warning = 'Saved on Shopify, but the store did not take these custom fields: work (Value does not exist in provided choices).';
  const w = world({ listing: { sent: FULL, facts_force: true, error: warning } });
  assert.equal(await send(w), 'done');
  assert.equal(w.listing.error, null);
  const both = world({ listing: { sent: FULL, facts_force: true, error: `${warning} Saved on Shopify, but the store did not take the change to its photos: check the photos there.` } });
  await send(both);
  assert.equal(both.listing.error, 'Saved on Shopify, but the store did not take the change to its photos: check the photos there.');
  const other = world({ listing: { sent: FULL, facts_force: true, error: 'Stock tracking is on for this website.' } });
  await send(other);
  assert.equal(other.listing.error, 'Stock tracking is on for this website.');
});

test('a store that refuses three products in a row is left for the next run: it is not asked for every product it is owed', async () => {
  const w = world({ refuse: 'Access denied' });
  const real = globalThis.fetch;
  let pages = 0;
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)), method = init.method || 'GET';
    if (method === 'GET' && u.includes('/pb_listings?facts_due=eq.true')) return json(pages++ ? [] : Array.from({ length: 9 }, (_, i) => ({ ...w.listing, id: `dddddddd-0000-4000-8000-00000000000${i + 1}` })));
    if (method === 'PATCH' && u.includes('or=(facts_tried_at')) w.listing.facts_tried_at = null; // each of the nine is its own row
    return real(url, init);
  };
  assert.equal(await sendFactsDue(60, () => true, null), 0);
  assert.equal(w.shopify().filter(c => c.name === 'PbFacts').length, 3, 'three tries, then the store waits for the next run');
});
