// node --test --experimental-strip-types supabase/functions/pb-products/test/
// "Let AI decide" (tagFill.ts) against a fake database and a fake AI (fetch is replaced):
// the pass asks ONLY for the empty required attributes, writes 'ai' rows in 'add' mode, re-runs
// the gate, always leaves the queue and ticks the run; a locked product is skipped; an AI error
// counts as "left empty" without losing the queue entry's tick.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { fillQueued } = await import('../tagFill.ts');

const TAX = {
  attrs: [{ id: 'col', name: 'Colour', key: 'colour', multi: true, position: 1, shopify_prefix: null }, { id: 'work', name: 'Work', key: 'work', multi: true, position: 2, shopify_prefix: null }],
  values: [{ id: 'pink', attribute_id: 'col', name: 'Pink', key: 'pink', aliases: [], position: 1 }, { id: 'emb', attribute_id: 'work', name: 'Embroidery', key: 'embroidery', aliases: [], position: 1 }],
  links: [{ category: 'Lehenga', attribute_id: 'col', position: 1 }, { category: 'Lehenga', attribute_id: 'work', position: 2 }],
  categories: ['Lehenga'],
};
const PRODUCT = { id: 'p1', name: 'Lehenga choli', category: 'Lehenga', status: 'needs_info', locked: [], attributes: {}, raw_text: 'Cosmos with beads', source: 'telegram', missing_attrs: ['Colour'] };

function world({ product = PRODUCT, ai = { tags: { colour: { values: ['Pink'], other: [] } } }, aiStatus = 200 } = {}) {
  const calls = { ai: [], set: [], ticks: [], patches: [] };
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)); const method = init.method || 'GET';
    const ok = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
    if (u.startsWith('https://api.anthropic.com/')) {
      calls.ai.push(JSON.parse(init.body));
      return aiStatus === 200 ? ok({ content: [{ type: 'text', text: JSON.stringify(ai) }], usage: {} }) : ok({ error: { message: 'busy' } }, aiStatus);
    }
    const path = u.replace('https://sb.example/rest/v1/', '');
    if (path.startsWith('app_secrets?')) return ok([{ value: 'sk-test' }]);
    if (path.startsWith('pb_products?id=eq.p1&select=')) return ok([product]);
    if (path.startsWith('pb_product_values?')) return ok([{ value_id: 'emb', source: 'manual', pb_attribute_values: { attribute_id: 'work' } }]);
    if (path.startsWith('pb_settings?')) return ok([]);
    if (path.startsWith('pb_product_images?')) return ok([]);
    if (path.startsWith('rpc/pb_product_values_set')) { const b = JSON.parse(init.body); calls.set.push(b); return ok([{ id: 'p1', status: 'ready', was: 'needs_info', missing: [] }]); }
    if (path.startsWith('rpc/pb_tag_fill_tick')) { calls.ticks.push(JSON.parse(init.body)); return ok(null); }
    if (path.startsWith('rpc/pb_tag_suggest')) return ok(1);
    if (method === 'PATCH') { calls.patches.push([path, JSON.parse(init.body)]); return ok([]); }
    if (path.startsWith('pb_activity')) return ok([]);
    throw new Error(`unexpected ${method} ${u}`);
  };
  return calls;
}
const budget = () => ({ soft: Date.now() + 60_000, hard: Date.now() + 90_000 });

test('fills only the empty required attribute (Work has a manual value), as ai rows in add mode; leaves the queue; ticks', async () => {
  const c = world();
  await fillQueued({ id: 'p1', tag_fill_run: 'run1' }, TAX, null, budget());
  assert.equal(c.ai.length, 1);
  const schema = c.ai[0].output_config.format.schema;
  assert.deepEqual(Object.keys(schema.properties.tags.properties), ['colour']); // never asks for Work
  assert.deepEqual(c.set[0], { p_product: 'p1', p_rows: [{ value_id: 'pink', source: 'ai' }], p_mode: 'add', p_attributes: null });
  assert.ok(c.patches.some(([p, b]) => p.includes('tag_fill_run=eq.run1') && b.tag_fill_run === null));
  assert.deepEqual(c.ticks, [{ p_run: 'run1', p_filled: 1, p_left: 0 }]);
});

test('a locked product is skipped (no AI call) but still leaves the queue', async () => {
  const c = world({ product: { ...PRODUCT, locked: ['tags'] } });
  await fillQueued({ id: 'p1', tag_fill_run: 'run1' }, TAX, null, budget());
  assert.equal(c.ai.length, 0);
  assert.deepEqual(c.ticks, [{ p_run: 'run1', p_filled: 0, p_left: 0 }]);
});

test('the AI refuses: counted as left empty, queue entry cleared, nothing written', async () => {
  const c = world({ aiStatus: 400 });
  await fillQueued({ id: 'p1', tag_fill_run: 'run1' }, TAX, null, budget());
  assert.equal(c.set.length, 0);
  assert.deepEqual(c.ticks, [{ p_run: 'run1', p_filled: 0, p_left: 1 }]);
  assert.ok(c.patches.some(([, b]) => b.tag_fill_run === null));
});

test('a value outside the list is never written', async () => {
  const c = world({ ai: { tags: { colour: { values: ['Maroon'], other: ['Maroon'] } } } });
  await fillQueued({ id: 'p1', tag_fill_run: 'run1' }, TAX, null, budget());
  assert.deepEqual(c.set[0].p_rows, []);
});
