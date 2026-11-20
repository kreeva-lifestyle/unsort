// node --test --experimental-strip-types supabase/functions/pb-products/test/
// One format for size labels (sizes.ts; owner, 20 Nov 2026: "Sizes: they are named six different ways"). The table
// below is every label Playbook held that day plus the shapes it must leave alone. Nothing is ever added: "M" never
// gains inches, a bare number never gains a letter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LETTERS, normalizeSize, normalizeSizes, sizeKeys } from '../sizes.ts';

const TABLE = [
  // as held on 20 Nov 2026 → the house format
  ['M (38)', 'M (38)'], ['XS (34)', 'XS (34)'], ['XXL (44)', 'XXL (44)'], ['M', 'M'], ['XL', 'XL'], ['3XL', '3XL'], ['Free Size', 'Free Size'],
  ['38"', '38'], ['38”', '38'], ['38', '38'], ['42"', '42'], ['40 Inch', '40'], ['40 Size', '40'], ['2XL', 'XXL'],
  ['L (40 Inch)', 'L (40)'], ['L Size, 40 Inch Stitched', 'L (40)'], ['Custom Stitch', 'Custom Stitch'],
  // other spellings of the same shapes
  ['xl', 'XL'], [' m ', 'M'], ['XXXL', '3XL'], ['xxxxl', '4XL'], ['2 XL', 'XXL'], ['M(38)', 'M (38)'], ['M-38', 'M (38)'], ['38 (M)', 'M (38)'],
  ['Size: 38', '38'], ["40''", '40'], ['38in', '38'], ['44 inch bust', '44'], ['XL (42 inches)', 'XL (42)'], ['Free', 'Free Size'], ['FS', 'Free Size'], ['Freesize', 'Free Size'], ['free-size', 'Free Size'],
  // never corrected, never guessed: left as they are
  ['S (38)', 'S (38)'], ['M/L', 'M/L'], ['38-40', '38-40'], ['M to XXL', 'M to XXL'], ['2-3 Years', '2-3 Years'], ['32 Waist', '32 Waist'],
  ['Semi-Stitched', 'Semi-Stitched'], ['Free Size (Up to 42)', 'Free Size (Up to 42)'], ['One Size', 'One Size'], ['S20', 'S20'], ['KB302', 'KB302'],
  ['7XL', '7XL'], ['100', '100'], ['6', '6'], ['', ''],
];

test('every label in the house format', () => {
  for (const [given, want] of TABLE) assert.equal(normalizeSize(given), want, JSON.stringify(given));
});

test('the house format is stable: formatting it again changes nothing', () => {
  for (const [, want] of TABLE) assert.equal(normalizeSize(want), want, JSON.stringify(want));
});

test('nothing is added: a letter never gains inches, a number never gains a letter', () => {
  for (const l of LETTERS) assert.equal(normalizeSize(l), l);
  for (const n of [34, 36, 38, 40, 42, 44]) assert.equal(normalizeSize(String(n)), String(n));
});

test('a product\'s sizes: one of each, in one order', () => {
  assert.deepEqual(normalizeSizes(['XL', 's', 'M', 'S', '2XL', 'L']), ['S', 'M', 'L', 'XL', 'XXL']);
  assert.deepEqual(normalizeSizes(['M (38)', 'XS (34)', 'L (40)']), ['XS (34)', 'M (38)', 'L (40)']);
  assert.deepEqual(normalizeSizes(['S', 'S (36)', 'M (38)', 'M (40)']), ['S', 'S (36)', 'M (38)', 'M (40)']); // a bare letter and its measured twin are two labels
  assert.deepEqual(normalizeSizes(['42"', '38', 'Free Size', 'M', 'Custom Stitch', '38”']), ['M', '38', '42', 'Free Size', 'Custom Stitch']);
  assert.deepEqual(normalizeSizes(['XS', 'S', 'M', 'L', 'XL', 'Custom Stitch']), ['XS', 'S', 'M', 'L', 'XL', 'Custom Stitch']);
  assert.deepEqual(normalizeSizes(null), []);
  assert.deepEqual(normalizeSizes(['', '  ', null]), []);
  assert.equal(normalizeSizes(Array.from({ length: 50 }, (_, i) => `Odd ${i}`)).length, 30);
});

test('what two labels of one size share, for giving a renamed size its Shopify variant back', () => {
  assert.deepEqual(sizeKeys('38"'), sizeKeys('38'));
  assert.deepEqual(sizeKeys('2XL')[0], sizeKeys('XXL')[0]);
  assert.equal(sizeKeys('L Size, 40 Inch Stitched')[0], sizeKeys('L (40)')[0]);
  assert.equal(sizeKeys('M (38)')[1], sizeKeys('38')[1]); // the number alone
  assert.notEqual(sizeKeys('M')[0], sizeKeys('L')[0]);
  assert.deepEqual(sizeKeys('M'), ['m', '']);
  assert.deepEqual(sizeKeys('Custom Stitch (hand)'), ['custom stitch', '']);
});

// Code check of 20 Nov 2026 (sizes reviewer): a shape it does not know comes back exactly as written, and bare numbers
// outside 20..60 sort with the other numbers instead of after Free Size.
test('a shape it does not know comes back as written: no fraction or quote is changed, "+" and "&" are part of the size', () => {
  for (const l of ['5½ Mtr', '2½ Years', '38½', 'Kid’s 2-3Y', 'XL+', 'M+', '40+', 'M & L']) assert.equal(normalizeSize(l), l, l);
  assert.deepEqual(normalizeSizes(['XL', 'XL+']), ['XL', 'XL+'], 'two sizes stay two');
});

test('a scale of bare numbers keeps its order, wherever it crosses 20 or 60', () => {
  assert.deepEqual(normalizeSizes(['16', '18', '20', '22', '24', '26']), ['16', '18', '20', '22', '24', '26']);
  assert.deepEqual(normalizeSizes(['6', '8', '10', '12', '14', '16', '18', '20', '22']), ['6', '8', '10', '12', '14', '16', '18', '20', '22']);
  assert.deepEqual(normalizeSizes(['58"', '60"', '62', '64']), ['58', '60', '62', '64']);
  assert.deepEqual(normalizeSizes(['Free Size', '18', '20']), ['18', '20', 'Free Size']);
});
