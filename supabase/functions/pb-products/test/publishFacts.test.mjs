// node --test --experimental-strip-types supabase/functions/pb-products/test/
// A full publish sends the product's type, tags and custom fields as they are NOW (publish.ts + listingFacts.ts;
// owner, 20 Nov 2026). Before, it sent the copies saved when the AI wrote the listing, so "Update on Shopify", a
// re-price or a photo change put a renamed category and corrected tags back to what they were.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world } from './factsWorld.mjs';

const { publishOne } = await import('../publish.ts');
const { sendFacts } = await import('../factsSend.ts');
const publish = (w) => publishOne({ ...w.listing }, { manual: false, userId: null, budget: { hard: Date.now() + 120_000 } });
const live = (o = {}) => world({ ...o, listing: { status: 'publishing', claimed_at: null, ...o.listing } });

test('a re-send carries the category and the tags the product has now, and records them', async () => {
  const w = live(); // the listing's own copies say Saree / Red; the product is a Maroon Lehenga now
  await publish(w);
  assert.equal(w.listing.status, 'published');
  assert.equal(w.set.productType, 'Lehenga');
  assert.deepEqual(w.set.tags, ['Lehenga', 'Maroon', 'Embroidery', 'Typed In Shopify'], 'Playbook\'s old tags go, the store\'s own tag stays');
  assert.deepEqual(w.shopify().find(c => c.name === 'PbFields').v.metafields.map(m => m.key), ['colour', 'work']);
  assert.deepEqual([w.listing.product_type, w.listing.tags], ['Lehenga', ['Lehenga', 'Maroon', 'Embroidery']]);
  assert.deepEqual(w.listing.sent, { type: 'Lehenga', tags: ['Lehenga', 'Maroon', 'Embroidery'], fields: { colour: 'Maroon', work: '["Embroidery"]' } });
  assert.deepEqual(w.activity.find(a => a.action === 'published').details.tags, ['Lehenga', 'Maroon', 'Embroidery'], 'the record holds Playbook\'s own tags, as sent');
  assert.equal(w.listing.facts_due, true, 'a publish never clears the mark');
  // The small send then finds the record equal and clears the mark without calling the store.
  const before = w.shopify().length;
  assert.equal(await sendFacts({ ...w.listing }, null, new Map()), 'done');
  assert.equal(w.shopify().length, before);
  assert.equal(w.listing.facts_due, false);
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
