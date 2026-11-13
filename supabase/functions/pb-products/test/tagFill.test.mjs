// node --test --experimental-strip-types supabase/functions/pb-products/test/
// "Let AI decide" (tagFill.ts) against a fake database and a fake AI (fetch is replaced): the word rules first,
// then the AI ONLY for the empty required attributes they did not settle, rows written for those attributes only, then
// the gate, and ticks the run; a locked product is skipped; an AI error counts as "left empty" without
// losing the queue entry's tick. Leaving the queue comes FIRST and is the claim: a product another
// worker run already took is neither filled nor ticked.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { closeFills, fillQueued } = await import('../tagFill.ts');

const TAX = {
  attrs: [{ id: 'col', name: 'Colour', key: 'colour', multi: true, position: 1, shopify_prefix: null }, { id: 'work', name: 'Work', key: 'work', multi: true, position: 2, shopify_prefix: null }],
  values: [{ id: 'pink', attribute_id: 'col', name: 'Pink', key: 'pink', aliases: [], position: 1 }, { id: 'emb', attribute_id: 'work', name: 'Embroidery', key: 'embroidery', aliases: [], position: 1 }],
  links: [{ category: 'Lehenga', attribute_id: 'col', position: 1 }, { category: 'Lehenga', attribute_id: 'work', position: 2 }],
  categories: ['Lehenga'],
};
const PRODUCT = { id: 'p1', name: 'Lehenga choli', category: 'Lehenga', status: 'needs_info', locked: [], attributes: {}, raw_text: 'Cosmos with beads', source: 'telegram', missing_attrs: ['Colour'] };

const MANUAL_WORK = [{ value_id: 'emb', source: 'manual', pb_attribute_values: { attribute_id: 'work' } }];
function world({ product = PRODUCT, ai = { tags: { colour: { values: ['Pink'], other: [] } } }, aiStatus = 200, taken = false, bulk = false, finishedAt = null, waiting = false, reached = 1, values = MANUAL_WORK } = {}) {
  const calls = { ai: [], set: [], ticks: [], patches: [], tagged: [], closed: [] };
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)); const method = init.method || 'GET';
    const ok = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
    if (u.startsWith('https://api.anthropic.com/')) {
      calls.ai.push(JSON.parse(init.body));
      return aiStatus === 200 ? ok({ content: [{ type: 'text', text: JSON.stringify(ai) }], usage: {} }) : ok({ error: { message: 'busy' } }, aiStatus);
    }
    const path = u.replace('https://sb.example/rest/v1/', '');
    const run = Object.entries(init.headers || {}).find(([k]) => k.toLowerCase() === 'x-pb-bulk')?.[1];
    if (run) calls.tagged.push([path.split('?')[0], run]);
    if (path.startsWith('pb_bulk_runs?') && method === 'GET') return ok(bulk ? [{ id: 'run1', kind: 'tag_fill' }] : []); // the queue's bulk change, while open
    if (path.startsWith('pb_tag_fill_runs?') && method === 'GET') return ok([{ finished_at: finishedAt }]);
    if (path.startsWith('pb_products?tag_fill_run=eq.run1')) return ok(waiting ? [{ id: 'p9' }] : []);
    if (path.startsWith('pb_bulk_items?') && method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '0-0/3' } });
    if (path.startsWith('rpc/pb_bulk_products')) return ok(reached);
    if (path.startsWith('pb_bulk_items?')) return ok([]);
    if (path.startsWith('pb_bulk_runs?') && method === 'DELETE') { calls.closed.push('dropped'); return new Response(null, { status: 204 }); }
    if (path.startsWith('app_secrets?')) return ok([{ value: 'sk-test' }]);
    if (path.startsWith('pb_products?id=eq.p1&select=')) return ok([product]);
    if (path.startsWith('pb_product_values?')) return ok(values);
    if (path.startsWith('pb_settings?')) return ok([]);
    if (path.startsWith('pb_product_images?')) return ok([]);
    if (path.startsWith('rpc/pb_product_values_set')) { const b = JSON.parse(init.body); calls.set.push(b); return ok([{ id: 'p1', status: 'ready', was: 'needs_info', missing: [] }]); }
    if (path.startsWith('rpc/pb_tag_fill_tick')) { calls.ticks.push(JSON.parse(init.body)); return ok(null); }
    if (path.startsWith('rpc/pb_tag_suggest')) return ok(1);
    if (method === 'PATCH') { calls.patches.push([path, JSON.parse(init.body)]); return ok(taken ? [] : [{ id: 'p1' }]); }
    if (path.startsWith('pb_activity')) return ok([]);
    throw new Error(`unexpected ${method} ${u}`);
  };
  return calls;
}
const budget = () => ({ soft: Date.now() + 60_000, hard: Date.now() + 90_000 });

test('fills only the empty required attribute (Work has a manual value), as ai rows for it alone; leaves the queue; ticks', async () => {
  const c = world();
  await fillQueued({ id: 'p1', tag_fill_run: 'run1' }, TAX, null, budget());
  assert.equal(c.ai.length, 1);
  const schema = c.ai[0].output_config.format.schema;
  assert.deepEqual(Object.keys(schema.properties.tags.properties), ['colour']); // never asks for Work
  assert.deepEqual(c.set[0], { p_product: 'p1', p_rows: [{ value_id: 'pink', source: 'ai' }], p_mode: 'auto', p_attributes: ['col'] });
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

test('a product another worker run already took: no AI call, no tick, reported as not done', async () => {
  const c = world({ taken: true });
  assert.equal(await fillQueued({ id: 'p1', tag_fill_run: 'run1' }, TAX, null, budget()), false);
  assert.equal(c.ai.length, 0);
  assert.deepEqual(c.ticks, []);
});

test('the claim comes before the AI call, and a tick with an empty reply (204) is not an error', async () => {
  const c = world();
  const real = globalThis.fetch;
  const order = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url));
    if (u.startsWith('https://api.anthropic.com/')) order.push('ai');
    else if (init.method === 'PATCH' && u.includes('tag_fill_run=eq.run1')) order.push('claim');
    else if (u.includes('rpc/pb_tag_fill_tick')) { c.ticks.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); }
    return real(url, init);
  };
  assert.equal(await fillQueued({ id: 'p1', tag_fill_run: 'run1' }, TAX, null, budget()), true);
  assert.deepEqual(order, ['claim', 'ai']);
  assert.deepEqual(c.ticks, [{ p_run: 'run1', p_filled: 1, p_left: 0 }]);
});

test('a value outside the list is never written', async () => {
  const c = world({ ai: { tags: { colour: { values: ['Maroon'], other: ['Maroon'] } } } });
  await fillQueued({ id: 'p1', tag_fill_run: 'run1' }, TAX, null, budget());
  assert.deepEqual(c.set[0].p_rows, []);
});

const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

test('a queued "Let AI decide" is a bulk change: the values and suggestions carry it, and a product never closes it', async () => {
  const c = world({ bulk: true, finishedAt: minutesAgo(10), reached: 2, ai: { tags: { colour: { values: ['Pink'], other: ['Rose gold'] } } } });
  await fillQueued({ id: 'p1', tag_fill_run: 'run1' }, TAX, null, budget());
  assert.deepEqual(c.tagged.map(([p]) => p).filter(p => p.startsWith('rpc/')), ['rpc/pb_product_values_set', 'rpc/pb_tag_suggest']);
  assert.ok(c.tagged.every(([, r]) => r === 'run1'));
  assert.ok(!c.tagged.some(([p]) => p === 'rpc/pb_tag_fill_tick'), 'the progress tick is not part of it');
  // another worker run may still be writing a product it took: closing (or dropping) the change then would refuse that write
  assert.ok(!c.patches.some(([p]) => p.startsWith('pb_bulk_runs?')) && !c.closed.length);
});

test('the worker closes it once nothing waits and the last product was taken 5 minutes ago or more', async () => {
  let c = world({ bulk: true, finishedAt: minutesAgo(6), reached: 2 });
  assert.equal(await closeFills(), 1);
  const close = c.patches.find(([p]) => p.startsWith('pb_bulk_runs?'));
  assert.equal(close[1].status, 'done'); assert.equal(close[1].items, 2); assert.equal(close[1].details.unit, 'products');
  c = world({ bulk: true, finishedAt: minutesAgo(2), reached: 2 }); // too soon
  assert.equal(await closeFills(), 0);
  c = world({ bulk: true, waiting: true }); // products still wait in the queue
  assert.equal(await closeFills(), 0);
  assert.ok(!c.patches.length);
  c = world({ bulk: true, finishedAt: null }); // nothing waits but no tick finished it (its last products were archived): marked, closed later
  assert.equal(await closeFills(), 0);
  assert.ok(c.patches.some(([p, b]) => p.startsWith('pb_tag_fill_runs?id=eq.run1&finished_at=is.null&created_at=lt.') && b.finished_at));
  c = world({ bulk: true, finishedAt: minutesAgo(6), reached: 1 }); // it reached one product in the end: an edit, not a bulk change
  assert.equal(await closeFills(), 1);
  assert.deepEqual(c.closed, ['dropped']);
});

test('a queue with no open bulk change (made before the log knew it) writes untagged: a tag the log does not know is refused', async () => {
  const c = world({ bulk: false });
  await fillQueued({ id: 'p1', tag_fill_run: 'run1' }, TAX, null, budget());
  assert.equal(c.set.length, 1);
  assert.deepEqual(c.tagged, []);
});

// Word rules first (owner, 13 Nov 2026: rules, then AI, then a person).
const TAX3 = {
  ...TAX,
  attrs: [...TAX.attrs, { id: 'occ', name: 'Occasion', key: 'occasion', multi: true, position: 3, shopify_prefix: null }],
  values: [...TAX.values, { id: 'party', attribute_id: 'occ', name: 'Party', key: 'party', aliases: [], position: 1 }],
  links: [...TAX.links, { category: 'Lehenga', attribute_id: 'occ', position: 3 }],
};

test('the words settle it: a product whose text names its colour gets it from the rules, with no AI call', async () => {
  const c = world({ product: { ...PRODUCT, raw_text: 'Pink lehenga with beads' } });
  await fillQueued({ id: 'p1', tag_fill_run: 'run1' }, TAX, null, budget());
  assert.equal(c.ai.length, 0);
  assert.deepEqual(c.set[0], { p_product: 'p1', p_rows: [{ value_id: 'pink', source: 'rules' }], p_mode: 'auto', p_attributes: ['col'] });
  assert.deepEqual(c.ticks, [{ p_run: 'run1', p_filled: 1, p_left: 0 }]);
});

test('the AI is asked only for what the words left empty, and both are written together', async () => {
  const c = world({ product: { ...PRODUCT, raw_text: 'Pink lehenga with beads' }, ai: { tags: { occasion: { values: ['Party'], other: [] } } } });
  await fillQueued({ id: 'p1', tag_fill_run: 'run1' }, TAX3, null, budget());
  assert.equal(c.ai.length, 1);
  assert.deepEqual(Object.keys(c.ai[0].output_config.format.schema.properties.tags.properties), ['occasion']); // never asks for Colour
  assert.deepEqual(c.set[0].p_rows, [{ value_id: 'pink', source: 'rules' }, { value_id: 'party', source: 'ai' }]);
});

test('the AI refuses: what the words found is still written, and the product counts as left', async () => {
  const c = world({ product: { ...PRODUCT, raw_text: 'Pink lehenga with beads' }, aiStatus: 400 });
  await fillQueued({ id: 'p1', tag_fill_run: 'run1' }, TAX3, null, budget());
  assert.deepEqual(c.set.map(s => s.p_rows), [[{ value_id: 'pink', source: 'rules' }]]);
  assert.deepEqual(c.ticks, [{ p_run: 'run1', p_filled: 0, p_left: 1 }]);
});

// Values that depend on the category (owner, 13 Nov 2026: Product Type — "so no mistake can happen").
const TAXT = {
  ...TAX,
  attrs: [...TAX.attrs, { id: 'type', name: 'Product Type', key: 'product type', multi: false, position: 3, shopify_prefix: null, by_category: true }],
  values: [...TAX.values,
    { id: 'bridal', attribute_id: 'type', name: 'Bridal Lehenga', key: 'bridal lehenga', aliases: [], position: 1, categories: ['Lehenga'] },
    { id: 'anarkali', attribute_id: 'type', name: 'Anarkali', key: 'anarkali', aliases: [], position: 2, categories: ['Salwar Suit'] },
    { id: 'gown', attribute_id: 'type', name: 'Gown', key: 'gown', aliases: [], position: 3, categories: [] }],
  links: [...TAX.links, { category: 'Lehenga', attribute_id: 'type', position: 3 }],
};

test('Product Type: the AI picks only from the values ticked for the product\'s category; a person\'s value from another category goes first', async () => {
  const c = world({
    values: [{ value_id: 'pink', source: 'rules', pb_attribute_values: { attribute_id: 'col' } }, ...MANUAL_WORK,
      { value_id: 'anarkali', source: 'manual', pb_attribute_values: { attribute_id: 'type' } }], // chosen when it was a Salwar Suit
    ai: { tags: { product_type: { values: ['Bridal Lehenga'], other: [] } } },
  });
  await fillQueued({ id: 'p1', tag_fill_run: 'run1' }, TAXT, null, budget());
  const props = c.ai[0].output_config.format.schema.properties.tags.properties;
  assert.deepEqual(Object.keys(props), ['product_type']); // Colour and Work have values that count; Anarkali does not here
  assert.deepEqual(props.product_type.properties.values.items.enum, ['Bridal Lehenga']); // not Anarkali (Salwar Suit), not Gown (no category)
  assert.deepEqual(c.set.map(s => [s.p_mode, s.p_attributes, s.p_rows]), [['manual', ['type'], []], ['auto', ['type'], [{ value_id: 'bridal', source: 'ai' }]]]);
  assert.deepEqual(c.ticks, [{ p_run: 'run1', p_filled: 1, p_left: 0 }]);
});

test('Product Type: an AI value from another category is replaced the same way, with nothing to clear first', async () => {
  const c = world({
    values: [{ value_id: 'pink', source: 'rules', pb_attribute_values: { attribute_id: 'col' } }, ...MANUAL_WORK,
      { value_id: 'anarkali', source: 'ai', pb_attribute_values: { attribute_id: 'type' } }],
    ai: { tags: { product_type: { values: ['Bridal Lehenga'], other: [] } } },
  });
  await fillQueued({ id: 'p1', tag_fill_run: 'run1' }, TAXT, null, budget());
  assert.deepEqual(c.set.map(s => [s.p_mode, s.p_attributes, s.p_rows]), [['auto', ['type'], [{ value_id: 'bridal', source: 'ai' }]]]);
});
