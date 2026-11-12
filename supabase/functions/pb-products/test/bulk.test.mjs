// node --test --experimental-strip-types supabase/functions/pb-products/test/
// Bulk re-price (bulk.ts): which listings get a new price, which are left.
import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.Deno ??= { env: { get: () => '' } }; // db.ts reads Deno.env
const { newPrice } = await import('../bulk.ts');

const PRICING = { markup_pct: 100, add_flat: 0, rounding: 'none', compare_at_pct: 0, min_price: null };
const l = (o = {}) => ({ price: 2000, compare_at_price: null, locked: [], pb_products: { cost_price: 1000, sell_price: null, status: 'ready' }, ...o });

test('bulk re-price: the saved formula decides, a hand-typed price stays, an unchanged one is left', () => {
  assert.equal(newPrice(l(), PRICING, null), 'same');
  assert.deepEqual(newPrice(l(), { ...PRICING, markup_pct: 150 }, null), { price: 2500, compare_at_price: null });
  assert.deepEqual(newPrice(l(), { ...PRICING, compare_at_pct: 50 }, null), { price: 2000, compare_at_price: 3000 }); // only the "was" price moved
  assert.equal(newPrice(l({ locked: ['price'] }), { ...PRICING, markup_pct: 150 }, null), 'kept');
  assert.deepEqual(newPrice(l(), PRICING, { markup_pct: 50, add_flat: 100 }), { price: 1600, compare_at_price: null }); // the rule's own price
  assert.equal(newPrice(l({ pb_products: { cost_price: null, sell_price: null, status: 'ready' } }), PRICING, null), 'none');
  // a product copied with its selling price sells at that price on every website: the formula is skipped
  assert.equal(newPrice(l({ price: 1499, pb_products: { cost_price: 1000, sell_price: 1499, status: 'ready' } }), { ...PRICING, markup_pct: 300 }, null), 'same');
});
