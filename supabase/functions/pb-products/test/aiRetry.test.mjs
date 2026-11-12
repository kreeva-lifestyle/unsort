// node --test --experimental-strip-types supabase/functions/pb-products/test/
// A busy AI is not a failed try (aiRetry.ts, pre-launch check 2026-11-13, D4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.Deno ??= { env: { get: () => '' } }; // db.ts reads Deno.env
const { aiBusy, busyRun } = await import('../aiRetry.ts');
const { FREE_RETRIES } = await import('../publishParts.ts');
const { HttpError } = await import('../http.ts');

const busy = (step = 'generate') => ({ action: 'failed', details: { step, temporary: true } });
const real = (step = 'generate') => ({ action: 'failed', details: { step, error: 'The AI request was refused (400).' } });

test('busy = rate limit, overloaded, too slow or unreachable; a refusal or a rejected key is a real failure', () => {
  assert.deepEqual([503, 504].map(s => aiBusy(new HttpError(s, 'x'))), [true, true]);
  assert.deepEqual([400, 409, 422, 502].map(s => aiBusy(new HttpError(s, 'x'))), [false, false, false, false]);
  assert.equal(aiBusy(new Error('boom')), false);
});

test('busy failures in a row are counted newest first, back to the last success or real failure', () => {
  assert.equal(busyRun([], 'generate'), 0);
  assert.equal(busyRun([busy(), busy(), busy()], 'generate'), 3);
  assert.equal(busyRun([busy(), busy(), { action: 'generated', details: null }, busy()], 'generate'), 2, 'a success ends the run');
  assert.equal(busyRun([busy(), real(), busy()], 'generate'), 1, 'a real failure ends the run');
  assert.equal(busyRun([real(), busy()], 'generate'), 0);
  assert.equal(busyRun([busy('read'), busy('route')], 'read'), 1, 'only this step');
  assert.equal(busyRun([{ action: 'failed', details: null }], 'read'), 0);
  // After FREE_RETRIES in a row the next busy failure counts like any other, so nothing is retried for ever.
  assert.equal(busyRun(Array.from({ length: FREE_RETRIES + 1 }, () => busy()), 'generate') < FREE_RETRIES, false);
});
