// node --test --experimental-strip-types supabase/functions/pb-products/test/
// One format for size labels, in the app too (owner, 20 Nov 2026: "Sizes: they are named six different ways"). The
// product page and Add product write pb_products.sizes straight from the browser, so the app carries its own copy of
// the rule (src/playbook/data/sizes.ts). This holds it equal to the server's (sizes.ts): the same label, the same
// keys and the same list for every shape below. What the house format IS, is tested in sizes.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LETTERS, normalizeSize, normalizeSizes, sizeKeys } from '../sizes.ts';
import * as app from '../../../../src/playbook/data/sizes.ts';

// Every label Playbook held on 20 Nov 2026.
const LIVE = ['L (40)', 'M (38)', 'S (36)', 'XL (42)', 'XXL (44)', 'XS (34)', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '2XL', '38"', '38', '38”', '42"',
  '40 Inch', '40 Size', 'L (40 Inch)', 'L Size, 40 Inch Stitched', 'Free Size', 'Custom Stitch'];
// The examples the rule was written from, with what each becomes.
const EXAMPLES = [['38"', '38'], ['38”', '38'], ['38 Inch', '38'], ['Size: 38', '38'], ['40 Size', '40'], ['2XL', 'XXL'], ['xl', 'XL'],
  ['L (40 Inch)', 'L (40)'], ['L Size, 40 Inch Stitched', 'L (40)'], ['M(38)', 'M (38)'], ['M-38', 'M (38)'], ['38 (M)', 'M (38)'],
  ['Free', 'Free Size'], ['FS', 'Free Size'], ['Freesize', 'Free Size'], ['M/L', 'M/L'], ['38-40', '38-40'], ['2-3 Years', '2-3 Years'],
  ['Custom Stitch', 'Custom Stitch'], ['Semi-Stitched', 'Semi-Stitched'], ['M', 'M'], ['34', '34'], ['M (38)', 'M (38)'], ['XXXL', '3XL'], ['XXXXL', '4XL']];
const ODD = ['', '  m ', 'XXXL', '4 XL', 'M / L', '38-40', 'Free', 'FS', 'One Size', 'Custom Stitch', 'S (38)', '44 inch bust', "40''", 'L(40)', 'Size:40', '7XL', '100',
  ' ', '\t38\n', 'free-size', 'FREE SIZE', 'f.s', 'xxs', 'Xl', '6xl', '2 xl', '3 XL (46)', 'XL (42 inches)', '38in', '38 in', '38′′', '38＂', 'Ｍ', '３８', '38 (M) (L)',
  '38 40', 'M L', 'S20', 'KB302', '19', '20', '60', '61', '6', '038', '38.5', '32 Waist', 'M to XXL', 'Free Size (Up to 42)', 'Bust 40', 'Chest: 42 inches', 'Stitched',
  'size', 'Size M', 'M size', 'L-Size_40', 'L & XL', 'S+M', 'XL|42', '[XL]', 'XL;44', 'साइज़ M', 'M (३८)', 'a'.repeat(60), `XL ${'x'.repeat(50)}`];
// Not text at all: both must answer the same way.
const NOT_TEXT = [null, undefined, 38, 0, true, ['M'], {}, NaN];

// Every letter spelling beside every way a number is written with it.
const SPELLINGS = [...LETTERS, ...LETTERS.map(l => l.toLowerCase()), '2XL', 'XXXL', 'XXXXL', '2 XL', '3 xl', '5 XL', '7XL', 'XXXXXL', 'XM', ''];
const NUMBERS = ['', '38', '38"', "38''", '38 inch', '38 Inches', '38in', '(38)', '( 38 )', '-38', ': 38', ', 38 Inch Stitched', '/38', ' 38 bust', '19', '61', '100', '38 40', 'size 38', 'Size38'];
const MADE = SPELLINGS.flatMap(s => NUMBERS.flatMap(n => [`${s}${n}`, `${s} ${n}`, `${n} ${s}`, `${s} Size ${n}`]));

const ALL = [...LIVE, ...EXAMPLES.map(e => e[0]), ...ODD, ...MADE];

test('the app\'s copy gives the house format for the examples the rule was written from', () => {
  for (const [given, want] of EXAMPLES) assert.equal(app.normalizeSize(given), want, JSON.stringify(given));
  for (const label of LIVE) assert.equal(app.normalizeSize(app.normalizeSize(label)), app.normalizeSize(label), JSON.stringify(label)); // stable
  assert.deepEqual(app.LETTERS, LETTERS);
});

test('one label: the app and the server give the same label and the same keys', () => {
  assert.ok(ALL.length > 2500, `only ${ALL.length} labels`); // the made-up table really was built
  for (const label of [...ALL, ...NOT_TEXT]) {
    assert.equal(app.normalizeSize(label), normalizeSize(label), `normalizeSize(${JSON.stringify(label)})`);
    assert.deepEqual(app.sizeKeys(label), sizeKeys(label), `sizeKeys(${JSON.stringify(label)})`);
  }
});

test('a product\'s sizes: the app and the server give the same list, in the same order', () => {
  const lists = [
    LIVE, [...LIVE].reverse(), EXAMPLES.map(e => e[0]), ODD, [...ODD].reverse(), NOT_TEXT,
    ['XL', 's', 'M', 'S', '2XL', 'L'], ['M (38)', 'XS (34)', 'L (40)'], ['S', 'S (36)', 'M (38)', 'M (40)'], ['42"', '38', 'Free Size', 'M', 'Custom Stitch', '38”'],
    ['m', 'M', ' M ', 'M (38)', 'm(38)', '38 (M)'], ['Free', 'FS', 'Free Size', 'One Size'], ['44', '40', '38"', '42', '36', '40 Inch'],
    Array.from({ length: 50 }, (_, i) => `Odd ${i}`), Array.from({ length: 45 }, (_, i) => String(20 + i)), ['x'.repeat(41), `${'y'.repeat(39)} z`, 'XL'], [], [''], ['', '  ', null],
  ];
  for (let i = 0; i + 7 <= MADE.length; i += 5) lists.push(MADE.slice(i, i + 7)); // every made-up label, a few at a time
  for (const list of lists) assert.deepEqual(app.normalizeSizes(list), normalizeSizes(list), JSON.stringify(list).slice(0, 200));
  for (const notList of [null, undefined, 'M, L', 38, {}]) assert.deepEqual(app.normalizeSizes(notList), normalizeSizes(notList));
  assert.deepEqual(app.normalizeSizes(['XL', 's', '38"', 'Free', 'M', '2XL', 'Custom Stitch']), ['S', 'M', 'XL', 'XXL', '38', 'Free Size', 'Custom Stitch']);
});

test('the two files hold the same code: a change to one is copied to the other', () => {
  const code = (url) => { const s = readFileSync(url, 'utf8'); return s.slice(s.indexOf('export const LETTERS')); };
  assert.equal(code(new URL('../../../../src/playbook/data/sizes.ts', import.meta.url)), code(new URL('../sizes.ts', import.meta.url)),
    'src/playbook/data/sizes.ts and supabase/functions/pb-products/sizes.ts differ: copy everything from "export const LETTERS" down from the one you changed into the other.');
});
