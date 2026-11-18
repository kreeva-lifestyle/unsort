// node --test --experimental-strip-types supabase/functions/pb-products/test/
// Which tag values a save may replace (owner, 13 Nov 2026, after the scrape-mapping research): the read, "Retag all"
// and the retag after a suggestion replace ONLY the attributes they checked — the category's linked ones — so what the
// import found for the others stays; with nothing linked they replace nothing. The import itself checks every attribute.
// A fake database (fetch is replaced) records each pb_product_values_set / pb_product_values_bulk call.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { autoTag } = await import('../tagStore.ts');
const { retag, retagProducts } = await import('../tagsProduct.ts');

const TAX = {
  attrs: [{ id: 'col', name: 'Colour', key: 'colour', multi: false, position: 1, shopify_prefix: null }, { id: 'occ', name: 'Occasion', key: 'occasion', multi: true, position: 2, shopify_prefix: null }],
  values: [{ id: 'pink', attribute_id: 'col', name: 'Pink', key: 'pink', aliases: [], position: 1 }, { id: 'party', attribute_id: 'occ', name: 'Party', key: 'party', aliases: [], position: 1 }],
  links: [{ category: 'Anarkali', attribute_id: 'col', position: 1 }],
  categories: ['Anarkali', 'Salwar Suit'],
};
const P = (o = {}) => ({ id: 'p1', name: 'Pink anarkali for a party', sku: 'KB 1', raw_text: '', fabric: 'Silk', color: 'Pink', attributes: {}, category: 'Anarkali', locked: [],
  status: 'ready', cost_price: 900, sell_price: null, ai_read_at: '2026-11-12T00:00:00Z', ai_error: null, pb_product_images: [{ id: 'i1' }], ...o });

/** `products`: what the retag reads; `values`: the products' value rows. */
function world({ products = [P()], values = [], tax = TAX } = {}) {
  const calls = { set: [], bulk: [] };
  globalThis.fetch = async (url, init = {}) => {
    const path = decodeURIComponent(String(url)).replace('https://sb.example/rest/v1/', '');
    const ok = (b) => new Response(JSON.stringify(b), { status: 200 });
    if (path.startsWith('pb_attributes?')) return ok(tax.attrs);
    if (path.startsWith('pb_attribute_values?')) return ok(tax.values);
    if (path.startsWith('pb_category_attributes?')) return ok(tax.links);
    if (path.startsWith('pb_settings?')) return ok([{ key: 'categories', value: tax.categories }]);
    if (path.startsWith('pb_products?')) return ok(path.includes('offset=0') || !path.includes('offset=') ? products : []);
    if (path.startsWith('pb_product_values?')) return ok(values);
    if (path.startsWith('rpc/pb_product_values_set')) { calls.set.push(JSON.parse(init.body)); return ok([{ id: 'p1', status: 'ready', was: 'ready', missing: [] }]); }
    if (path.startsWith('rpc/pb_product_values_bulk')) { calls.bulk.push(JSON.parse(init.body)); return ok([{ id: 'p1', status: 'ready', was: 'ready', missing: [] }]); }
    if (path.startsWith('rpc/pb_tag_suggest')) return ok(1);
    if (path.startsWith('pb_bulk_runs') && init.method === 'POST') return new Response(JSON.stringify([{ id: 'run1' }]), { status: 201 });
    if (init.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '0-0/1' } });
    return ok(init.method === 'PATCH' ? [{ id: 'x' }] : []);
  };
  return calls;
}

test('the read replaces only its category\'s attributes: Colour is checked, the Occasion the import found stays', async () => {
  const c = world();
  await autoTag(P(), TAX, { ai: null, byCategory: true });
  assert.deepEqual(c.set[0].p_attributes, ['col']);
  assert.deepEqual(c.set[0].p_rows, [{ value_id: 'pink', source: 'rules' }]);
  assert.equal(c.set[0].p_mode, 'auto');
});

test('a category with nothing linked: the read replaces nothing (it used to delete every value)', async () => {
  const c = world();
  await autoTag(P({ category: 'Salwar Suit' }), TAX, { ai: null, byCategory: true });
  assert.deepEqual(c.set[0].p_attributes, []);
  assert.deepEqual(c.set[0].p_rows, []);
});

test('the import checks every attribute, and replaces every attribute', async () => {
  const c = world();
  await autoTag(P({ category: null }), TAX, { byCategory: false });
  assert.deepEqual(c.set[0].p_attributes, ['col', 'occ']);
  assert.deepEqual(c.set[0].p_rows.map(r => r.value_id).sort(), ['party', 'pink']);
});

const pv = (value_id, attribute_id, source = 'rules') => ({ product_id: 'p1', value_id, source, pb_attribute_values: { attribute_id } });

test('the retag after a suggestion: only the linked attributes, and nothing at all with nothing linked', async () => {
  let c = world({ products: [P({ color: null, name: 'Anarkali' })], values: [pv('party', 'occ'), pv('pink', 'col')] });
  assert.equal(await retagProducts(['p1'], 'run1'), 1); // the words no longer say Pink: Colour is replaced, Occasion stays
  assert.deepEqual(c.set[0].p_attributes, ['col']);
  assert.deepEqual(c.set[0].p_rows, []);
  c = world({ products: [P({ category: 'Salwar Suit' })], values: [pv('party', 'occ')] });
  assert.equal(await retagProducts(['p1']), 0);
  assert.equal(c.set.length, 0);
});

test('Retag all sends the attributes it checked with each product, and projects "Missing: Category" for a category off the list', async () => {
  const c = world({ products: [P({ color: null, name: 'Anarkali' })], values: [pv('party', 'occ'), pv('pink', 'col')] });
  const r = await retag({ dry_run: false }, 'u1');
  assert.equal(r.changed, 1);
  assert.deepEqual(c.bulk[0].p_rows, [{ product_id: 'p1', rows: [], attributes: ['col'] }]);
  world({ products: [P({ category: 'Indo-Western' })], values: [pv('party', 'occ')] });
  const dry = await retag({ dry_run: true }, 'u1');
  assert.deepEqual([dry.changed, dry.to_needs_info], [0, 1]); // nothing to rewrite, but the Ready check will hold it
});

test('Plain on retag: an AI pick made before Plain was on the list gives way to the words\' Plain; one made after it stands', async () => {
  const TAXW = { ...TAX,
    attrs: [TAX.attrs[0], { id: 'work', name: 'Work', key: 'work', multi: true, position: 2, shopify_prefix: null }],
    values: [TAX.values[0], { id: 'emb', attribute_id: 'work', name: 'Embroidery', key: 'embroidery', aliases: [], position: 1 },
      { id: 'plain', attribute_id: 'work', name: 'Plain', key: 'plain', aliases: [], position: 2, created_at: '2026-11-19T00:00:00Z' }],
    links: [TAX.links[0], { category: 'Anarkali', attribute_id: 'work', position: 2 }] };
  const plainTop = P({ raw_text: 'Top Work : Plain\nBottom Work : Plain' });
  const ai = (at) => ({ ...pv('emb', 'work', 'ai'), created_at: at });
  // chosen when Work could not stay empty and had no Plain: the words' Plain replaces it
  let c = world({ tax: TAXW, products: [plainTop], values: [pv('pink', 'col'), ai('2026-11-15T00:00:00Z')] });
  assert.equal(await retagProducts(['p1']), 1);
  assert.deepEqual(c.set[0].p_rows.filter(r => r.value_id !== 'pink'), [{ value_id: 'plain', source: 'rules' }]);
  // chosen with Plain on the list: the AI saw a work in the photo, and that stands
  c = world({ tax: TAXW, products: [plainTop], values: [pv('pink', 'col'), ai('2026-11-20T00:00:00Z')] });
  assert.equal(await retagProducts(['p1']), 0);
});
