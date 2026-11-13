// node --test --experimental-strip-types supabase/functions/pb-products/test/
// "Check website": do the products name who makes them? (import/maker.ts)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makerTally, makersOf } from '../import/maker.ts';

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
