// node --test --experimental-strip-types supabase/functions/pb-products/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TAG_SETTINGS as D } from '../tagClean.ts';
import { factPieces, libraryOf, productTags, sameTags, visibleTags } from '../tagEngine.ts';

/** One bahupalace product as imported (attributes = the store's facts + what the reader added). */
const product = {
  facts: { category: 'Kurta Set', fabric: 'cotton', color: 'Pink' },
  attributes: {
    store_tags: '_altnew_KBSUIT25, _label_BUY 1 GET 1 FREE, Ideal Collection, Kurtas & Suits, SIZE_CHART, kb261, Lehenga',
    occasion: 'festive, wedding guest', work: 'Zari embroidery', pattern: 'Floral print with a long description that runs past forty characters',
    brand: 'Bahu Palace', seo_title: 'Pink kurta set | Bahu Palace',
  },
};

test('productTags: facts first, then the store tags cleaned, deduped by key; junk hidden with reasons; sources recorded', () => {
  const r = productTags(product, D);
  assert.deepEqual(r.tags, ['Kurta Set', 'Cotton', 'Pink', 'Festive', 'Wedding Guest', 'Zari embroidery', 'Ideal Collection', 'Kurtas & Suits', 'Lehenga']);
  assert.deepEqual(r.flagged, []);
  const why = Object.fromEntries(r.hidden.map(h => [h.tag, h.reason]));
  assert.equal(why['_altnew_KBSUIT25'], 'pattern');
  assert.equal(why['_label_BUY 1 GET 1 FREE'], 'pattern');
  assert.equal(why['Size_Chart'], 'pattern');
  assert.equal(why['Kb261'], 'pattern');
  assert.equal(r.sources['Kurta Set'], 'facts');
  assert.equal(r.sources['Ideal Collection'], 'store');
  assert.equal('brand' in why, false); // other attributes are not tags
});

test('existing tags then AI extras join after; existing tags go through the rules unless keepExisting; hidden ones say their source', () => {
  const r = productTags({ ...product, aiExtra: ['Wedding Guest', 'summer wear', '_x'], existing: ['Best Seller', '_altnew_OLD'] }, D);
  assert.ok(r.tags.includes('Summer Wear') && r.tags.includes('Best Seller'));
  assert.equal(r.tags.filter(t => t === 'Wedding Guest').length, 1);
  assert.equal(r.sources['Summer Wear'], 'ai');
  assert.equal(r.sources['Best Seller'], 'manual');
  assert.equal(r.tags.includes('_altnew_OLD'), false);
  assert.ok(r.tags.indexOf('Best Seller') < r.tags.indexOf('Summer Wear'));
  assert.deepEqual(r.hidden.find(h => h.tag === '_X'), { tag: '_X', reason: 'pattern', pattern: '^_', src: 'ai' });
  assert.equal(r.hidden.find(h => h.tag === '_altnew_KBSUIT25').src, 'store');
  const kept = productTags({ existing: ['Best Seller', '_altnew_OLD', 'best seller'], keepExisting: true }, D);
  assert.deepEqual(kept.tags, ['Best Seller', '_altnew_OLD']);
});

test('at the cap, new AI extras only fill the room left: a regenerate never evicts the tags already on the product', () => {
  const rules = { ...D, max_per_product: 4 };
  const first = productTags({ facts: { category: 'Saree' }, storeTags: ['Silk'], existing: ['Festive Wear'], aiExtra: ['Party Wear', 'Summer'], keepExisting: true }, rules);
  assert.deepEqual(first.tags, ['Saree', 'Silk', 'Festive Wear', 'Party Wear']);
  const again = productTags({ facts: { category: 'Saree' }, storeTags: ['Silk'], existing: first.tags, aiExtra: ['Wedding', 'Summer'], keepExisting: true }, rules);
  assert.deepEqual(again.tags, first.tags);
  assert.deepEqual(again.hidden.filter(h => h.reason === 'cap').map(h => h.tag), ['Wedding', 'Summer']);
});

test('a library-hidden tag already on the product stays (flagged) even when the rules would hide it, so un-hiding restores it', () => {
  const lib = libraryOf([{ id: '1', name: 'Foo25', key: 'foo25', hidden: true, merged_into: null, reviewed_at: '2026-11-10T00:00:00Z' }]);
  const r = productTags({ existing: ['Foo25'], storeTags: ['Bar25'] }, D, lib);
  assert.deepEqual(r.tags, ['Foo25']);
  assert.deepEqual(r.flagged, ['Foo25']);
  assert.ok(r.hidden.some(h => h.tag === 'Bar25'));
  // not on the product yet: a hidden library tag still goes through the rules like any store tag
  const fresh = productTags({ storeTags: ['Foo25'] }, D, lib);
  assert.deepEqual(fresh.tags, []);
});

test('library: aliases become the canonical name (chains followed), hidden tags stay but are flagged, reviewed-and-kept tags pass the rules', () => {
  const lib = libraryOf([
    { id: '1', name: 'Kurta Set', key: 'kurta set', hidden: false, merged_into: null },
    { id: '2', name: 'Kurtas & Suits', key: 'kurtas & suits', hidden: false, merged_into: '1' },
    { id: '3', name: 'Suits', key: 'suits', hidden: false, merged_into: '2' },
    { id: '4', name: 'Ideal Collection', key: 'ideal collection', hidden: true, merged_into: null },
    { id: '5', name: 'Kb261', key: 'kb261', hidden: false, merged_into: null, reviewed_at: '2026-11-10T00:00:00Z' },
  ]);
  assert.equal(lib.alias.get('suits'), 'Kurta Set');
  const r = productTags({ storeTags: ['Suits', 'kurtas & suits', 'Ideal Collection', 'kb261', 'nkb55'] }, D, lib);
  assert.deepEqual(r.tags, ['Kurta Set', 'Ideal Collection', 'Kb261']);
  assert.deepEqual(r.flagged, ['Ideal Collection']);
  assert.deepEqual(visibleTags(r.tags, lib), ['Kurta Set', 'Kb261']);
});

test('cap over the union, after dedupe', () => {
  const r = productTags({ facts: { category: 'Saree' }, storeTags: ['x1z', 'Silk', 'Red', 'saree', 'Festive', 'Wedding'] }, { ...D, max_per_product: 3 });
  assert.deepEqual(r.tags, ['Saree', 'Silk', 'Red']);
  assert.deepEqual(r.hidden.filter(h => h.reason === 'cap').map(h => h.tag), ['Festive', 'Wedding']);
});

test('factPieces: comma pieces, short ones only; sameTags', () => {
  assert.deepEqual(factPieces('festive,  wedding guest , a very long sentence about the work that is not a tag'), ['festive', 'wedding guest']);
  assert.deepEqual(factPieces(null), []);
  assert.equal(sameTags(['A', 'B'], ['A', 'B']), true);
  assert.equal(sameTags(['A', 'B'], ['B', 'A']), false);
});
