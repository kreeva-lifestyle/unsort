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
