// node --test --experimental-strip-types supabase/functions/pb-products/test/
// "Let AI decide" by itself (fillAuto.ts; owner, 18 Nov 2026: "AI should auto select. No user inputs required. Product
// Type is not necessary if AI is not able to find a perfect fit"): products the claim hands out are filled with no person
// — a must-have attribute must get a value (the schema asks for one), Product Type ("only if it fits") may stay empty;
// paused or the day's AI limit reached takes nothing; a failure is logged and the next product still goes.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { autoFill } = await import('../fillAuto.ts');

const ATTRS = [{ id: 'col', name: 'Colour', key: 'colour', multi: false, position: 1, shopify_prefix: null, by_category: false, required: true },
  { id: 'type', name: 'Product Type', key: 'product type', multi: false, position: 2, shopify_prefix: null, by_category: true, required: false }];
const VALUES = [{ id: 'pink', attribute_id: 'col', name: 'Pink', key: 'pink', aliases: [], position: 1, categories: [] },
  { id: 'bl', attribute_id: 'type', name: 'Bridal Lehenga', key: 'bridal lehenga', aliases: [], position: 1, categories: ['Lehenga'] }];
const LINKS = [{ category: 'Lehenga', attribute_id: 'col', position: 1 }, { category: 'Lehenga', attribute_id: 'type', position: 2 }];
const P = (id) => ({ id, name: 'Lehenga choli', category: 'Lehenga', status: 'needs_info', locked: [], attributes: {}, raw_text: 'Lovely lehenga', source: 'telegram', missing_attrs: ['Colour'] });

function world({ claims = [['p1']], aiStatus = 200, aiError = 'busy', ai = { tags: { colour: { values: ['Pink'], other: [] }, product_type: { values: [], other: [] } } } } = {}) {
  const calls = { claims: 0, ai: [], set: [], activity: [], holds: [], refresh: [], patches: [] };
  const queue = [...claims];
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)), method = init.method || 'GET';
    const ok = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
    if (u.startsWith('https://api.anthropic.com/')) {
      calls.ai.push(JSON.parse(init.body));
      return aiStatus === 200 ? ok({ content: [{ type: 'text', text: JSON.stringify(ai) }], usage: {} }) : ok({ error: { message: aiError } }, aiStatus);
    }
    const path = u.replace('https://sb.example/rest/v1/', '');
    if (path === 'rpc/pb_tags_auto_claim') { calls.claims++; assert.equal(JSON.parse(init.body).p_limit, 1); return ok((queue.shift() ?? []).map(id => ({ id }))); }
    if (path === 'rpc/pb_tags_auto_hold') { calls.holds.push(JSON.parse(init.body).p_until); return ok(3); }
    if (path === 'rpc/pb_products_refresh') { calls.refresh.push(JSON.parse(init.body).p_ids); return ok([]); }
    if (path.startsWith('pb_products?id=eq.') && method === 'PATCH') { calls.patches.push([path, JSON.parse(init.body)]); return ok([{ id: 'x' }]); }
    if (path.startsWith('pb_attributes?')) return ok(ATTRS);
    if (path.startsWith('pb_attribute_values?')) return ok(VALUES);
    if (path.startsWith('pb_category_attributes?')) return ok(LINKS);
    if (path.startsWith('pb_settings?')) return ok([{ key: 'categories', value: ['Lehenga'] }]);
    if (path.startsWith('app_secrets?')) return ok([{ value: 'sk-test' }]);
    const m = /^pb_products\?id=eq\.(\w+)&status=eq\.needs_info&select=/.exec(path);
    if (m) return ok([P(m[1])]);
    if (path.startsWith('pb_product_values?')) return ok([]);
    if (path.startsWith('pb_product_images?')) return ok([]);
    if (path.startsWith('rpc/pb_product_values_set')) { calls.set.push(JSON.parse(init.body)); return ok([{ id: 'p1', status: 'ready', was: 'needs_info', missing: [] }]); }
    if (path.startsWith('rpc/pb_tag_suggest')) return ok(1);
    if (path.startsWith('pb_activity')) { calls.activity.push(JSON.parse(init.body)[0]); return ok([{}], 201); }
    throw new Error(`unexpected ${method} ${u}`);
  };
  return calls;
}
const opts = (over = {}) => ({ budget: { soft: Date.now() + 60_000, hard: Date.now() + 90_000 }, left: () => true, capped: async () => false, stopped: async () => false, ...over });

test('taken products are filled with no person: the colour must be chosen, Product Type only if it fits', async () => {
  const c = world();
  assert.equal(await autoFill(opts()), 1);
  assert.equal(c.claims, 2); // the second claim found nothing more
  const tags = c.ai[0].output_config.format.schema.properties.tags.properties;
  assert.equal(tags.colour.properties.values.minItems, 1);
  assert.equal(tags.product_type.properties.values.minItems, undefined);
  assert.match(c.ai[0].system, /Product Type \(one value; only if it fits\): Bridal Lehenga/);
  assert.deepEqual(c.set[0].p_rows, [{ value_id: 'pink', source: 'ai' }]);
  const done = c.activity.find(a => a.action === 'tags_filled');
  assert.equal(done.details.auto, true); assert.equal(done.details.manual, false); assert.equal(done.user_id, null);
});

test('paused or no time: nothing is taken; the day\'s AI limit: the waiting ones are held until the next day in India', async () => {
  for (const o of [{ stopped: async () => true }, { capped: async () => true }, { left: () => false }]) {
    const c = world();
    assert.equal(await autoFill(opts(o)), 0);
    assert.equal(c.claims, 0);
    if (!o.capped) { assert.equal(c.holds.length, 0); continue; }
    const IST = 5.5 * 3600_000, day = 86_400_000;
    assert.deepEqual(c.holds.map(Date.parse), [(Math.floor((Date.now() + IST) / day) + 1) * day - IST]);
  }
});

test('an AI that cannot be reached: the try is given back with a 30-minute wait, the gate runs again, and the rest wait', async () => {
  const c = world({ claims: [['p1'], ['p2']], aiStatus: 529 });
  const before = Date.now();
  assert.equal(await autoFill(opts()), 0);
  assert.equal(c.claims, 1, 'p2 is not taken while the AI is down');
  assert.deepEqual(c.activity.filter(a => a.action === 'failed').map(a => [a.product_id, a.details.step, a.details.auto]), [['p1', 'tags_fill', true]]);
  assert.deepEqual(c.refresh, [['p1']]);
  const [path, body] = c.patches[0];
  assert.ok(path.startsWith('pb_products?id=eq.p1')); assert.equal(body.tags_ai_at, null);
  assert.ok(Date.parse(body.tags_ai_retry_at) >= before + 30 * 60_000 - 1000);
});

test('a request that went wrong (refused) keeps the try used, runs the gate again, and the next product still goes', async () => {
  const c = world({ claims: [['p1'], ['p2']], aiStatus: 400, aiError: 'prompt is too long' });
  assert.equal(await autoFill(opts()), 0);
  assert.equal(c.claims, 3);
  assert.deepEqual(c.refresh, [['p1'], ['p2']]);
  assert.equal(c.patches.length, 0);
});
