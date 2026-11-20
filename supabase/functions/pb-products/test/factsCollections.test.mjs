// node --test --experimental-strip-types supabase/functions/pb-products/test/
// Which collection is a category's (storeFields.ts sameCollection: the one that FILES its products, whatever it is
// called), and the collections healing themselves after a rename the store missed (storeCollections.ts). Code check
// of 20 Nov 2026: SuratMandi's own collection for sarees has another address and title, and was not recognised.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world } from './factsWorld.mjs';

const { sendFacts } = await import('../factsSend.ts');
const { renameCollections } = await import('../storeCollections.ts');
const { sameCollection } = await import('../storeFields.ts');
const send = (w) => sendFacts({ ...w.listing }, 'u1', new Map());
const SAREE = { id: 'gid://shopify/Collection/1', handle: 'saree', title: 'Saree' };
const one = (...c) => c.map(x => ({ ...x }));

// SuratMandi's own collection for sarees, as read from the store on 20 Nov 2026: another address and title, filled by product type.
const SAREES = { id: 'gid://shopify/Collection/7', handle: 'sarees', title: 'Sarees' }, AUTO = { [SAREES.id]: [{ id: 's1', title: 'Auto rule', types: ['Saree'] }] };
const LEHENGA = { id: 'gid://shopify/Collection/2', handle: 'lehenga', title: 'Lehenga' };

test('a category\'s collection is the one that files its products, whatever it is called: no second "Saree" is made', async () => {
  const hand = { id: 's1', handle: 'saree-sale', title: 'Saree', rules: [] }, auto = { ...SAREES, rules: [{ id: 'r', title: 'Auto rule', types: ['Saree'] }] };
  assert.equal(sameCollection([hand, auto], 'Saree').id, SAREES.id, 'the one filled by product type Saree, not the hand-picked one that carries the name');
  assert.equal(sameCollection([hand], 'Saree').id, 's1', 'with nothing that files it, the name still counts');
  const w = world({ collections: one(SAREES, LEHENGA), rules: { ...AUTO }, product: { category: 'Saree' }, listing: { product_type: 'Lehenga', sent: { type: 'Lehenga', tags: [], fields: {} } } });
  assert.equal(await send(w), 'done'); // a product corrected from Lehenga to Saree
  assert.ok(!w.names().includes('PbCol'), 'the store\'s own "Sarees" files product type Saree');
  assert.equal(w.store.productType, 'Saree');
});

test('renaming a category whose collection has a name of the store\'s own: it gets the rule for the new name and keeps its title', async () => {
  const w = world({ collections: one(SAREES, LEHENGA), rules: { ...AUTO } });
  assert.deepEqual(await renameCollections('Saree', 'Silk Saree'), [{ website: 'Kreeva', status: 'renamed' }]);
  const c = w.shopify().find(x => x.name === 'PbColUpdate').v.c;
  assert.deepEqual([c.id, 'title' in c, c.sourcesToCreate[0].source.inclusion.conditions[0].productType.values], [SAREES.id, false, ['Silk Saree']]);
  assert.equal(w.collections[0].title, 'Sarees');
  // The products stay inside while they are re-typed: no collection is made for the new name.
  Object.assign(w.product, { category: 'Silk Saree' }); Object.assign(w.listing, { product_type: 'Saree', sent: { type: 'Saree', tags: [], fields: {} } });
  assert.equal(await send(w), 'done');
  assert.ok(!w.names().includes('PbCol'));
});

test('a collection that merely carries the new name (hand-picked, no rule) does not stop a rename; one that files the new name does', async () => {
  const manual = { id: 'gid://shopify/Collection/9', handle: 'silk-saree', title: 'Silk Saree' };
  const w = world({ collections: one(SAREE, manual), rules: { [manual.id]: [] } });
  assert.deepEqual(await renameCollections('Saree', 'Silk Saree'), [{ website: 'Kreeva', status: 'renamed' }], 'else the products would end in no collection');
  assert.deepEqual(w.rules[SAREE.id].map(r => r.title), ['Product type Saree', 'Product type Silk Saree']);
  world({ collections: one(SAREE, manual) }); // here it files its own name
  assert.deepEqual(await renameCollections('Saree', 'Silk Saree'), [{ website: 'Kreeva', status: 'kept' }]);
});

test('a rename the store missed (it failed then, or the website was off): the first product re-typed gives the old collection its new name, none is made', async () => {
  const w = world({ categories: ['Silk Saree', 'Lehenga'], collections: one(SAREE), product: { category: 'Silk Saree' }, listing: { product_type: 'Saree', sent: { type: 'Saree', tags: [], fields: {} } } });
  assert.equal(await send(w), 'done');
  assert.ok(!w.names().includes('PbCol'), 'no second collection beside the old one');
  assert.deepEqual([w.collections[0].handle, w.collections[0].title, w.rules[SAREE.id].map(r => r.title)], ['saree', 'Silk Saree', ['Product type Saree', 'Product type Silk Saree']]);
  assert.equal(w.store.productType, 'Silk Saree');
  // The old name is still a category (a product was only moved): a collection is made, as before.
  const moved = world({ categories: ['Saree', 'Gown'], collections: one(SAREE), product: { category: 'Gown' }, listing: { product_type: 'Saree', sent: { type: 'Saree', tags: [], fields: {} } } });
  assert.equal(await send(moved), 'done');
  assert.deepEqual(moved.collections.map(c => c.title), ['Saree', 'Gown']);
});

test('a rename taken back that the store missed: the collection gets its old title back when the first product is sent', async () => {
  const col = { id: 'gid://shopify/Collection/1', handle: 'saree', title: 'Silk Saree' };
  const w = world({ categories: ['Saree', 'Lehenga'], collections: one(col), product: { category: 'Saree' }, values: [],
    rules: { [col.id]: [{ id: 'r1', title: 'Product type Saree' }, { id: 'r2', title: 'Product type Silk Saree' }] },
    listing: { product_type: 'Silk Saree', sent: { type: 'Silk Saree', tags: [], fields: {} } } });
  assert.equal(await send(w), 'done');
  const up = w.shopify().find(c => c.name === 'PbColUpdate').v.c;
  assert.deepEqual([up.title, 'sourcesToCreate' in up], ['Saree', false], 'only the title: its rule for Saree is there');
  assert.deepEqual([w.collections.length, w.collections[0].title, w.store.productType], [1, 'Saree', 'Saree']);
  // While the other name is still a category (a product was only moved back), a title is never touched.
  const moved = world({ categories: ['Saree', 'Silk Saree'], collections: one(col), product: { category: 'Saree' }, values: [],
    rules: { [col.id]: [{ id: 'r1', title: 'Product type Saree' }, { id: 'r2', title: 'Product type Silk Saree' }] },
    listing: { product_type: 'Silk Saree', sent: { type: 'Silk Saree', tags: [], fields: {} } } });
  assert.equal(await send(moved), 'done');
  assert.ok(!moved.names().includes('PbColUpdate'));
});
