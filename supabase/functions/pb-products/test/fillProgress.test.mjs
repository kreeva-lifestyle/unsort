// node --test --experimental-strip-types supabase/functions/pb-products/test/
// "Let AI decide" progress (fillProgress.ts sumFill, pure): the newest batch of runs together, with what is left, the
// pace and the minutes that leaves (owner, 13 Nov 2026: "do not know whether its completed or how much is completed, or
// when it will get completed. How many are remaining of the total").
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno ??= { env: { get: () => '' } }; // db.ts reads Deno.env
const { sumFill } = await import('../fillProgress.ts');

const at = (min) => new Date(Date.UTC(2026, 10, 13, 21, 0) + min * 60_000).toISOString();
const run = (id, total, filled, created, finished = null, left_empty = 0) => ({ id, total, filled, left_empty, created_at: at(created), finished_at: finished === null ? null : at(finished) });

test('three requests a minute apart are one batch: 55 of 136 done, 81 left, about 17 minutes at 5 a minute', () => {
  const r = sumFill([run('c', 2, 0, 17), run('b', 1, 0, 16.5), run('a', 133, 55, 16)], 81, 25);
  assert.deepEqual(r, { id: 'c', total: 136, done: 55, waiting: 81, filled: 55, left_empty: 0, created_at: at(16), finished_at: null, runs: 3, per_min: 5, eta_min: 17, blocked: null });
});

test('all finished: done, with what was filled, what still needs a person and when it ended', () => {
  const r = sumFill([run('c', 2, 1, 17, 40, 1), run('a', 133, 133, 16, 38)], 0, 0);
  assert.deepEqual({ done: r.done, waiting: r.waiting, filled: r.filled, left_empty: r.left_empty, finished_at: r.finished_at, per_min: r.per_min, eta_min: r.eta_min },
    { done: 135, waiting: 0, filled: 134, left_empty: 1, finished_at: at(40), per_min: null, eta_min: null });
});

test('an older finished request is not part of the batch; an older one still open is', () => {
  const r = sumFill([run('new', 10, 0, 120), run('old-done', 50, 50, 0, 20), run('old-open', 4, 1, 10)], 13, 0);
  assert.deepEqual({ total: r.total, runs: r.runs, created_at: r.created_at }, { total: 14, runs: 2, created_at: at(10) });
});

test('not started yet: no pace, no estimate; a reason is given only while products wait', () => {
  let r = sumFill([run('a', 12, 0, 0)], 12, 0, 'paused');
  assert.deepEqual({ per_min: r.per_min, eta_min: r.eta_min, blocked: r.blocked }, { per_min: 0, eta_min: null, blocked: 'paused' });
  r = sumFill([run('a', 12, 12, 0, 5)], 0, 0, 'limit');
  assert.equal(r.blocked, null);
  assert.equal(sumFill([], 0, 0), null);
});
