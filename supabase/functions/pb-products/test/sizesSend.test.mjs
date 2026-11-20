// node --test --experimental-strip-types supabase/functions/pb-products/test/
// Sizes on Shopify in the one house format (sizes.ts + productInput.ts; owner, 20 Nov 2026: "Sizes: they are named
// six different ways"), and the product type from the category as it is now. A size that is only written another way
// keeps its Shopify variant (its id, carts and stock setting): nothing is deleted and made again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.Deno ??= { env: { get: () => '' } }; // productInput.ts reads Deno.env through shopify.ts
const { buildProductInput } = await import('../productInput.ts');

const L = { id: 'l1', title: 'Lehenga', description_html: '<p>x</p>', handle: 'lehenga', tags: [], price: 999, compare_at_price: null, seo_title: '', seo_description: '', product_type: null, image_alts: [], locked: [] };
const P = { id: 'p1', sku: 'NNK1133', source: 'import', sizes: ['M'], category: 'Lehenga', attributes: {} };
const SITE = { name: 'SuratMandi', track_inventory: false, api_version: '2026-10' };
const ask = (o = {}) => buildProductInput({ l: L, p: P, site: SITE, vendor: 'SuratMandi', files: null, live: true, sendStatus: false, existing: null, ...o });
/** A product as the store has it: one variant and one option value per label. */
const store = (...labels) => ({ id: 'gid://shopify/Product/1', handle: 'lehenga', media: [], tags: [],
  options: [{ id: 'o1', name: 'Size', values: labels.map((name, i) => ({ id: `val${i}`, name })) }],
  variants: labels.map((name, i) => ({ id: `var${i}`, key: `size=${name.toLowerCase()}` })) });
const sizes = (input) => input.productOptions[0].values.map(v => v.name);

test('a row that still holds a label as its source wrote it goes out in the house format', () => {
  const made = ask({ p: { ...P, sizes: ['38"', '2XL', 'xl', 'L Size, 40 Inch Stitched', 'Free'] } });
  assert.deepEqual(sizes(made), ['L (40)', 'XL', 'XXL', '38', 'Free Size']);
  assert.deepEqual(made.variants.map(v => v.inventoryItem.sku), ['NNK1133-L', 'NNK1133-XL', 'NNK1133-XXL', 'NNK1133-38', 'NNK1133-FreeSize']); // no quote mark, no "Size,40InchStitched"
  assert.deepEqual(made.variants.map(v => v.barcodes[0].value), made.variants.map(v => v.inventoryItem.sku));
  assert.deepEqual(sizes(ask({ p: { ...P, sizes: ['XS (34)', 'S (36)', 'M (38)'] } })), ['XS (34)', 'S (36)', 'M (38)'], 'the supplier\'s inches stay');
  assert.deepEqual(sizes(ask({ p: { ...P, sizes: ['M', 'L'] } })), ['M', 'L'], 'none are added');
});

test('a size written another way keeps its Shopify variant and its choice', () => {
  for (const [onStore, here, label] of [['38"', '38”', '38'], ['40 Size', '40 Inch', '40'], ['2XL', '2xl', 'XXL'], ['L Size, 40 Inch Stitched', 'L (40 Inch)', 'L (40)'], ['m', 'M', 'M']]) {
    const made = ask({ existing: store(onStore), p: { ...P, sizes: [here] } });
    assert.deepEqual([sizes(made), made.variants.map(v => v.id), made.productOptions[0].values.map(v => v.id)], [[label], ['var0'], ['val0']], `${onStore} → ${label}`);
  }
  // A whole product at once, in the house order: every variant goes back to its own size.
  const made = ask({ existing: store('XL', 'S', '2XL', 'M'), p: { ...P, sizes: ['xl', 's', '2XL', 'm'] } });
  assert.deepEqual(sizes(made), ['S', 'M', 'XL', 'XXL']);
  assert.deepEqual(made.variants.map(v => v.id), ['var1', 'var3', 'var0', 'var2']);
  assert.deepEqual(made.variants.map(v => v.position), [1, 2, 3, 4]);
});

test('no guessing: a size that is new, or that two store sizes could be, gets no variant of another', () => {
  assert.deepEqual(ask({ existing: store('M'), p: { ...P, sizes: ['M', 'L'] } }).variants.map(v => v.id), ['var0', undefined]);
  assert.deepEqual(ask({ existing: store('M (38)', 'M (40)'), p: { ...P, sizes: ['M'] } }).variants.map(v => v.id), [undefined]);
  assert.deepEqual(ask({ existing: store('38', '40'), p: { ...P, sizes: ['M (38)'] } }).variants.map(v => v.id), ['var0'], 'by the number, when the letter finds nothing');
  assert.deepEqual(ask({ existing: store('Custom Stitch'), p: { ...P, sizes: ['Custom Stitch (hand)'] } }).variants.map(v => v.id), ['var0'], 'a shape it does not know: by its label without the bracket part, as before');
});

test('the product type is the category as it is now; the listing\'s copy only when the product has none', () => {
  assert.equal(ask({ l: { ...L, product_type: 'Anarkali' }, p: { ...P, category: 'Salwar Suit' } }).productType, 'Salwar Suit');
  assert.equal(ask({ l: { ...L, product_type: 'Anarkali' }, p: { ...P, category: null } }).productType, 'Anarkali');
  assert.equal(ask({ p: { ...P, category: null } }).productType, '');
});

// Code check of 20 Nov 2026 (sizes reviewer): a bare letter beside its measured twin, two store labels of one size,
// a code that ends in a size written another way, and two sizes that share a letter.
test('a bare letter and its measured twin, both written another way, each keep their own variant', () => {
  for (const [onStore, here] of [[['XXXL', 'XXXL (46)'], ['3XL', '3XL (46)']], [['M Size', 'M (38 Inch)'], ['M', 'M (38)']]]) {
    const made = ask({ existing: store(...onStore), p: { ...P, sizes: here } });
    assert.deepEqual([sizes(made), made.variants.map(v => v.id), made.productOptions[0].values.map(v => v.id)], [here, ['var0', 'var1'], ['val0', 'val1']], onStore.join(' + '));
  }
});

test('two store labels that are one size: the size keeps one of their variants, nothing is made again', () => {
  const made = ask({ existing: store('38"', '38”'), p: { ...P, sizes: ['38'] } });
  assert.deepEqual([sizes(made), made.variants.map(v => v.id)], [['38'], ['var0']]);
});

test('a product code that ends in one of its sizes written another way: the size is not added twice', () => {
  const codes = (sku, list) => ask({ p: { ...P, sku, sizes: list } }).variants.map(v => v.inventoryItem.sku);
  assert.deepEqual(codes('AB-FREE', ['Free']), ['AB-FreeSize']);
  assert.deepEqual(codes('AB-XXXXL', ['XXXXL', 'XXXL']), ['AB-3XL', 'AB-4XL']);
  assert.deepEqual(codes('KB123-M-38', ['M-38', 'L-40']), ['KB123-M', 'KB123-L']);
  assert.deepEqual(codes('NNK1133-38"', ['38"']), ['NNK1133-38']);
  assert.deepEqual(codes('KB 302 MAROON', ['S', 'M']), ['KB 302 MAROON-S', 'KB 302 MAROON-M'], 'a code with no size at its end stays whole');
});

test('two sizes that share a letter never share a code: the measured one keeps its number', () => {
  const codes = (list) => ask({ p: { ...P, sizes: list } }).variants.map(v => v.inventoryItem.sku);
  assert.deepEqual(codes(['28 (S)', '30 (S)', '32 (M)', '34 (M)']), ['NNK1133-S28', 'NNK1133-S30', 'NNK1133-M32', 'NNK1133-M34']);
  assert.deepEqual(codes(['M', 'M (38)']), ['NNK1133-M', 'NNK1133-M38']);
  assert.deepEqual(codes(['XS (34)', 'S (36)', 'M (38)']), ['NNK1133-XS', 'NNK1133-S', 'NNK1133-M'], 'one size per letter: the letter alone, as before');
});
