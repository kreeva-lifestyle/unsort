// node --test --experimental-strip-types supabase/functions/pb-products/test/
// What Playbook knows about each kind of garment (garment.ts), and what that
// puts on the Shopify product (productInput.ts): the store's brand as vendor,
// Shopify's standard category, each size's own code, and what an update keeps
// of the product as the store has it (the photos and tags: publishParts.test.mjs).
// Owner, 2026-11-12, from the research report "Product listing SEO and AEO".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedFacts, FACT_ORDER, garmentKind, shopCategory } from '../garment.ts';
globalThis.Deno ??= { env: { get: () => '' } }; // productInput.ts → db.ts reads Deno.env
const { buildProductInput, skuBase, skuParts, weightOf } = await import('../productInput.ts');

const gid = (id) => `gid://shopify/TaxonomyCategory/${id}`;

test('Shopify category: one place per garment, none when Playbook cannot tell', () => {
  assert.equal(shopCategory('Saree'), gid('aa-1-23-2-1'));
  assert.equal(shopCategory('Lehenga'), gid('aa-1-23-2-2'));
  assert.equal(shopCategory('Kurta Set'), gid('aa-1-23-7'));
  assert.equal(shopCategory('kurti'), gid('aa-1-23-7'));
  assert.equal(shopCategory('Salwar Suit'), gid('aa-1-23-10'));
  assert.equal(shopCategory('Gown'), gid('aa-1-4'));
  assert.equal(shopCategory('Dupatta'), gid('aa-2-31-4'));
  assert.equal(shopCategory('Blouse'), gid('aa-1-13-1'));
  assert.equal(shopCategory('Co-ord Set'), gid('aa-1-11'));
  for (const c of ['Indo-Western', 'Kids Wear', '', null]) assert.equal(shopCategory(c), null);
});

test('an anarkali is a suit set with a bottom or dupatta, a dress alone', () => {
  assert.equal(shopCategory('Anarkali', '1 Anarkali, 1 Dupatta & 1 Pant'), gid('aa-1-23-10'));
  assert.equal(shopCategory('Anarkali', 'Anarkali with palazzo'), gid('aa-1-23-10'));
  assert.equal(shopCategory('Anarkali', '1 Anarkali'), gid('aa-1-4'));
  assert.equal(shopCategory('Anarkali'), gid('aa-1-4'));
  assert.equal(garmentKind('Anarkali Kurta Set'), 'anarkali'); // the more exact word wins
});

test('buying facts: each garment has its own, and a fixed bullet order', () => {
  assert.ok(expectedFacts('Saree').some(f => f.includes('blouse piece')) && expectedFacts('Saree').includes('the saree length'));
  assert.ok(expectedFacts('Lehenga').some(f => f.includes('can-can')) && expectedFacts('Lehenga').some(f => f.includes('stitched, semi-stitched or unstitched')));
  assert.ok(expectedFacts('Kurta Set').includes('the bottom type'));
  assert.deepEqual(expectedFacts('Kids Wear'), ['what is in the set', 'the fabric', 'measurements', 'care']);
  assert.ok(FACT_ORDER.startsWith('what is in the set') && FACT_ORDER.endsWith('care') && !/\bsizes\b/.test(FACT_ORDER)); // sizes are the size choices, not a bullet
});

const L = { id: 'l1', title: 'Maroon Georgette Kurta Set', description_html: '<p>x</p>', handle: 'maroon-kurta-set', tags: ['Kurta Set'], price: 999, compare_at_price: null, seo_title: '', seo_description: '', product_type: null, image_alts: ['Front view', 'Back view'], locked: [] };
const P = { id: 'p1', sku: 'RG-1', sizes: ['M', 'L'], category: 'Kurta Set', attributes: { set_contents: 'Kurta, Pant and Dupatta' } };
const SITE = { name: 'Kreeva India', track_inventory: false };
const FILES = [{ originalSource: 'https://x/a/1.jpg', alt: 'Front view', contentType: 'IMAGE' }, { originalSource: 'https://x/a/2.jpg', alt: 'Back view', contentType: 'IMAGE' }];
const ask = (o = {}) => buildProductInput({ l: L, p: P, site: SITE, vendor: 'Kreeva', files: FILES, live: true, sendStatus: true, existing: null, ...o });
const STORE = { id: 'gid://shopify/Product/1', handle: 'maroon-kurta-set', options: [], variants: [], media: [], tags: [] };

test('Shopify product: the store brand is the vendor; the category goes out with a create', () => {
  const made = ask();
  assert.equal(made.vendor, 'Kreeva');
  assert.equal(made.category, gid('aa-1-23-7'));
  assert.equal(made.productType, 'Kurta Set');
  assert.deepEqual(made.files.map(f => f.alt), ['Front view', 'Back view']);
  const update = ask({ existing: STORE, sendStatus: false, files: null });
  assert.ok(!('category' in update) && !('files' in update) && !('status' in update)); // what people set in Shopify stays
  assert.equal(update.vendor, 'Kreeva');
  assert.ok(!('category' in ask({ p: { ...P, category: 'Kids Wear' } })));
  assert.ok(!('category' in ask({ noCategory: true }))); // the store refused it: the product still goes out
});

test('sizes on Shopify: one choice per size, each with the base SKU plus its own size', () => {
  assert.equal(skuBase('NKB 47 PURPLE XS', ['XS', 'S', 'M']), 'NKB 47 PURPLE');          // a copied product carries its first size's SKU
  assert.equal(skuBase('KB 313 YELLOW XS', ['XS (34)', 'S (36)']), 'KB 313 YELLOW');     // the size with its measurement
  assert.equal(skuBase('KB-280-M', ['M', 'L']), 'KB-280');
  assert.equal(skuBase('RG-1', ['M', 'L']), 'RG-1');                                      // no size at the end: untouched
  assert.equal(skuBase('KB 302 XL', ['S', 'M']), 'KB 302');                               // the code's own size sold out: still a size
  assert.equal(skuBase('KB 9 FS', ['Free Size']), 'KB 9');
  assert.equal(skuBase('SAREE-RED-M', ['Free Size']), 'SAREE-RED-M');                     // "-M" on a free-size product is not a size
  assert.equal(skuBase('KB 302 XL', ['38', '40']), 'KB 302 XL');                          // nor on one sold by number
  assert.equal(skuBase('KB 302 MAROON', ['S', 'M']), 'KB 302 MAROON');                    // a colour is not a size
  assert.equal(skuBase('KBXL', ['XL']), 'KBXL');                                          // only after a joiner
  assert.equal(skuBase('DUPATTA-12-FS', []), 'DUPATTA-12-FS');                            // a product with no sizes keeps its code whole
  assert.equal(skuBase('XS', ['XS']), 'XS');
  const made = ask({ p: { ...P, sku: 'NKB 47 PURPLE XS', sizes: ['XS (34)', 'S (36)', 'Free Size'] } });
  // every size gets the store's own code back: the same base, the same joiner, its own size
  assert.deepEqual(made.variants.map(v => v.inventoryItem.sku), ['NKB 47 PURPLE XS', 'NKB 47 PURPLE S', 'NKB 47 PURPLE FreeSize']);
  assert.deepEqual(skuParts('KB-280-M', ['M', 'L']), { base: 'KB-280', join: '-' });
  assert.deepEqual(skuParts('RG-1042', ['M', 'L']), { base: 'RG-1042', join: '-' });
  assert.deepEqual(ask({ p: { ...P, sku: 'RG-1042', sizes: ['M', 'L'] } }).variants.map(v => v.inventoryItem.sku), ['RG-1042-M', 'RG-1042-L']); // a code with no size: joined with a hyphen
  assert.deepEqual(ask({ p: { ...P, sku: 'NKB 75 PINK-1', sizes: ['XS (34)', 'S (36)'] } }).variants.map(v => v.inventoryItem.sku), ['NKB 75 PINK-1-XS', 'NKB 75 PINK-1-S']);
  assert.equal(ask({ p: { ...P, sku: 'RG-9', sizes: [] } }).variants[0].inventoryItem.sku, 'RG-9'); // no sizes: the code as it is
  assert.deepEqual(made.productOptions[0].values.map(v => v.name), ['XS (34)', 'S (36)', 'Free Size']); // the shopper still sees the measurement
  assert.equal(made.productOptions[0].name, 'Size');
});

test('an update keeps the sizes the store has: same variant for a relabelled size, weight and cost only on new ones', () => {
  const existing = { ...STORE,
    options: [{ id: 'o1', name: 'Size', values: [{ id: 'v-s', name: 'S' }, { id: 'v-m', name: 'M' }] }],
    variants: [{ id: 'var-s', key: 'size=s' }, { id: 'var-m', key: 'size=m' }] };
  const p = { ...P, sizes: ['S (36)', 'M (38)', 'L (40)', 'l (40)'], cost_price: 640, attributes: { ...P.attributes, weight: '700 g' } };
  const made = ask({ existing, p, sendStatus: false, files: null });
  assert.deepEqual(made.variants.map(v => v.id), ['var-s', 'var-m', undefined]);          // "L" twice (another case) is one size
  assert.deepEqual(made.productOptions[0].values, [{ id: 'v-s', name: 'S (36)' }, { id: 'v-m', name: 'M (38)' }, { name: 'L (40)' }]);
  assert.equal(made.productOptions[0].id, 'o1');
  assert.deepEqual(made.variants[2].inventoryItem, { tracked: false, measurement: { weight: { value: 700, unit: 'GRAMS' } }, cost: '640.00', sku: 'RG-1-L' });
  assert.deepEqual(made.variants[0].inventoryItem, { sku: 'RG-1-S' });                    // what Shopify has for an existing size stays
  assert.ok(!('inventoryPolicy' in made.variants[0]) && made.variants[2].inventoryPolicy === 'CONTINUE');
  // two store sizes with the same core: no guessing, matched by the exact label only
  const twice = { ...existing, variants: [{ id: 'a', key: 'size=s (36)' }, { id: 'b', key: 'size=s (38)' }] };
  assert.deepEqual(ask({ existing: twice, p: { ...P, sizes: ['S'] }, sendStatus: false, files: null }).variants.map(v => v.id), [undefined]);
  // two sizes here that could both be the store's "S": the label match takes it, the other is new (never one variant twice)
  const both = ask({ existing, p: { ...P, sizes: ['S', 'S (36)', 'M (38)', 'M (40)'] }, sendStatus: false, files: null });
  assert.deepEqual(both.variants.map(v => v.id), ['var-s', undefined, undefined, undefined]);
  assert.deepEqual(both.productOptions[0].values.map(v => v.id), ['v-s', undefined, undefined, undefined]);
  assert.deepEqual(weightOf('1.25 kg'), { value: 1.25, unit: 'KILOGRAMS' });
  for (const w of ['', 'heavy', '0 g', null]) assert.equal(weightOf(w), null);
});

test('a choice someone added in Shopify stops the update instead of being deleted', () => {
  const existing = { ...STORE, options: [{ id: 'o1', name: 'Size', values: [] }, { id: 'o2', name: 'Colour', values: [] }] };
  assert.throws(() => ask({ existing, sendStatus: false, files: null }), e => e.status === 400 && /Kreeva India: this product has a choice on Shopify that Playbook did not make \(Colour\)/.test(e.message));
  assert.doesNotThrow(() => ask({ existing: { ...STORE, options: [{ id: 'o1', name: 'Title', values: [{ id: 'v', name: 'Default Title' }] }] }, sendStatus: false, files: null })); // a product that had no sizes
});
