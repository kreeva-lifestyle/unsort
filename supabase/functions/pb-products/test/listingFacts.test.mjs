// node --test --experimental-strip-types supabase/functions/pb-products/test/
// What a store is shown of a product besides its text (listingFacts.ts; owner, 20 Nov 2026: "Corrected tags and
// fields: these are not sent again by themselves"): the tags worked out again without the AI, and the comparison
// that decides whether a store must be sent anything at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno ??= { env: { get: () => '' } }; // db.ts reads Deno.env
const { emptied, extrasOf, fieldRecord, ownTags, sameFacts, sameTags, sentOf } = await import('../listingFacts.ts');

const RULES = { case: 'title', static: [], ai_extra: true, ai_extra_max: 5, max_tags: 8, tag_style: 'plain', ai_allowed: [],
  templates: ['{category}', '{fabric}', '{color}', 'Vendor_{vendor_code}', '{tags}', '{attr:occasion}'] };
const P = { id: 'p1', category: 'Lehenga', fabric: 'Georgette', color: 'Maroon', sku: 'KB 302', name: 'Maroon lehenga', sizes: ['M', 'L'], attributes: { occasion: 'Wedding' }, tags: [] };
const listing = (o = {}) => ({ tags: ['Lehenga', 'Georgette', 'Red', 'Festive'], ai_tags: null, locked: [], ...o });

test('tags follow the product as it is now, by the website\'s rules, without the AI', () => {
  const tags = ownTags({ l: listing(), p: P, rules: RULES, vendor: { name: 'Kreeva', codes: ['KB'] }, valueTags: ['Embroidery', 'Wedding'] });
  assert.deepEqual(tags, ['Lehenga', 'Georgette', 'Maroon', 'Vendor_Kb', 'Embroidery', 'Wedding']); // the corrected colour; the old "Red" is gone
});

test('the AI\'s extra tags are kept when they were stored with the listing', () => {
  const tags = ownTags({ l: listing({ ai_tags: ['Bridal Wear', 'Twirl'] }), p: P, rules: RULES, vendor: null, valueTags: [] });
  assert.deepEqual(tags, ['Lehenga', 'Georgette', 'Maroon', 'Wedding', 'Bridal Wear', 'Twirl']);
  assert.deepEqual(ownTags({ l: listing({ ai_tags: ['Bridal Wear'] }), p: P, rules: { ...RULES, ai_extra: false }, vendor: null, valueTags: [] }), ['Lehenga', 'Georgette', 'Maroon', 'Wedding']);
});

test('a listing written before extras were kept: only tags on the website\'s allowed list count as extras', () => {
  assert.deepEqual(extrasOf(listing(), RULES), []); // "Red" and "Festive" cannot be told from a rule tag that went stale
  assert.deepEqual(extrasOf(listing(), { ...RULES, ai_allowed: ['festive', 'Party'] }), ['Festive']);
  assert.deepEqual(extrasOf(listing({ ai_tags: [] }), { ...RULES, ai_allowed: ['festive'] }), []); // stored: none means none
});

test('tags a person typed on the listing stay as typed', () => {
  const l = listing({ locked: ['tags'], tags: ['My Own Tag'] });
  assert.deepEqual(ownTags({ l, p: P, rules: RULES, vendor: null, valueTags: ['Embroidery'] }), ['My Own Tag']);
});

test('sizes in tags use the one size format, and the limit still applies last', () => {
  const p = { ...P, sizes: ['2XL', '38"'] };
  assert.deepEqual(ownTags({ l: listing(), p, rules: { ...RULES, case: 'as_is', templates: ['Size_{size}'] }, vendor: null, valueTags: [] }), ['Size_XXL', 'Size_38']);
  assert.equal(ownTags({ l: listing({ ai_tags: ['A', 'B', 'C', 'D', 'E'] }), p: P, rules: { ...RULES, max_tags: 5 }, vendor: null, valueTags: ['One', 'Two'] }).length, 5);
});

test('the custom fields as a record: a list as its JSON, an empty value left out', () => {
  const attrs = [{ key: 'Colour', multi: false, values: ['Maroon'] }, { key: 'Work', multi: true, values: ['Embroidery', 'Mirror Work'] }, { key: 'Pattern', multi: false, values: [] }];
  assert.deepEqual(fieldRecord({ ...P, attributes: { set_contents: 'Lehenga, blouse, dupatta' } }, attrs),
    { colour: 'Maroon', work: '["Embroidery","Mirror Work"]', set_contents: 'Lehenga, blouse, dupatta' });
});

test('is the store behind? by the record of the last send', () => {
  const now = { type: 'Lehenga', tags: ['Lehenga', 'Maroon'], fields: { colour: 'Maroon' }, attrs: [] };
  assert.equal(sameFacts(now, null), false, 'no record = not known = send');
  assert.equal(sameFacts(now, { type: 'Lehenga', tags: ['maroon', 'LEHENGA'], fields: { colour: 'Maroon' } }), true, 'order and capitals of tags are not a change');
  assert.equal(sameFacts(now, { type: 'Saree', tags: ['Lehenga', 'Maroon'], fields: { colour: 'Maroon' } }), false, 'the category moved');
  assert.equal(sameFacts(now, { type: 'Lehenga', tags: ['Lehenga', 'Red'], fields: { colour: 'Maroon' } }), false, 'a tag was corrected');
  assert.equal(sameFacts(now, { type: 'Lehenga', tags: ['Lehenga', 'Maroon'], fields: { colour: 'Red' } }), false, 'a field was corrected');
  assert.equal(sameFacts(now, { type: 'Lehenga', tags: ['Lehenga', 'Maroon'], fields: { colour: 'Maroon', work: 'Zari' } }), false, 'a field went empty');
  assert.equal(sameFacts({ ...now, type: '' }, { type: 'Saree', tags: ['Lehenga', 'Maroon'], fields: { colour: 'Maroon' } }), true, 'an empty category is never sent');
  assert.equal(sameFacts({ ...now, fields: null }, { type: 'Lehenga', tags: ['Lehenga', 'Maroon'], fields: { colour: 'Red' } }), true, 'a website that sends no fields');
  assert.equal(sameTags(['A', 'b'], ['B', 'a']), true);
  assert.equal(sameTags(['A'], ['A', 'B']), false);
});

test('the record of a send, and the fields to take off the store', () => {
  const was = { type: 'Saree', tags: ['Saree'], fields: { colour: 'Red', work: 'Zari', occasion: 'Party' } };
  const now = { type: 'Lehenga', tags: ['Lehenga'], fields: { colour: 'Maroon' }, attrs: [] };
  assert.deepEqual(sentOf(now, was), { type: 'Lehenga', tags: ['Lehenga'], fields: { colour: 'Maroon' } });
  assert.deepEqual(emptied(now, was), ['work', 'occasion']); // filled before, no value now
  assert.deepEqual(emptied(now, null), [], 'nothing on record: nothing is taken off');
  // No category now: the store keeps its type, and so does the record. Fields switched off: the record of them stays.
  assert.deepEqual(sentOf({ ...now, type: '', fields: null }, was), { type: 'Saree', tags: ['Lehenga'], fields: was.fields });
  assert.deepEqual(emptied({ ...now, fields: null }, was), []);
});
