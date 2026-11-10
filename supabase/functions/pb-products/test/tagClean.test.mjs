// node --test --experimental-strip-types supabase/functions/pb-products/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TAG_SETTINGS as D, cleanTags, hideReason, looksLikeCode, normalizeTag, patternProblem, splitStoreTags, tagKey, tagSettings } from '../tagClean.ts';

/** The 43 distinct tags the owner's bahupalace.com import brought in (10 Nov 2026), as the store spells them. */
export const BAHU_TAGS = [
  '_altnew_KBSUIT25', '_altnew_KBSUIT26', '_altnew_NKB55', '_altnew_KB261', '_altnew_LEH12', '_altnew_lehenga1',
  '_label_BUY 1 GET 1 FREE', '_label_New', '_label_Sale', 'SIZE_CHART', 'size_chart', 'Ideal Collection', 'Kurtas & Suits', 'Lehenga',
  'kb261', 'nkb55', 'KBSUIT25', 'leh12', 'KURTAS & SUITS', 'ideal collection', '2024', 'ss24', 'abc123', 'xyz9',
  'Festive', 'wedding', 'PARTY WEAR', 'Co-ord Set', 'cotton', 'Georgette', 'Printed', 'Embroidered', 'Anarkali', 'Sharara',
  'Palazzo Set', 'Dupatta', 'Chikankari', 'Bandhani', 'Best Seller', 'New Arrival', 'Under 999', 'Under 1999', 'Free Shipping',
];

test('normalizeTag: trim, single spaces, quotes / # off, Title Case for all-lower or all-upper, mixed case and & kept', () => {
  assert.equal(normalizeTag('  kurtas   &  suits '), 'Kurtas & Suits');
  assert.equal(normalizeTag('KURTAS & SUITS'), 'Kurtas & Suits');
  assert.equal(normalizeTag('"Ideal Collection"'), 'Ideal Collection');
  assert.equal(normalizeTag('#festive'), 'Festive');
  assert.equal(normalizeTag('iPhone Case'), 'iPhone Case');
  assert.equal(normalizeTag('Co-ord Set'), 'Co-ord Set');
  assert.equal(normalizeTag('co-ord set'), 'Co-Ord Set');
  assert.equal(normalizeTag('party wear', false), 'party wear');
  assert.equal(normalizeTag('a, b'), 'A B'); // a comma would split a Shopify tag
  assert.equal(normalizeTag('BUY 1 GET 1 FREE'), 'Buy 1 Get 1 Free');
  assert.equal(normalizeTag("women's wear"), "Women's Wear");
  assert.equal(normalizeTag('Fes\u200btive\u0007'), 'Festive'); // zero-width and control characters go
  // short all-caps words are sizes and acronyms, not words to re-case
  for (const [raw, out] of [['XL', 'XL'], ['XXL', 'XXL'], ['3XL', '3XL'], ['XS', 'XS'], ['UK 10', 'UK 10'], ['USA', 'USA'], ['EU 38', 'EU 38'], ['KURTA SET', 'Kurta Set'], ['xl', 'Xl']])
    assert.equal(normalizeTag(raw), out, raw);
  assert.equal(normalizeTag('   '), '');
  assert.equal(normalizeTag(null), '');
  assert.equal(normalizeTag('x'.repeat(300)).length, 255);
});

test('tagKey: lower, trimmed, single spaces (= pb_tag_key in SQL)', () => {
  assert.equal(tagKey('  Kurtas &   Suits '), 'kurtas & suits');
});

test('looksLikeCode: _prefix, letters+digits without a vowel, mostly digits; words with digits are not codes', () => {
  for (const c of ['_altnew_KB261', 'kb261', 'nkb55', 'xyz9', '2024', 'ss24', 'KB-261', 'KBSUIT25', 'abc123']) assert.equal(looksLikeCode(c), true, c);
  for (const w of ['Under 999', 'Buy 1 Get 1', 'Lehenga', 'XL', 'Festive', 'Covid 19', 'Kids 2-4', '3XL', '2xl', 'XS', 'XXXL', 'S', 'M']) assert.equal(looksLikeCode(w), false, w);
});

test('cleanTags with the default rules on the real store list: junk hidden with a reason, real tags kept and title-cased, repeats dropped', () => {
  const { kept, hidden } = cleanTags(BAHU_TAGS, D);
  for (const t of ['Ideal Collection', 'Kurtas & Suits', 'Lehenga', 'Festive', 'Wedding', 'Party Wear', 'Co-ord Set', 'Cotton', 'Georgette', 'Under 999', 'Under 1999', 'Best Seller', 'New Arrival', 'Free Shipping'])
    assert.ok(kept.includes(t), `kept ${t}`);
  const why = Object.fromEntries(hidden.map(h => [h.tag.toLowerCase(), h.reason])); // by key: title case touches _altnew_lehenga1 too
  for (const t of ['_altnew_kbsuit25', '_altnew_lehenga1', '_label_buy 1 get 1 free', '_label_new']) assert.equal(why[t], 'pattern', t);
  assert.equal(why['size_chart'], 'pattern'); // SIZE_CHART and size_chart both normalize to Size_Chart
  assert.equal(why['kb261'], 'pattern'); // ^[a-z]{1,3}\d{2,}$
  assert.equal(why['nkb55'], 'pattern');
  assert.equal(why['leh12'], 'pattern');
  assert.equal(why['ss24'], 'pattern');
  assert.equal(why['2024'], 'code');
  assert.equal(why['xyz9'], 'code'); // no vowel + a digit (the pattern needs 2 digits)
  assert.equal(why['kbsuit25'], 'code'); // letters then a number
  assert.equal(why['abc123'], 'pattern'); // 3 letters + digits: the pattern hits before the code rule
  assert.equal(kept.length + hidden.length, BAHU_TAGS.length);
  assert.equal(new Set(kept.map(tagKey)).size, kept.length);
});

test('cleanTags: duplicates (case / spacing) collapse to the first spelling, the cap and min_len apply, exact hides are by key', () => {
  const { kept, hidden } = cleanTags(['Lehenga', 'LEHENGA', ' lehenga ', 'A', 'Saree', 'Kurti', 'Gown'], { ...D, max_per_product: 3, hide_exact: ['kurti'] });
  assert.deepEqual(kept, ['Lehenga', 'Saree', 'Gown']);
  assert.deepEqual(hidden.map(h => h.reason), ['duplicate', 'duplicate', 'short', 'exact']);
  const capped = cleanTags(['Lehenga', 'Saree', 'Gown', 'Kurti'], { ...D, max_per_product: 3 });
  assert.deepEqual(capped.kept, ['Lehenga', 'Saree', 'Gown']);
  assert.equal(capped.hidden[0].reason, 'cap');
});

test('cleanTags skipRules (what staff typed): only empties, repeats and the cap', () => {
  const { kept, hidden } = cleanTags(['_altnew_X', 'kb261', '', 'kb261'], D, true);
  assert.deepEqual(kept, ['_altnew_X', 'Kb261']);
  assert.deepEqual(hidden.map(h => h.reason), ['duplicate']);
});

test('hideReason names the pattern that hit; auto_hide_codes off keeps codes; a reviewed-and-kept key passes', () => {
  assert.deepEqual(hideReason('_label_Sale', D), { tag: '_label_Sale', reason: 'pattern', pattern: '^_' });
  assert.equal(hideReason('Kb261', D, undefined, new Set(['kb261'])), null);
  assert.equal(hideReason('2024', { ...D, auto_hide_codes: false }), null);
  assert.equal(hideReason('Lehenga', D), null);
});

test('patternProblem: empty, too long, nested quantifiers and backreferences refused; bad syntax refused', () => {
  assert.equal(patternProblem('^_'), null);
  assert.equal(patternProblem('^size[_ ]?chart$'), null);
  assert.ok(patternProblem(''));
  assert.ok(patternProblem('a'.repeat(81)));
  assert.ok(patternProblem('(a+)+$'));
  assert.ok(patternProblem('(a)\\1'));
  assert.ok(patternProblem('(?<=x)y'));
  assert.ok(patternProblem('[unclosed'));
  assert.equal(patternProblem('\\d+ off'), null);
  // a repeated group with alternation is exponential too; long chains of repeats are polynomial — both refused
  for (const p of ['(a|aa)+$', '(ab)*c', '(a|b){2,}', '^.*a.*a.*a.*a$', 'a++', 'x{2,}{3}']) assert.ok(patternProblem(p), p);
  for (const p of D.hide_patterns) assert.equal(patternProblem(p), null, p);
  for (const p of ['(ab)?c', '^[a-z]+\\d{2,}$', 'sale$', '[+*]x']) assert.equal(patternProblem(p), null, p);
});

test('tagSettings: defaults for a missing / broken value, bad patterns dropped, numbers clamped, exact hides keyed', () => {
  assert.deepEqual(tagSettings(undefined), D);
  const s = tagSettings({ hide_patterns: ['^_', '[bad', '(a+)+'], hide_exact: [' Sale '], max_per_product: 1000, min_len: 0, title_case: false, auto_hide_codes: 'yes' });
  assert.deepEqual(s.hide_patterns, ['^_']);
  assert.deepEqual(s.hide_exact, ['sale']);
  assert.equal(s.max_per_product, 100);
  assert.equal(s.min_len, 1);
  assert.equal(s.title_case, false);
  assert.equal(s.auto_hide_codes, true);
});

test('splitStoreTags: the comma string a store gives', () => {
  assert.deepEqual(splitStoreTags(' a, b ,, c '), ['a', 'b', 'c']);
  assert.deepEqual(splitStoreTags(undefined), []);
});
