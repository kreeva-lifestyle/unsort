// node --test --experimental-strip-types supabase/functions/pb-products/test/
// "New Arrival" by the owner's rule (listingFacts.ts withNewArrival; owner, 12 Nov 2026: "Last 30 days = auto tag New
// arrival"; 20 Nov 2026: "Did you check which where actually new arrival as per our condition?"). A product uploaded on
// the supplier's site 30 days ago or less carries the tag, first; an older one never does, whoever wrote the words.
// The hourly sweep that takes it off when the 30 days run out: t_dups.sql part 15.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno ??= { env: { get: () => '' } }; // db.ts reads Deno.env
const { NEW_ARRIVAL, isNewArrival, ownTags, uploadedAt, withNewArrival } = await import('../listingFacts.ts');

const DAY = 86_400_000, NOW = Date.parse('2026-11-20T12:00:00Z');
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const RULES = { case: 'title', static: [], ai_extra: false, max_tags: 3, templates: ['{category}', '{fabric}', '{color}'] };
const P = { id: 'p1', category: 'Lehenga', fabric: 'Georgette', color: 'Maroon', sku: 'KB 302', name: 'x', sizes: [], tags: [], created_at: ago(2) };
const tags = (p, l = {}) => ownTags({ l: { tags: [], ai_tags: null, locked: [], ...l }, p, rules: RULES, vendor: null, valueTags: [] });

test('the upload date: the supplier\'s site first, else the day the product came into Playbook', () => {
  assert.equal(uploadedAt({ attributes: { source_created_at: ago(40) }, created_at: ago(2) }), NOW - 40 * DAY);
  assert.equal(uploadedAt({ attributes: {}, created_at: ago(2) }), NOW - 2 * DAY, 'a Telegram post, a product added by hand');
  assert.equal(uploadedAt({ attributes: { source_created_at: 'not a date' }, created_at: ago(2) }), NOW - 2 * DAY);
  assert.ok(Number.isNaN(uploadedAt({ attributes: {}, created_at: null })));
});

test('new for 30 days from the upload, not a day longer', () => {
  assert.equal(isNewArrival({ attributes: { source_created_at: ago(29.9) } }, NOW), true);
  assert.equal(isNewArrival({ attributes: { source_created_at: ago(30) } }, NOW), true);
  assert.equal(isNewArrival({ attributes: { source_created_at: ago(30.01) } }, NOW), false);
  assert.equal(isNewArrival({ attributes: {}, created_at: null }, NOW), false, 'no date at all: not new');
  // 4 Nov 2026 (DRS166 on SuratMandi) is new on 20 Nov; 2 Oct is not.
  assert.equal(isNewArrival({ attributes: { source_created_at: '2026-11-04T10:04:45Z' } }, NOW), true);
  assert.equal(isNewArrival({ attributes: { source_created_at: '2026-10-02T10:00:00Z' } }, NOW), false);
});

test('a new product gets "New Arrival" first, so the tag limit never cuts it; an older one never has it', () => {
  assert.deepEqual(withNewArrival(['Lehenga', 'Silk'], { attributes: { source_created_at: ago(5) } }, NOW), [NEW_ARRIVAL, 'Lehenga', 'Silk']);
  assert.deepEqual(withNewArrival(['Lehenga', 'new arrival', 'Silk'], { attributes: { source_created_at: ago(90) } }, NOW), ['Lehenga', 'Silk'], 'the words from a rule or a person do not make it new');
  assert.deepEqual(withNewArrival(['New Arrival', 'Lehenga'], { attributes: { source_created_at: ago(5) } }, NOW), [NEW_ARRIVAL, 'Lehenga'], 'never twice');
  assert.equal(NEW_ARRIVAL, 'New Arrival', 'exactly the words the theme\'s badge and the store\'s collection look for');
});

test('through the tag rules: the website\'s 3-tag limit applies to the rest, a typed tag list gets it too', () => {
  const fresh = { ...P, attributes: { source_created_at: new Date(Date.now() - 3 * DAY).toISOString() } };
  const old = { ...P, attributes: { source_created_at: new Date(Date.now() - 200 * DAY).toISOString() } };
  assert.deepEqual(tags(fresh), ['New Arrival', 'Lehenga', 'Georgette', 'Maroon']);
  assert.deepEqual(tags(old), ['Lehenga', 'Georgette', 'Maroon']);
  assert.deepEqual(tags(fresh, { locked: ['tags'], tags: ['My Tag'] }), ['New Arrival', 'My Tag']);
  assert.deepEqual(tags(old, { locked: ['tags'], tags: ['My Tag', 'New Arrival'] }), ['My Tag']);
  assert.deepEqual(ownTags({ l: { tags: [], ai_tags: null, locked: [] }, p: old, rules: { ...RULES, static: ['New Arrival'] }, vendor: null, valueTags: [] }), ['Lehenga', 'Georgette', 'Maroon'], 'a fixed tag "New Arrival" does not make every product new');
});
