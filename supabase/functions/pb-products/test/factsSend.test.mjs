// node --test --experimental-strip-types supabase/functions/pb-products/test/
// The small send of a product's type, tags and custom fields (factsSend.ts; owner, 20 Nov 2026: "Category changes:
// a change does not reach products already on the store. Corrected tags and fields: these are not sent again by
// themselves"). One listing from end to end over a fake Supabase and a fake Shopify (factsWorld.mjs): what goes to
// the store, what stays there, what is recorded, and when the mark is cleared.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GID, world } from './factsWorld.mjs';

const { sendFacts, sendFactsDue } = await import('../factsSend.ts');
const send = (w) => sendFacts({ ...w.listing }, 'u1', new Map());
const update = (w) => w.shopify().find(c => c.name === 'PbFacts')?.v.product;

test('a moved category and corrected tags reach the store: only type, tags and fields, and the store\'s own tags stay', async () => {
  const w = world();
  assert.equal(await send(w), 'done');
  assert.deepEqual(update(w), { id: GID, productType: 'Lehenga', tags: ['Lehenga', 'Maroon', 'Embroidery', 'Typed In Shopify'] }); // "Saree" and "Red" were Playbook's and are gone
  assert.deepEqual(w.shopify().find(c => c.name === 'PbFields').v.metafields.map(m => [m.key, m.value]), [['colour', 'Maroon'], ['work', '["Embroidery"]']]);
  assert.ok(!w.names().some(n => /productSet|PbExisting/.test(n)), 'no full re-send: title, text, price, sizes and photos are not touched');
  assert.equal(w.listing.facts_due, false);
  assert.equal(w.listing.product_type, 'Lehenga');
  assert.deepEqual(w.listing.tags, ['Lehenga', 'Maroon', 'Embroidery'], 'the listing shows what the store has');
  assert.deepEqual(w.listing.sent, { type: 'Lehenga', tags: ['Lehenga', 'Maroon', 'Embroidery'], fields: { colour: 'Maroon', work: '["Embroidery"]' } });
  const row = w.activity.find(a => a.action === 'facts_sent');
  assert.deepEqual([row.details.type, row.details.was_type, row.details.fields], ['Lehenga', 'Saree', 2]);
});

test('the store already has them: the mark is cleared without a call to Shopify', async () => {
  const sent = { type: 'Lehenga', tags: ['embroidery', 'Lehenga', 'MAROON'], fields: { colour: 'Maroon', work: '["Embroidery"]' } };
  const w = world({ listing: { sent } });
  assert.equal(await send(w), 'done');
  assert.equal(w.shopify().length, 0);
  assert.equal(w.listing.facts_due, false);
  assert.equal(w.activity.length, 0);
});

test('"Send tags and fields again" sends even then', async () => {
  const sent = { type: 'Lehenga', tags: ['Lehenga', 'Maroon', 'Embroidery'], fields: { colour: 'Maroon', work: '["Embroidery"]' } };
  const w = world({ listing: { sent, facts_force: true }, store: { id: GID, tags: ['Edited In Shopify'], productType: 'Something Else' } });
  assert.equal(await send(w), 'done');
  assert.equal(w.store.productType, 'Lehenga');
  assert.deepEqual(w.store.tags, ['Lehenga', 'Maroon', 'Embroidery', 'Edited In Shopify']);
  assert.equal(w.listing.facts_force, false);
  assert.equal(w.activity.find(a => a.action === 'facts_sent').details.asked, true);
});

test('a value removed in Playbook is taken off the store; a field nobody recorded is never touched', async () => {
  const w = world({ values: [['Colour', 'Maroon']], listing: { sent: { type: 'Lehenga', tags: ['Lehenga'], fields: { colour: 'Red', work: '["Zari"]' } } } });
  assert.equal(await send(w), 'done');
  assert.deepEqual(w.shopify().find(c => c.name === 'PbFieldsDrop').v.metafields, [{ ownerId: GID, namespace: 'custom', key: 'work' }]);
  assert.deepEqual(w.activity.find(a => a.action === 'facts_sent').details.cleared, ['work']);
  const none = world({ values: [['Colour', 'Maroon']], listing: { sent: null } });
  await send(none);
  assert.ok(!none.names().includes('PbFieldsDrop'));
});

test('no record yet: the tags of the last full publish say which of the store\'s tags are Playbook\'s', async () => {
  const w = world({ listing: { sent: null }, published: [{ details: { tags: ['Saree', 'Red'] } }] });
  await send(w);
  assert.deepEqual(w.store.tags, ['Lehenga', 'Maroon', 'Embroidery', 'Typed In Shopify']);
  const blind = world({ listing: { sent: null } }); // nothing on record at all: every store tag stays
  await send(blind);
  assert.deepEqual(blind.store.tags, ['Lehenga', 'Maroon', 'Embroidery', 'Saree', 'Red', 'Typed In Shopify']);
});

test('tags a person typed on the listing go as typed, and stay on the listing', async () => {
  const w = world({ listing: { locked: ['tags'], tags: ['My Tag'] } });
  await send(w);
  assert.deepEqual(update(w).tags, ['My Tag', 'Typed In Shopify']);
  assert.deepEqual(w.listing.tags, ['My Tag']);
  assert.equal(w.store.productType, 'Lehenga', 'its category still follows');
});

test('nothing is sent for a listing that is off sale or archived; a website that is off and a publish in flight wait', async () => {
  const off = world({ listing: { status: 'skipped', shopify_status: 'DRAFT' } });
  assert.equal(await send(off), 'done');
  const archived = world({ product: { status: 'archived' } });
  assert.equal(await send(archived), 'done');
  for (const w of [off, archived]) { assert.equal(w.shopify().length, 0); assert.equal(w.listing.facts_due, false); }
  const siteOff = world({ site: { active: false } });
  assert.equal(await send(siteOff), 'wait');
  const busy = world({ listing: { status: 'publishing', claimed_at: new Date().toISOString() } });
  assert.equal(await send(busy), 'wait');
  for (const w of [siteOff, busy]) { assert.equal(w.shopify().length, 0); assert.equal(w.listing.facts_due, true, 'still owed'); }
});

test('a product held in Needs info is sent too, and one with no category keeps the type the store has', async () => {
  const w = world({ product: { status: 'needs_info', category: null } });
  assert.equal(await send(w), 'done');
  assert.ok(!('productType' in update(w)), 'an empty product type is never sent');
  assert.deepEqual(update(w).tags, ['Maroon', 'Embroidery', 'Typed In Shopify']);
  assert.equal(w.listing.sent.type, 'Saree');
});

test('the product changed while the send was on its way: what went is recorded, and it stays owed', async () => {
  const w = world({ onUpdate: (x) => { x.listing.facts_tried_at = null; } }); // what the database trigger does on a change
  assert.equal(await send(w), 'wait');
  assert.equal(w.listing.facts_due, true);
  assert.equal(w.listing.sent.type, 'Lehenga');
});

test('deleted in Shopify: nothing to update, the mark goes', async () => {
  const w = world({ store: null });
  assert.equal(await send(w), 'done');
  assert.equal(w.listing.facts_due, false);
  assert.ok(!w.names().includes('PbFacts'));
});

test('Shopify refuses this product: it stays owed for a try in 5 minutes, and only the first failure is on the timeline', async () => {
  const w = world({ refuse: 'Tags is invalid' });
  assert.equal(await send(w), 'failed');
  assert.equal(w.listing.facts_due, true);
  assert.ok(w.listing.facts_tried_at, 'stamped: not tried again before 5 minutes');
  assert.deepEqual(w.activity.map(a => [a.action, a.details.step]), [['failed', 'facts']]);
  assert.match(w.activity[0].details.error, /Kreeva: Shopify said "Tags is invalid"/);
  assert.equal(w.listing.sent.type, 'Saree', 'the record still says what the store has');
  assert.equal(await send(w), 'wait', 'another run finds the fresh stamp and leaves it');
  w.listing.facts_tried_at = new Date(Date.now() - 6 * 60_000).toISOString();
  assert.equal(await send(w), 'failed');
  assert.equal(w.activity.length, 1, 'the second failure in a row is not written again');
});

test('the worker\'s step: every due listing, and a store that cannot answer is left for the next run', async () => {
  const w = world();
  assert.equal(await sendFactsDue(10, () => true, null), 1);
  assert.equal(w.store.productType, 'Lehenga');
  const down = world({ down: true });
  assert.equal(await sendFactsDue(10, () => true, null), 0);
  assert.equal(down.listing.facts_due, true);
  assert.equal(down.calls.filter(c => c.name === 'GET pb_listings').length, 2, 'asked again without that store, then stopped');
});
