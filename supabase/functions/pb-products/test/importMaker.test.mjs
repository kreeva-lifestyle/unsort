// node --test --experimental-strip-types supabase/functions/pb-products/test/
// "Check website": do the products name who makes them? (import/maker.ts)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makerTally, makersOf, skipList, skipsMaker } from '../import/maker.ts';

const tally = (list, site) => { const t = makerTally(); list.forEach(f => t.add(f)); return t.result(site); };

test('one product: page data, a "made by" or "Brand:" line, then the brand / vendor field', () => {
  assert.deepEqual(makersOf({ description: 'Pure organza\nManufactured / Packed by :     Shayam Creation\n\nThere may be slight color variation', meta: { brand: 'ACRIINE' } }), ['Shayam Creation', 'ACRIINE']);
  assert.deepEqual(makersOf({ description: 'Marketed by S.K. Creations. Wash with care.' }), ['S.K. Creations']);
  assert.deepEqual(makersOf({ description: 'Manufacturer: Kashtbhanjan Fashion, Surat' }), ['Kashtbhanjan Fashion']);
  assert.deepEqual(makersOf({ description: 'Brand: Shubhkala  |  Fabric: Silk' }), ['Shubhkala']);
  assert.deepEqual(makersOf({ meta: { manufacturer: 'Rangoli Mills', brand: 'Rangoli Mills' } }), ['Rangoli Mills']); // once
  assert.deepEqual(makersOf({ description: 'A brand new design for weddings. Made with love.' }), []); // no "by", no "Brand:"
  assert.deepEqual(makersOf({ description: 'Packed by: 123' }), []); // not a name
});

test('acriine.in: every product shows the website\'s own name; one description names the maker', () => {
  const own = { description: 'Rust orange organza kurta set', meta: { brand: 'ACRIINE' } };
  const r = tally([...Array.from({ length: 390 }, () => own), { description: 'Manufactured / Packed by : Shayam Creation', meta: { brand: 'Acriine' } }], { name: 'Acriine', host: 'acriine.in' });
  assert.deepEqual(r, { checked: 391, named: 1, names: [{ name: 'Shayam Creation', products: 1 }], own: 'ACRIINE' });
});

test('a reseller with real makers on most products; the website\'s own name by its site name or host', () => {
  const r = tally([
    { meta: { brand: 'Kashtbhanjan' } }, { meta: { brand: 'Kashtbhanjan' } }, { meta: { brand: 'kashtbhanjan' } },
    { meta: { brand: 'Shubhkala' } }, { meta: { brand: 'Bahu Palace Fashion' } }, {},
  ], { name: 'Bahu Palace', host: 'www.bahupalace.com' });
  assert.deepEqual(r, { checked: 6, named: 4, names: [{ name: 'Kashtbhanjan', products: 3 }, { name: 'Shubhkala', products: 1 }], own: 'Bahu Palace Fashion' });
});

test('nothing named at all; short hosts do not swallow other names', () => {
  assert.deepEqual(tally([{ description: 'Silk saree' }, {}], { name: null, host: 'example.com' }), { checked: 2, named: 0, names: [], own: null });
  assert.deepEqual(tally([{ meta: { brand: 'Kbc Silks' } }], { name: 'KB', host: 'kb.in' }).named, 1); // "kb" is not "kbcsilks"
  assert.deepEqual(tally([], { name: 'Shop', host: 'shop.in' }), { checked: 0, named: 0, names: [], own: null });
});

test('the manufacturers to leave out: clean names, no repeats (case and spaces aside), at most 50', () => {
  assert.deepEqual(skipList(['  Shayam   Creation ', 'shayam creation', 'X', 7, null, 'Rangoli Mills']), ['Shayam Creation', 'Rangoli Mills']);
  assert.equal(skipList(Array.from({ length: 80 }, (_, i) => `Maker ${i}`)).length, 50);
  assert.deepEqual(skipList('Shayam Creation'), []); // not a list
});

test('a product is left out only when it names a manufacturer on the list', () => {
  const skip = ['Shayam Creation'];
  assert.equal(skipsMaker({ description: 'Manufactured / Packed by : SHAYAM creation' }, skip), true); // case aside
  assert.equal(skipsMaker({ meta: { brand: 'Shayam Creation' } }, skip), true);
  assert.equal(skipsMaker({ meta: { manufacturer: 'shayam-creation' } }, skip), true);
  assert.equal(skipsMaker({ meta: { brand: 'ACRIINE' } }, skip), false);
  assert.equal(skipsMaker({}, skip), false); // names none: always imported
  assert.equal(skipsMaker({ meta: { brand: 'Shayam Creation' } }, []), false);
});

test('an import run passes over a left-out manufacturer\'s products before fetching or adding anything', async () => {
  globalThis.Deno ??= { env: { get: () => '' } }; // db.ts (under ingest.ts) reads Deno.env
  const { addProducts } = await import('../import/batch.ts');
  const f = (ref, o) => ({ ref, name: ref, url: '', sku: null, description: '', price: 100, compare_at: null, currency: 'INR', in_stock: true, sizes: [], color: null, images: [], ...o });
  const items = [f('1', { meta: { brand: 'Shayam Creation' } }), f('2', { description: 'Marketed by shayam creation' }), f('3', { in_stock: false })];
  const counts = { found: 0, added: 0, skipped: 0, out_of_stock: 0, failed: 0, maker_skipped: 0 };
  const run = { id: 'r', host: 'x.in', use_their_price: true, platform: 'shopify', in_stock_only: true, skip_makers: ['Shayam Creation'] };
  const ctx = { run, origin: 'https://x.in', robots: {}, vendor: 'V', perItem: false, until: Date.now() + 60_000, worked: false, gate: { blocked: false }, known: async () => new Set() };
  assert.deepEqual(await addProducts(items, 0, counts, ctx), { next: 3, taken: [] });
  assert.deepEqual(counts, { found: 3, added: 0, skipped: 0, out_of_stock: 1, failed: 0, maker_skipped: 2 });
});
