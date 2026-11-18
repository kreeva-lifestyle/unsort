// node --test --experimental-strip-types supabase/functions/pb-products/test/
// After an answer cut off at max_tokens the writer's next try thinks one step less (ai.ts lowerEffort; owner's
// SuratMandi writer at Haiku "high" was cut off on 85 % of listings, 17 Nov 2026, and every retry paid again).
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: () => 'test' } };
const { CUT_OFF, lowerEffort } = await import('../ai.ts');

test('one effort step down after a cut-off answer; the model default counts as high', () => {
  assert.deepEqual(['max', 'xhigh', 'high', '', null, 'medium', 'low', 'nonsense'].map(lowerEffort), ['high', 'high', 'medium', 'medium', 'medium', 'low', 'low', 'medium']);
  assert.ok(CUT_OFF.test('The AI answer was cut off — try a lower effort setting.'));
  assert.ok(!CUT_OFF.test('The AI service is overloaded — it will be tried again shortly.'));
});
