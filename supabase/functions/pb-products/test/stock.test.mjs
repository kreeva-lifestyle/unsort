// node --test --experimental-strip-types supabase/functions/pb-products/test/
// Stock of products already here, refreshed by a repeat import (import/stock.ts),
// and the stock a first import hands over (import/body.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.Deno ??= { env: { get: () => '' } }; // db.ts reads Deno.env
const { stockChange } = await import('../import/stock.ts');
const { importFacts, ingestBody } = await import('../import/body.ts');

const here = (o = {}) => ({ in_stock: true, sizes: ['S (36)', 'M (38)'], locked: [], ...o });

test('repeat import: sold out and back in stock follow the store; nothing changes when nothing did', () => {
  assert.equal(stockChange(here(), { in_stock: true, sizes: ['S (36)', 'M (38)'] }), null);
  assert.deepEqual(stockChange(here(), { in_stock: false, sizes: ['S (36)', 'M (38)', 'L (40)'] }), { in_stock: false }); // a sold-out product lists every size: the sizes stay
  assert.deepEqual(stockChange(here({ in_stock: false }), { in_stock: true, sizes: ['M (38)'] }), { in_stock: true, sizes: ['M (38)'] });
});

test('repeat import: the sizes on sale follow the store, unless someone typed them', () => {
  assert.deepEqual(stockChange(here(), { in_stock: true, sizes: ['M (38)', 'L (40)'] }), { sizes: ['M (38)', 'L (40)'] });
  assert.equal(stockChange(here({ locked: ['sizes'] }), { in_stock: true, sizes: ['M (38)'] }), null);
  assert.equal(stockChange(here(), { in_stock: true, sizes: [] }), null);                 // the store names no sizes: ours stay
  assert.equal(stockChange(here(), { in_stock: true, sizes: [' S (36) ', 'M  (38)'] }), null); // the same sizes, spaced differently
});

test('first import: a product that is sold out at its store arrives out of stock', () => {
  const f = { ref: '1', name: 'Kurta', url: 'https://x.example/products/kurta', sku: null, description: '', price: null, compare_at: null, currency: null, in_stock: false, sizes: [], color: null, images: [] };
  assert.equal(ingestBody(f, { host: 'x.example', use_their_price: true }, 'X').in_stock, false);
  assert.ok(!('in_stock' in ingestBody({ ...f, in_stock: true }, { host: 'x.example', use_their_price: true }, 'X')));
  assert.deepEqual(importFacts({ source: 'import', in_stock: false }), { in_stock: false });
  assert.deepEqual(importFacts({ source: 'import', in_stock: true }), {});
  assert.throws(() => importFacts({ source: 'telegram', in_stock: false }), e => e.status === 400); // only an import may say so
});
