// node --test --experimental-strip-types supabase/functions/pb-products/test/
// The junk filter for store tags before matching and suggestions (tagClean.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanStoreTags, junkReason, looksLikeCode, normalizeTag, splitStoreTags } from '../tagClean.ts';

const BAHU = '_altnew_KBSUIT25, _label_BUY 1 GET 1 FREE, Ideal Collection, Lehenga, SIZE_CHART, Kurtas & Suits';

test('bahupalace store tags: markers, size chart and the category name go; real words stay', () => {
  assert.deepEqual(cleanStoreTags(BAHU, ['Lehenga', 'Saree']), ['Ideal Collection', 'Kurtas & Suits']);
});

test('junkReason names why', () => {
  assert.equal(junkReason('_altnew_KBSUIT25'), 'pattern');
  assert.equal(junkReason('SIZE_CHART'), 'pattern');
  assert.equal(junkReason('label_new'), 'pattern');
  assert.equal(junkReason('kb261'), 'pattern');
  assert.equal(junkReason('KBSUIT25'), 'code');
  assert.equal(junkReason('2024'), 'code');
  assert.equal(junkReason('x'), 'short');
  assert.equal(junkReason('  '), 'empty');
  assert.equal(junkReason('lehenga', ['Lehenga']), 'category');
  assert.equal(junkReason('Festive'), null);
  assert.equal(junkReason('XL'), null);
  assert.equal(junkReason('बनारसी'), null);
});

test('looksLikeCode: codes vs sizes and words', () => {
  for (const c of ['nkb55', 'KBSUIT25', '_x', '12345', 'abc123']) assert.ok(looksLikeCode(c), c);
  for (const w of ['3XL', 'XS', 'Festive', 'Kurta Set', 'A-Line']) assert.ok(!looksLikeCode(w), w);
});

test('normalizeTag and splitStoreTags', () => {
  assert.equal(normalizeTag('  "#Festive  Wear" '), 'Festive Wear');
  assert.equal(normalizeTag('a​b'), 'ab');
  assert.deepEqual(splitStoreTags('a, b ,, c'), ['a', 'b', 'c']);
  assert.deepEqual(splitStoreTags(['a', ' b ']), ['a', 'b']);
  assert.deepEqual(cleanStoreTags('Silk, silk, SILK'), ['Silk']);
});
