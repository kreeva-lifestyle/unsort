// node --test --experimental-strip-types supabase/functions/pb-products/test/
// A full publish sends the product's tags and custom fields as they are NOW (publish.ts + listingFacts.ts; owner,
// 20 Nov 2026). Before, it sent the copies saved when the AI wrote the listing, so "Update on Shopify", a re-price or
// a photo change put corrected tags back to what they were. A product already on the store keeps the product type it
// has there: a changed category is the small send's to move, because that one makes the collection first (code check,
// 20 Nov 2026), and the publish marks the listing for it. Only what the store took goes on record.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world } from './factsWorld.mjs';

const { publishOne } = await import('../publish.ts');
const { sendFacts } = await import('../factsSend.ts');
const publish = (w) => publishOne({ ...w.listing }, { manual: false, userId: null, budget: { hard: Date.now() + 120_000 } });
const live = (o = {}) => world({ ...o, listing: { status: 'publishing', claimed_at: null, ...o.listing } });

test('a re-send carries the tags and fields the product has now; its changed category is left to the small send, which makes the collection first', async () => {
  const w = live({ collections: [{ id: 'gid://shopify/Collection/1', handle: 'saree', title: 'Saree' }] }); // the listing's own copies say Saree / Red; the product is a Maroon Lehenga now
  await publish(w);
  assert.equal(w.listing.status, 'published');
  assert.equal(w.set.productType, 'Saree', 'a product on the store is never re-typed by a full publish: it would leave its collection for none');
  assert.ok(!w.names().includes('PbCol'));
  assert.deepEqual(w.set.tags, ['Lehenga', 'Maroon', 'Embroidery', 'Typed In Shopify'], 'Playbook\'s old tags go, the store\'s own tag stays');
  assert.deepEqual(w.shopify().find(c => c.name === 'PbFields').v.metafields.map(m => m.key), ['colour', 'work']);
  assert.deepEqual([w.listing.product_type, w.listing.tags], ['Saree', ['Lehenga', 'Maroon', 'Embroidery']]);
  assert.deepEqual(w.listing.sent, { type: 'Saree', tags: ['Lehenga', 'Maroon', 'Embroidery'], fields: { colour: 'Maroon', work: '["Embroidery"]' } });
  assert.deepEqual(w.activity.find(a => a.action === 'published').details.tags, ['Lehenga', 'Maroon', 'Embroidery'], 'the record holds Playbook\'s own tags, as sent');
  assert.equal(w.listing.facts_due, true, 'owed its category');
  // The small send makes the collection for the new category, then moves the product.
  assert.equal(await sendFacts({ ...w.listing }, null, new Map()), 'done');
  const names = w.shopify().map(c => c.name);
  assert.ok(names.lastIndexOf('PbCol') > -1 && names.lastIndexOf('PbCol') < names.lastIndexOf('PbFacts'));
  assert.equal(w.store.productType, 'Lehenga');
  assert.deepEqual([w.listing.facts_due, w.listing.product_type, w.listing.sent.type], [false, 'Lehenga', 'Lehenga']);
});

test('a re-send of a product whose category did not change: the record is equal, and the small send clears its mark without a call', async () => {
  const w = live({ listing: { product_type: 'Lehenga', sent: null } });
  await publish(w);
  assert.equal(w.set.productType, 'Lehenga');
  assert.equal(w.listing.facts_due, true, 'a publish never clears the mark');
  const before = w.shopify().length;
  assert.equal(await sendFacts({ ...w.listing }, null, new Map()), 'done');
  assert.equal(w.shopify().length, before);
  assert.equal(w.listing.facts_due, false);
});

test('a listing that is not marked is marked by the publish when its category still has to move, or the store did not answer for its fields', async () => {
  const w = live({ listing: { facts_due: false } });
  await publish(w);
  assert.deepEqual([w.listing.facts_due, w.listing.facts_tried_at], [true, null], 'its category is the small send\'s to move');
  const same = live({ listing: { facts_due: false, product_type: 'Lehenga', sent: null } });
  await publish(same);
  assert.equal(same.listing.facts_due, false, 'nothing owed: nothing marked');
  const slow = live({ listing: { facts_due: false, product_type: 'Lehenga', sent: null } });
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes('myshopify') && /mutation PbFields\b|metafieldsSet/.test(String(init.body))) throw new DOMException('timeout', 'TimeoutError');
    return real(url, init);
  };
  await publish(slow);
  assert.equal(slow.listing.status, 'published', 'the product is on the store: the publish stands');
  assert.match(slow.listing.error, /its custom fields .* were not/);
  assert.deepEqual(slow.listing.sent.fields, {}, 'not on record: the store did not take them');
  assert.equal(slow.listing.facts_due, true, 'the small send tries the fields again');
});

test('a full publish also takes off a field whose value went empty', async () => {
  const w = live({ values: [['Colour', 'Maroon']], listing: { sent: { type: 'Lehenga', tags: ['Lehenga'], fields: { colour: 'Maroon', work: '["Zari"]' } } } });
  await publish(w);
  assert.deepEqual(w.shopify().find(c => c.name === 'PbFieldsDrop').v.metafields.map(m => m.key), ['work']);
  assert.deepEqual(w.listing.sent.fields, { colour: 'Maroon' });
});

test('a product with no category keeps the type its listing was written with; typed tags stay typed', async () => {
  const w = live({ product: { category: null, status: 'ready' }, listing: { locked: ['tags'], tags: ['My Tag'] } });
  await publish(w);
  assert.equal(w.set.productType, 'Saree');
  assert.deepEqual(w.set.tags, ['My Tag', 'Typed In Shopify']);
  assert.deepEqual([w.listing.product_type, w.listing.tags], ['Saree', ['My Tag']]);
});
