// node --test --experimental-strip-types supabase/functions/pb-products/test/
// Values that depend on the category (owner, 13 Nov 2026: Product Type — "the values are to be mapped against the
// category, so no mistake can happen"; a value with no category ticked is offered nowhere). taxonomy.ts offered(),
// attrsFor / allAttrs, the reader's list (readerSpec + the prompt line), the AI's pick checked against the category
// (tagAuto.ts), "Retag all" (tagsProduct.ts) and {tags} (tagStore.ts siteValueTags). The Ready check: t_dups.sql part 10.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { allAttrs, attrsFor, matchAttrs, offered, readerSpec } = await import('../taxonomy.ts');
const { autoValues } = await import('../tagAuto.ts');
const { tagPromptLines } = await import('../tagPrompt.ts');
const { retagProducts } = await import('../tagsProduct.ts');
const { siteValueTags } = await import('../tagStore.ts');

const TYPE = { id: 'type', name: 'Product Type', key: 'product type', multi: false, position: 2, shopify_prefix: null, by_category: true };
const TAX = {
  attrs: [{ id: 'col', name: 'Colour', key: 'colour', multi: false, position: 1, shopify_prefix: null, by_category: false }, TYPE],
  values: [
    { id: 'pink', attribute_id: 'col', name: 'Pink', key: 'pink', aliases: [], position: 1, categories: [] },
    { id: 'anarkali', attribute_id: 'type', name: 'Anarkali', key: 'anarkali', aliases: [], position: 1, categories: ['Salwar Suit'] },
    { id: 'bridal', attribute_id: 'type', name: 'Bridal Lehenga', key: 'bridal lehenga', aliases: [], position: 2, categories: ['Lehenga'] },
    { id: 'gown', attribute_id: 'type', name: 'Gown', key: 'gown', aliases: [], position: 3, categories: [] },
  ],
  links: [{ category: 'Salwar Suit', attribute_id: 'col', position: 1 }, { category: 'Salwar Suit', attribute_id: 'type', position: 2 }, { category: 'Lehenga', attribute_id: 'type', position: 1 }],
  categories: ['Salwar Suit', 'Lehenga', 'Saree'],
};
const names = (list) => list.map(a => `${a.name}: ${a.values.map(v => v.name).join(', ')}`);

test('a value is offered only for the categories ticked on it (case and spaces aside); none ticked = nowhere', () => {
  assert.equal(offered(TYPE, { categories: ['Salwar Suit'] }, '  salwar   SUIT '), true);
  assert.equal(offered(TYPE, { categories: ['Salwar Suit'] }, 'Lehenga'), false);
  assert.equal(offered(TYPE, { categories: [] }, 'Lehenga'), false);
  assert.equal(offered(TYPE, { categories: ['Salwar Suit'] }, null), false); // no category yet: none of them
  assert.equal(offered({ by_category: false }, { categories: [] }, null), true); // Colour: every value, always
});

test('a category\'s attributes carry only the values offered for it; an attribute switched off is untouched', () => {
  assert.deepEqual(names(attrsFor(TAX, 'Salwar Suit')), ['Colour: Pink', 'Product Type: Anarkali']);
  assert.deepEqual(names(attrsFor(TAX, 'Lehenga')), ['Product Type: Bridal Lehenga']);
  assert.deepEqual(names(allAttrs(TAX)), ['Colour: Pink', 'Product Type: '], 'the import, category not known yet');
  assert.deepEqual(names(allAttrs(TAX, 'Lehenga')), ['Colour: Pink', 'Product Type: Bridal Lehenga']);
});

test('the reader\'s list: each Product Type value under its categories, one ticked for none left out', () => {
  const spec = readerSpec(TAX);
  const type = spec.attrs.find(a => a.id === 'type');
  assert.deepEqual(type.values.map(v => v.name), ['Anarkali', 'Bridal Lehenga']);
  const line = tagPromptLines(spec).find(l => l.startsWith('Product Type'));
  assert.equal(line, 'Product Type (one value; depends on the category — choose only from the product\'s category, none if it has none): Salwar Suit: Anarkali; Lehenga: Bridal Lehenga');
  assert.ok(tagPromptLines(spec).some(l => l === 'Colour (one value): Pink'), 'other attributes as before');
});

test('the AI\'s pick from another category is dropped; the word rules use only the category\'s values', () => {
  const salwar = matchAttrs(attrsFor(TAX, 'Salwar Suit'));
  const ai = { chosen: { type: ['bridal'], col: ['pink'] }, other: [] };
  let r = autoValues({ name: 'Silk suit set' }, salwar, { ai });
  assert.deepEqual(r.rows, [{ value_id: 'pink', source: 'ai' }]); // "Bridal Lehenga" is a Lehenga's
  assert.ok(!r.filled.has('type'));
  r = autoValues({ name: 'Bridal lehenga look anarkali' }, salwar, {});
  assert.deepEqual(r.rows, [{ value_id: 'anarkali', source: 'rules' }]); // the words name both; only Anarkali is offered here
});

function world(values) {
  const calls = { set: [] };
  globalThis.fetch = async (url, init = {}) => {
    const path = decodeURIComponent(String(url)).replace('https://sb.example/rest/v1/', '');
    const ok = (b) => new Response(JSON.stringify(b), { status: 200 });
    if (path.startsWith('pb_attributes?')) return ok(TAX.attrs);
    if (path.startsWith('pb_attribute_values?')) return ok(TAX.values);
    if (path.startsWith('pb_category_attributes?')) return ok(TAX.links);
    if (path.startsWith('pb_settings?')) return ok([{ key: 'categories', value: TAX.categories }]);
    if (path.startsWith('pb_products?')) return ok([{ id: 'p1', name: 'Pink silk suit', sku: 'KB 1', raw_text: '', fabric: 'Silk', color: 'Pink', attributes: {}, category: 'Salwar Suit',
      locked: [], status: 'ready', cost_price: 900, sell_price: null, ai_read_at: '2026-11-12T00:00:00Z', ai_error: null, pb_product_images: [{ id: 'i1' }] }]);
    if (path.startsWith('pb_product_values?')) return ok(values);
    if (path.startsWith('rpc/pb_product_values_set')) { calls.set.push(JSON.parse(init.body)); return ok([{ id: 'p1', status: 'needs_info', was: 'ready', missing: ['Product Type'] }]); }
    return ok([]);
  };
  return calls;
}

test('Retag all: an AI Product Type from another category is not kept (the product moved to Salwar Suit)', async () => {
  const c = world([
    { product_id: 'p1', value_id: 'pink', source: 'rules', pb_attribute_values: { attribute_id: 'col' } },
    { product_id: 'p1', value_id: 'bridal', source: 'ai', pb_attribute_values: { attribute_id: 'type' } },
  ]);
  assert.equal(await retagProducts(['p1']), 1);
  assert.deepEqual(c.set[0].p_rows, [{ value_id: 'pink', source: 'rules' }]);
  assert.deepEqual(c.set[0].p_attributes, ['col', 'type']);
});

test('{tags}: a value from another category is not sent', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify([
    { pb_attribute_values: { name: 'Pink', position: 1, categories: [], pb_attributes: { name: 'Colour', shopify_prefix: null, position: 1, by_category: false } } },
    { pb_attribute_values: { name: 'Bridal Lehenga', position: 2, categories: ['Lehenga'], pb_attributes: { name: 'Product Type', shopify_prefix: 'Type', position: 2, by_category: true } } },
    { pb_attribute_values: { name: 'Anarkali', position: 1, categories: ['Salwar Suit'], pb_attributes: { name: 'Product Type', shopify_prefix: 'Type', position: 2, by_category: true } } },
  ]), { status: 200 });
  assert.deepEqual(await siteValueTags('p1', 'prefixed', 'Salwar Suit'), ['Colour_Pink', 'Type_Anarkali']);
  assert.deepEqual(await siteValueTags('p1', 'plain', null), ['Pink']);
});
