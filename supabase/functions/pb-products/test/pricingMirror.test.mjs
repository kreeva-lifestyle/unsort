// node --test --experimental-strip-types supabase/functions/pb-products/test/
// The random was price (owner, 2026-11-13): each product gets its own whole %
// in the website's range, picked from its id and the same every time; and the
// app's copy of the price rule (src/playbook/data/pricing.ts) gives the same
// prices as the server's (pricing.ts) for the same product.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareAt, comparePct, computePrice, listingPrice, rangeSpot } from '../pricing.ts';
import * as app from '../../../../src/playbook/data/pricing.ts';
globalThis.Deno ??= { env: { get: () => '' } }; // db.ts (under bulk.ts) reads Deno.env
const { newPrice } = await import('../bulk.ts');

// Ids that differ only in their last digits: the hardest case for spreading them out.
const ids = Array.from({ length: 4200 }, (_, i) => `6f1c2a7e-0b3d-4c5e-9a8b-${String(i).padStart(12, '0')}`);
const RANGE = { markup_pct: 100, add_flat: 0, rounding: 'end_99', compare_at_pct: 20, compare_at_max_pct: 40, min_price: null };

test('a range gives each product a whole % from From to To, the same one every time, every % about as often', () => {
  const count = new Map();
  for (const id of ids) {
    const pct = comparePct(RANGE, id);
    assert.ok(Number.isInteger(pct) && pct >= 20 && pct <= 40, `${id} got ${pct}`);
    assert.equal(comparePct(RANGE, id), pct);
    count.set(pct, (count.get(pct) || 0) + 1);
  }
  assert.equal(count.size, 21); // 20, 21 … 40: both ends included
  for (const [pct, n] of count) assert.ok(n > 120 && n < 280, `${pct}% was picked ${n} times of ${ids.length}`);
  const spots = ids.slice(0, 50).map(rangeSpot);
  assert.ok(spots.every(s => s >= 0 && s < 1));
  assert.ok(new Set(spots.map(s => s.toFixed(6))).size === 50);
});

test('one % when there is no range, To is not above From, or there is no product id', () => {
  const id = ids[7];
  assert.equal(comparePct({ ...RANGE, compare_at_max_pct: null }, id), 20);
  assert.equal(comparePct({ markup_pct: 100, compare_at_pct: 30 }, id), 30); // older settings without the key
  assert.equal(comparePct({ ...RANGE, compare_at_max_pct: 20 }, id), 20);
  assert.equal(comparePct({ ...RANGE, compare_at_max_pct: 10 }, id), 20);
  assert.equal(comparePct(RANGE, null), 20);
  assert.equal(comparePct(RANGE, ''), 20);
  assert.deepEqual(computePrice(1000, RANGE), { price: 2099, compare_at: 2599 }); // 2,099 × 1.2 = 2,518.8 → 2,599
});

test('From 0 leaves some products without a was price; a From with a fraction keeps its fraction', () => {
  const zero = { ...RANGE, compare_at_pct: 0, compare_at_max_pct: 3 };
  const got = new Set(ids.map(id => compareAt(2099, zero, id)));
  assert.ok(got.has(null) && got.has(2199) && got.size === 2); // 1–3% of 2,099 all round to 2,199
  const half = { ...RANGE, compare_at_pct: 25.5, compare_at_max_pct: 30 };
  assert.deepEqual([...new Set(ids.map(id => comparePct(half, id)))].sort((a, b) => a - b), [25.5, 26.5, 27.5, 28.5, 29.5]);
});

test('every price path uses the product id: from the cost, a copied price, a re-price', () => {
  const id = ids.find(x => comparePct(RANGE, x) === 37);
  const was = Math.ceil((2099 * 1.37 + 1) / 100) * 100 - 1; // 2,875.63 → 2,899
  assert.deepEqual(listingPrice({ id, cost_price: 1000, sell_price: null }, RANGE, null), { price: 2099, compare_at: was });
  assert.deepEqual(listingPrice({ id, cost_price: null, sell_price: 2099 }, RANGE), { price: 2099, compare_at: was });
  assert.equal(compareAt(2099, RANGE, id), was);
  const l = { price: 2099, compare_at_price: was, locked: [], pb_products: { id, cost_price: 1000, sell_price: null, status: 'ready' } };
  assert.equal(newPrice(l, RANGE, null), 'same'); // re-pricing again changes nothing
  assert.deepEqual(newPrice({ ...l, compare_at_price: 2599 }, RANGE, null), { price: 2099, compare_at_price: was });
});

const CONFIGS = [
  RANGE,
  { ...RANGE, rounding: 'none', compare_at_pct: 10, compare_at_max_pct: 60 },
  { ...RANGE, rounding: 'nearest_10', add_flat: 75, compare_at_pct: 5, compare_at_max_pct: 6 },
  { ...RANGE, rounding: 'end_49_99', min_price: 1499, compare_at_pct: 0, compare_at_max_pct: 45 },
  { ...RANGE, compare_at_max_pct: null, compare_at_pct: 30 },
  { ...RANGE, compare_at_max_pct: 15 },
  { markup_pct: 80, add_flat: 60, rounding: 'end_99', compare_at_pct: 0, min_price: null },
];

test('the app shows exactly what the server charges, product by product', () => {
  for (const cfg of CONFIGS) for (const [i, id] of ids.slice(0, 400).entries()) {
    const cost = 150 + i * 37.5, override = i % 3 ? null : { markup_pct: 150, add_flat: 200 };
    assert.equal(app.rangeSpot(id), rangeSpot(id));
    assert.equal(app.comparePct(cfg, id), comparePct(cfg, id));
    assert.deepEqual(app.previewPrice(cost, cfg, override, id), computePrice(cost, cfg, override, id), `${JSON.stringify(cfg)} cost ${cost}`);
    assert.equal(app.compareAtPrice(cost, cfg, id), compareAt(cost, cfg, id));
  }
  assert.deepEqual(app.previewPrice(1000, RANGE), computePrice(1000, RANGE)); // no product: the From %
});

test('the preview range is the lowest and highest was price any product can get', () => {
  for (const cfg of CONFIGS.filter(c => c.compare_at_max_pct > c.compare_at_pct)) {
    const price = computePrice(1000, cfg).price, r = app.compareAtRange(price, cfg);
    const all = ids.map(id => compareAt(price, cfg, id));
    const real = all.filter(v => v != null);
    assert.equal(r.high, Math.max(...real));
    assert.equal(r.low, all.includes(null) ? null : Math.min(...real));
  }
  assert.equal(app.compareAtRange(2099, { ...RANGE, compare_at_max_pct: null }), null);
  assert.equal(app.compareAtRange(2099, { ...RANGE, compare_at_max_pct: 20 }), null);
});

test('the editor refuses a range whose To is not above its From', () => {
  assert.equal(app.badWasRange(RANGE), false);
  assert.equal(app.badWasRange({ ...RANGE, compare_at_max_pct: null }), false);
  assert.equal(app.badWasRange({ compare_at_pct: 30 }), false);
  assert.equal(app.badWasRange({ ...RANGE, compare_at_max_pct: 20 }), true);
  assert.equal(app.badWasRange({ ...RANGE, compare_at_max_pct: 0 }), true);
});
