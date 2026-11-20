// node --test --experimental-strip-types supabase/functions/pb-products/test/
// Collections follow a category change (storeCollections.ts), and the website's button "Send tags and fields again"
// (factsSite.ts). Owner, 20 Nov 2026: "Category changes: a change does not reach products already on the store."
// A product must never be re-typed out of its collection into none, and a renamed category keeps its collection page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GID, W, world } from './factsWorld.mjs';

const { sendFacts } = await import('../factsSend.ts');
const { renameCollections } = await import('../storeCollections.ts');
const { storesThenDatabase } = await import('../categoryMove.ts');
const { resendWebsite } = await import('../factsSite.ts');
const send = (w) => sendFacts({ ...w.listing }, 'u1', new Map());
const SAREE = { id: 'gid://shopify/Collection/1', handle: 'saree', title: 'Saree' };
const one = (...c) => c.map(x => ({ ...x }));

test('the store has a collection for the new category: the product is re-typed, nothing is made', async () => {
  const w = world();
  assert.equal(await send(w), 'done');
  assert.ok(!w.names().includes('PbCol'));
  assert.equal(w.store.productType, 'Lehenga');
});

test('the store files by type and has no collection for the new category: it is made first, and shown, then the product moves', async () => {
  const w = world({ collections: one(SAREE) });
  assert.equal(await send(w), 'done');
  const names = w.shopify().map(c => c.name);
  assert.ok(names.indexOf('PbCol') > -1 && names.indexOf('PbCol') < names.indexOf('PbFacts'), 'the collection before the product type');
  assert.deepEqual(w.collections.map(c => c.title), ['Saree', 'Lehenga']);
  assert.equal(w.shopify().find(c => c.name === 'PbCol').v.c.sources[0].source.inclusion.conditions[0].productType.values[0], 'Lehenga');
  assert.ok(names.includes('PbPublish'), 'a collection is hidden from shoppers until it is on the Online Store');
});

test('the collection cannot be made: the product keeps its old type and its old collection, and is tried again', async () => {
  const w = world({ collections: one(SAREE), noCollection: 'Title has already been taken' });
  assert.equal(await send(w), 'failed');
  assert.ok(!w.names().includes('PbFacts'), 'never re-typed into no collection');
  assert.equal(w.store.productType, 'Saree');
  assert.equal(w.listing.facts_due, true);
  assert.match(w.activity[0].details.error, /did not make the collection for Lehenga \(Title has already been taken\)/);
});

test('a store that does not file this type in a collection gets the type without one', async () => {
  const w = world({ collections: [] });
  assert.equal(await send(w), 'done');
  assert.ok(!w.names().includes('PbCol'));
  assert.equal(w.store.productType, 'Lehenga');
});

test('a renamed category keeps its collection: new title, a rule for the new name beside the old one', async () => {
  const w = world({ collections: one(SAREE), rules: { [SAREE.id]: [{ id: 'r0', title: 'Product type Saree' }] } });
  assert.deepEqual(await renameCollections('Saree', 'Silk Saree'), [{ website: 'Kreeva', status: 'renamed' }]);
  const c = w.shopify().find(x => x.name === 'PbColUpdate').v.c;
  assert.deepEqual([c.id, c.title], [SAREE.id, 'Silk Saree']);
  assert.equal(c.sourcesToCreate[0].source.inclusion.conditions[0].productType.values[0], 'Silk Saree');
  assert.deepEqual(w.rules[SAREE.id].map(r => r.title), ['Product type Saree', 'Product type Silk Saree'], 'the old rule stays: products of both names are in it meanwhile');
  assert.equal(w.collections[0].handle, 'saree', 'its address and menu links stay');
  // Taken back: the same collection (found by its address), only the title changes again.
  w.calls.length = 0;
  assert.deepEqual(await renameCollections('Silk Saree', 'Saree'), [{ website: 'Kreeva', status: 'renamed' }]);
  const back = w.shopify().find(x => x.name === 'PbColUpdate').v.c;
  assert.deepEqual([back.id, back.title, 'sourcesToCreate' in back], [SAREE.id, 'Saree', false]);
});

test('renaming on a store with nothing to rename, with a collection for the new name already, or that refuses', async () => {
  world({ collections: [] });
  assert.deepEqual(await renameCollections('Saree', 'Silk Saree'), [{ website: 'Kreeva', status: 'none' }]);
  const both = world({ collections: one(SAREE, { id: 'gid://shopify/Collection/9', handle: 'silk-saree', title: 'Silk Saree' }) });
  assert.deepEqual(await renameCollections('Saree', 'Silk Saree'), [{ website: 'Kreeva', status: 'kept' }]);
  assert.ok(!both.names().includes('PbColUpdate'));
  world({ collections: one(SAREE), refuse: 'Title is too long' });
  assert.deepEqual(await renameCollections('Saree', 'Silk Saree'), [{ website: 'Kreeva', status: 'failed', note: 'Title is too long' }]);
  world({ collections: one(SAREE), down: true }); // never throws: the rename in Playbook is already done
  const r = await renameCollections('Saree', 'Silk Saree');
  assert.equal(r[0].status, 'failed');
  world({ site: { active: false } });
  assert.deepEqual(await renameCollections('Saree', 'Silk Saree'), [], 'a website that is off is sent nothing');
});

test('a rename: the store\'s collection first, then the database; no send in between can find it missing and make a second one', async () => {
  const w = world({ categories: ['Saree', 'Lehenga'], collections: one(SAREE), product: { category: 'Silk Saree' }, values: [], site: { tag_rules: { templates: ['{category}'], max_tags: 8, case: 'title' } } });
  const order = [];
  const { r, stores } = await storesThenDatabase('Saree', 'Silk Saree', async () => {
    order.push(...w.shopify().map(c => c.name)); // what the store was asked before the database was
    return send(w);                              // the worker gets to a product the moment the database has renamed it
  });
  assert.ok(order.includes('PbColUpdate'), 'the collection has the new name before any product is owed it');
  assert.deepEqual([r, stores], ['done', [{ website: 'Kreeva', status: 'renamed' }]]);
  assert.ok(!w.names().includes('PbCol'), 'no second collection');
  assert.deepEqual(w.collections.map(c => [c.handle, c.title]), [['saree', 'Silk Saree']]);
  assert.equal(w.store.productType, 'Silk Saree');
});

test('a rename the database refuses after the stores: the collection gets its title back', async () => {
  const w = world({ categories: ['Saree', 'Lehenga'], collections: one(SAREE) });
  await assert.rejects(storesThenDatabase('Saree', 'Silk Saree', async () => { throw new Error('Tags are still linked to the name Silk Saree.'); }), /still linked/);
  assert.deepEqual(w.shopify().filter(c => c.name === 'PbColUpdate').map(c => c.v.c.title), ['Silk Saree', 'Saree']);
  assert.equal(w.collections[0].title, 'Saree');
  // One the database will refuse for its list (the new name is taken) never reaches a store.
  const taken = world({ categories: ['Saree', 'Lehenga'], collections: one(SAREE) });
  await assert.rejects(storesThenDatabase('Saree', 'Lehenga', async () => { throw new Error('Lehenga is already in the list.'); }));
  assert.equal(taken.shopify().length, 0);
});

test('this run\'s list of collections is minutes old and the collection was renamed meanwhile: asked again before one is made, none is made', async () => {
  const w = world({ collections: [{ id: SAREE.id, handle: 'saree', title: 'Lehenga' }] }); // renamed Saree → Lehenga a moment ago
  const stale = new Map([[`${W}|kreeva.myshopify.com`, one(SAREE)]]);                      // what the run read before that
  assert.equal(await sendFacts({ ...w.listing }, 'u1', stale), 'done');
  assert.ok(!w.names().includes('PbCol'), 'no second "Lehenga"');
  assert.equal(w.store.productType, 'Lehenga');
});

test('"Send tags and fields again": first only the number, then every product of the website on Shopify is marked', async () => {
  const w = world({ count: 503, listing: { facts_due: false } });
  assert.deepEqual(await resendWebsite({ website_id: W, dry: true }, 'u1'), { ok: true, dry: true, listings: 503, active: true });
  assert.ok(!w.calls.some(c => c.name.startsWith('PATCH')), 'a dry run changes nothing');
  assert.deepEqual(await resendWebsite({ website_id: W }, 'u1'), { ok: true, listings: 503 });
  const mark = w.calls.find(c => c.name === 'PATCH pb_listings');
  assert.deepEqual(mark.body, { facts_due: true, facts_force: true, facts_tried_at: null });
  assert.ok(mark.path.includes(`website_id=eq.${W}`) && mark.path.includes('shopify_product_id=not.is.null'), 'only this website, only what is on sale on Shopify');
  assert.deepEqual(w.activity.map(a => [a.action, a.details.listings]), [['facts_resend_site', 503]]);
  assert.equal(await send(w), 'done');
  assert.equal(w.listing.facts_force, false);
  assert.equal(w.store.productType, 'Lehenga');
  assert.ok(GID);
});

test('"Send tags and fields again" on a website that is off, or with nothing on Shopify', async () => {
  world({ site: { active: false } });
  await assert.rejects(resendWebsite({ website_id: W }, 'u1'), /Kreeva is switched off, and a website that is off is sent nothing/);
  const none = world({ count: 0 });
  assert.deepEqual(await resendWebsite({ website_id: W }, 'u1'), { ok: true, listings: 0 });
  assert.ok(!none.calls.some(c => c.name.startsWith('PATCH')));
  await assert.rejects(resendWebsite({ website_id: 'nope' }, 'u1'), /website_id is missing or not valid/);
});
