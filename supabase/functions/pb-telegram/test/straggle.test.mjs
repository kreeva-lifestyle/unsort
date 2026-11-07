// node --test --experimental-strip-types supabase/functions/pb-telegram/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stragglers } from '../straggle.ts';

const used = [
  ...Array.from({ length: 10 }, (_, i) => ({ mid: 100 + i, album: 'g1', product_id: 'P1' })),
  ...Array.from({ length: 10 }, (_, i) => ({ mid: 120 + i, album: 'g3', product_id: 'P1' })), // P1 photos 100–109, 120–129
  { mid: 131, album: null, product_id: 'P1' },                                                 // its description
  ...Array.from({ length: 3 }, (_, i) => ({ mid: 140 + i, album: 'g9', product_id: 'P2' })),
];

test('a delayed album part joins the product its neighbours are in', () => {
  const r = stragglers([{ id: 1, mid: 112, kind: 'photo', album: 'g2' }, { id: 2, mid: 130, kind: 'video', album: null }], used);
  assert.deepEqual([...r.adopt], [[1, 'P1'], [2, 'P1']]);
  assert.deepEqual(r.dupes, []);
});

test('a late part of the last album of a product, after the next product began', () => {
  const r = stragglers([{ id: 3, mid: 143, kind: 'photo', album: 'g9' }], used);
  assert.deepEqual([...r.adopt], [[3, 'P2']]);
});

test('a post forwarded again is dropped; new posts and text are left alone', () => {
  const r = stragglers([{ id: 4, mid: 105, kind: 'photo', album: 'x' }, { id: 5, mid: 150, kind: 'photo', album: 'n' }, { id: 6, mid: 135, kind: 'photo', album: 'n2' }, { id: 7, mid: 125.5, kind: 'text', album: null }], used);
  assert.deepEqual(r.dupes, [4]);
  assert.deepEqual([...r.adopt], [], 'between two different products, or after the last: a new product');
});
