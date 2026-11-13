import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePacer, mergeCursor, planBatches, startCursor } from '../lib/batch.mjs';
import { m, svc, makeClock } from './fake.mjs';

// The KUMARI_ART shape: album of 10, album of 10, 2 videos, description,
// "200 Less", separator sticker — then the next product's album.
const kumari = [
  ...Array.from({ length: 10 }, (_, i) => m(101 + i, 'a1')),
  ...Array.from({ length: 10 }, (_, i) => m(111 + i, 'a2')),
  m(121), m(122), m(123), m(124), m(125),
  m(126, 'b1'), m(127, 'b1'), m(128, 'b1'),
];

test('albums go in one call each, singles one by one, in channel order', () => {
  const { units, more, held } = planBatches(kumari, 100);
  assert.equal(more, false);
  assert.equal(held, false);
  assert.deepEqual(units.map(u => u.ids.length), [10, 10, 1, 1, 1, 1, 1, 3]);
  assert.deepEqual(units[0].ids, [101, 102, 103, 104, 105, 106, 107, 108, 109, 110]);
  assert.equal(units[1].lastId, 120);
  assert.deepEqual(units.slice(2, 7).map(u => u.ids[0]), [121, 122, 123, 124, 125]);
});

test('input order does not matter, two albums back to back stay apart', () => {
  const { units } = planBatches([m(3, 'y'), m(1, 'x'), m(2, 'x'), m(4, 'y')], 100);
  assert.deepEqual(units.map(u => u.ids), [[1, 2], [3, 4]]);
});

test('the same groupedId split by another message makes two calls', () => {
  const { units } = planBatches([m(1, 'x'), m(2), m(3, 'x')], 100);
  assert.deepEqual(units.map(u => u.ids), [[1], [2], [3]]);
});

test('service messages are skipped but still move the cursor', () => {
  const { units } = planBatches([m(1), svc(2), m(3)], 100);
  assert.deepEqual(units, [{ ids: [1], dates: [null], lastId: 1 }, { skip: true, lastId: 2 }, { ids: [3], dates: [null], lastId: 3 }]);
});

test('a full page that ends in an album holds that album for the next page', () => {
  const page = [...Array.from({ length: 97 }, (_, i) => m(i + 1)), m(98, 'z'), m(99, 'z'), m(100, 'z')];
  const { units, more, held } = planBatches(page, 100);
  assert.equal(more, true);
  assert.equal(held, true);
  assert.equal(units.length, 97);
  assert.equal(units[units.length - 1].lastId, 97);
});

test('a short page never holds its last album', () => {
  const { units, held } = planBatches([m(1), m(2, 'z'), m(3, 'z')], 100);
  assert.equal(held, false);
  assert.deepEqual(units.at(-1).ids, [2, 3]);
});

test('first look at a channel starts after its newest message', () => {
  assert.equal(startCursor(kumari.slice(-1), 0), 128);
  assert.equal(startCursor([], 0), 0);
  assert.equal(startCursor([], 5), 0);
});

test('backfill copies the last N messages without cutting an album', () => {
  assert.equal(startCursor(kumari, 5), 123);                // 124..128
  assert.equal(startCursor(kumari, 12), 110);               // 117 is mid-album a2 → from 111
  assert.equal(startCursor(kumari.slice(-3), 10), 125);     // fewer than asked: all of them
});

test('cursor merge: further one wins, null means unset', () => {
  assert.equal(mergeCursor(null, null), null);
  assert.equal(mergeCursor(null, undefined), null);
  assert.equal(mergeCursor(null, 50), 50);
  assert.equal(mergeCursor(60, 50), 60);
  assert.equal(mergeCursor(40, '50'), 50);
  assert.equal(mergeCursor(0, null), 0);
});

test('pacer keeps calls at least the gap apart', async () => {
  const clock = makeClock();
  const pacer = makePacer(1200, clock.sleep, clock.now);
  await pacer.wait();
  clock.advance(200);
  await pacer.wait();
  await pacer.wait();
  assert.deepEqual(clock.waits, [1000, 1200]);
});
