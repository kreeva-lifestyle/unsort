// node --test --experimental-strip-types supabase/functions/pb-products/test/
// Setting a store up as Playbook (owner, 2026-11-17: collections per category, product fields per attribute, for
// SuratMandi): storeFields.ts (what), storeSetup.ts (doing it over a fake Shopify), fields.ts (filling the fields).
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { collectionHandle, collectionInput, fieldDefs, fieldKey, sameCollection } = await import('../storeFields.ts');
const { fieldInputs } = await import('../fields.ts');
const { storeSetup } = await import('../storeSetup.ts');
const { otherForm, sendFields } = await import('../publishParts.ts');

const W = 'eeeeeeee-0000-4000-8000-000000000001';
const ATTRS = [{ key: 'colour', name: 'Colour', multi: false }, { key: 'fabric', name: 'Fabric', multi: false }, { key: 'work', name: 'Work', multi: true },
  { key: 'occasion', name: 'Occasion', multi: true }, { key: 'product type', name: 'Product Type', multi: false }];

test('the fields: one per attribute in snake case, a list where it takes several, then set contents and the questions', () => {
  assert.equal(fieldKey('product type'), 'product_type'); assert.equal(fieldKey('  Neck-Line / Style '), 'neck_line_style');
  const d = fieldDefs([...ATTRS, { key: 'Colour', name: 'Colour again', multi: true }, { key: 'faq', name: 'FAQ', multi: false }, { key: 'x', name: 'X', multi: false }]);
  assert.deepEqual(d.map(x => `${x.key}:${x.type}`), ['colour:single_line_text_field', 'fabric:single_line_text_field', 'work:list.single_line_text_field',
    'occasion:list.single_line_text_field', 'product_type:single_line_text_field', 'set_contents:single_line_text_field', 'faq:rich_text_field']);
  assert.equal(d[4].name, 'Product Type');
  assert.ok(d.every(x => x.description.length <= 255 && x.description));
});

test('the collections: handle from the name, filled by product type, found again by handle or title', () => {
  assert.equal(collectionHandle('Pre-Stitched Saree'), 'pre-stitched-saree'); assert.equal(collectionHandle("Men's Kurta"), 'men-s-kurta');
  assert.equal(collectionHandle('Co-ord Set'), 'co-ord-set'); assert.equal(collectionHandle('साड़ी'), '');
  assert.deepEqual(collectionInput('Salwar Suit'), { title: 'Salwar Suit', handle: 'salwar-suit', sources: [{ source: { title: 'Product type Salwar Suit', targetType: 'PRODUCTS',
    inclusion: { matchType: 'ALL', conditions: [{ productType: { relation: 'EQUALS', values: ['Salwar Suit'], matchType: 'ANY' } }] } } }] });
  assert.equal('handle' in collectionInput('साड़ी'), false);
  const have = [{ id: 'c1', handle: 'saree', title: 'Sarees' }, { id: 'c2', handle: 'lehengas-1', title: 'Lehenga' }];
  assert.equal(sameCollection(have, 'Saree').id, 'c1'); assert.equal(sameCollection(have, 'lehenga').id, 'c2'); assert.equal(sameCollection(have, 'Kids Wear'), null);
});

test('filling the fields as Playbook: the chosen values, a list where it takes several, the read fact only when none is chosen', () => {
  const p = { fabric: 'Pure Georgette', color: 'Maroon', attributes: { work: 'Zari', occasion: 'Festive', set_contents: 'Kurta, Pant and Dupatta', product_type: 'Anarkali' } };
  const attrs = [{ key: 'colour', multi: false, values: [] }, { key: 'fabric', multi: false, values: ['Georgette'] }, { key: 'work', multi: true, values: ['Embroidery', 'Sequins', 'Embroidery'] },
    { key: 'occasion', multi: true, values: [] }, { key: 'product type', multi: false, values: ['Anarkali Suit'] }, { key: 'pattern', multi: false, values: [] }];
  const f = fieldInputs('gid://shopify/Product/1', p, [{ q: 'Q?', a: 'A.' }], attrs);
  assert.deepEqual(f.map(x => [x.key, x.type, x.value]), [
    ['colour', 'single_line_text_field', 'Maroon'], // nothing chosen: the read fact
    ['fabric', 'single_line_text_field', 'Georgette'], // Playbook's value, not the read "Pure Georgette"
    ['work', 'list.single_line_text_field', '["Embroidery","Sequins"]'],
    ['occasion', 'list.single_line_text_field', '["Festive"]'], // a list even from the fact
    ['product_type', 'single_line_text_field', 'Anarkali Suit'],
    // pattern: nothing chosen, nothing read → not sent
    ['set_contents', 'single_line_text_field', 'Kurta, Pant and Dupatta'],
    ['faq', 'rich_text_field', f[6].value],
  ]);
  assert.ok(f.every(x => x.namespace === 'custom' && x.ownerId === 'gid://shopify/Product/1'));
  // without the attributes (as before): the five read facts as text
  assert.deepEqual(fieldInputs('x', p, []).map(x => `${x.key}:${x.type}`), ['fabric:single_line_text_field', 'work:single_line_text_field', 'colour:single_line_text_field', 'occasion:single_line_text_field', 'set_contents:single_line_text_field']);
});

/** A store with `defs` (custom product fields) and `cols` (collections); `refuse`: names Shopify refuses. */
function store({ defs = [], cols = [], refuse = [], denied = false, categories = ['Saree', 'Lehenga', 'Kids Wear'] } = {}) {
  const w = { made: [], cols: [], published: [], activity: null };
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)), method = init.method || 'GET', body = init.body ? JSON.parse(init.body) : null;
    const ok = (b, status = 200) => new Response(JSON.stringify(b), { status });
    if (u.startsWith('https://suratmandi.myshopify.com/')) {
      if (denied) return ok({}, 403);
      const q = body.query, v = body.variables;
      if (q.includes('PbDefs')) return ok({ data: { metafieldDefinitions: { nodes: defs } } });
      if (q.includes('PbDef(')) {
        w.made.push(v.d);
        return ok({ data: { metafieldDefinitionCreate: { createdDefinition: refuse.includes(v.d.name) ? null : { id: 'd' }, userErrors: refuse.includes(v.d.name) ? [{ field: ['key'], message: 'Key is reserved', code: 'INVALID' }] : [] } } });
      }
      if (q.includes('PbCols')) return ok({ data: { collections: { nodes: cols, pageInfo: { hasNextPage: false, endCursor: null } } } });
      if (q.includes('PbCol(')) {
        if (refuse.includes(v.c.title)) return ok({ errors: [{ message: 'Handle is invalid' }] });
        w.cols.push(v.c);
        return ok({ data: { collectionCreate: { collection: { id: `gid://shopify/Collection/${w.cols.length}`, handle: v.c.handle }, userErrors: [] } } });
      }
      if (q.includes('publications')) return ok({ data: { publications: { nodes: [{ id: 'gid://shopify/Publication/1', catalog: { title: 'Channel Catalog 1 for Online Store' } }] } } });
      if (q.includes('publishablePublish')) { w.published.push(v.id); return ok({ data: { publishablePublish: { userErrors: [] } } }); }
      return ok({ data: {} });
    }
    const path = u.replace('https://sb.example', '');
    if (path.startsWith('/rest/v1/pb_websites?')) return ok([{ id: W, name: 'SuratMandi', shop_domain: 'suratmandi.myshopify.com', auth_mode: 'token', api_version: '2026-10', active: false }]);
    if (path.startsWith('/rest/v1/pb_website_secrets?') && method === 'GET') return ok([{ access_token: 'shpat_test', online_store_publication_id: null }]);
    if (path.startsWith('/rest/v1/pb_attributes?')) return ok(ATTRS.map((a, i) => ({ id: `a${i}`, ...a, position: i, shopify_prefix: null, by_category: false })));
    if (path.startsWith('/rest/v1/pb_settings?')) return ok([{ key: 'categories', value: categories }]);
    if (path.startsWith('/rest/v1/pb_activity') && method === 'POST') { w.activity = body[0]; return ok([{}], 201); }
    return ok(method === 'GET' ? [] : [{}]);
  };
  return w;
}

test('set up: fields and collections made where missing, the ones there kept (of any kind), a refusal said, nothing stops the rest', async () => {
  const w = store({ defs: [{ key: 'colour', name: 'Color', type: { name: 'single_line_text_field' } }, { key: 'work', name: 'Work', type: { name: 'single_line_text_field' } }],
    cols: [{ id: 'gid://shopify/Collection/9', handle: 'sarees', title: 'Saree' }], refuse: ['Occasion', 'Lehenga'] });
  const r = await storeSetup({ website_id: W }, 'u1');
  assert.deepEqual(r.fields.map(x => `${x.name}:${x.status}`), ['Colour:kept', 'Fabric:made', 'Work:kept', 'Occasion:failed', 'Product Type:made', 'Set contents:made', 'Questions:made']);
  // the store's own Work is plain text: kept as it is (owner: "if already made then merge with it"), filled in that kind
  assert.equal(r.fields[2].note, 'Used as the store has it (one line of text: several values go in joined with commas).');
  assert.equal(r.fields[0].note, undefined);
  assert.equal(r.fields[3].note, 'Key is reserved');
  assert.deepEqual(w.made[0], { name: 'Fabric', namespace: 'custom', key: 'fabric', type: 'single_line_text_field', description: "Fabric from Playbook: the product's Fabric tags.", ownerType: 'PRODUCT', pin: true, access: { storefront: 'PUBLIC_READ' } });
  assert.deepEqual(r.collections.map(x => `${x.name}:${x.status}`), ['Saree:kept', 'Lehenga:failed', 'Kids Wear:made']);
  assert.match(r.collections[1].note, /Shopify said "Handle is invalid"/);
  assert.equal(w.cols[0].handle, 'kids-wear');
  assert.deepEqual(w.published, ['gid://shopify/Collection/1'], 'a made collection goes on the Online Store');
  assert.deepEqual(w.activity.details, { fields_made: 4, fields_kept: 2, fields_failed: 1, collections_made: 1, collections_kept: 1, collections_failed: 1 });
  assert.equal(w.activity.action, 'store_setup'); assert.equal(w.activity.website_id, W);

  // again: everything is there now → only kept, nothing made
  const again = store({ defs: r.fields.map(x => ({ key: x.name === 'Questions' ? 'faq' : x.name === 'Set contents' ? 'set_contents' : fieldKey(x.name), name: x.name,
    type: { name: x.name === 'Questions' ? 'rich_text_field' : ['Work', 'Occasion'].includes(x.name) ? 'list.single_line_text_field' : 'single_line_text_field' } })),
    cols: [{ id: 'c1', handle: 'saree', title: 'Saree' }, { id: 'c2', handle: 'lehenga', title: 'Lehenga' }, { id: 'c3', handle: 'kids-wear', title: 'Kids Wear' }] });
  const r2 = await storeSetup({ website_id: W }, 'u1');
  assert.ok([...r2.fields, ...r2.collections].every(x => x.status === 'kept'));
  assert.equal(again.made.length + again.cols.length, 0);
});

test('set up: a store that refuses the app (a missing permission) says so once, before anything is made', async () => {
  const w = store({ denied: true });
  await assert.rejects(() => storeSetup({ website_id: W }, 'u1'), /missing a permission/);
  assert.equal(w.made.length + w.cols.length, 0);
});

test('sending fields to a store whose own field is the other text kind: the refused one goes again in that kind, the rest are not lost', async () => {
  assert.deepEqual(otherForm({ ownerId: 'p', namespace: 'custom', key: 'work', type: 'list.single_line_text_field', value: '["Embroidery","Sequins"]' }),
    { ownerId: 'p', namespace: 'custom', key: 'work', type: 'single_line_text_field', value: 'Embroidery, Sequins' });
  assert.deepEqual(otherForm({ ownerId: 'p', namespace: 'custom', key: 'colour', type: 'single_line_text_field', value: 'Pink' }).value, '["Pink"]');
  assert.equal(otherForm({ ownerId: 'p', namespace: 'custom', key: 'faq', type: 'rich_text_field', value: '{}' }), null);
  // the store: work and occasion are plain text, faq refused whatever is sent
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)), body = init.body ? JSON.parse(init.body) : null;
    const ok = (b) => new Response(JSON.stringify(b), { status: 200 });
    if (u.startsWith('https://suratmandi.myshopify.com/')) {
      const list = body.variables.metafields; calls.push(list.map(f => `${f.key}:${f.type}`));
      const userErrors = list.flatMap((f, i) => (f.key === 'faq' || (['work', 'occasion'].includes(f.key) && f.type !== 'single_line_text_field') ? [{ message: 'Type must be single_line_text_field', elementIndex: i }] : []));
      return ok({ data: { metafieldsSet: { userErrors } } });
    }
    if (u.includes('/rest/v1/pb_website_secrets?')) return ok([{ access_token: 'shpat_test' }]);
    return ok([]);
  };
  const site = { id: W, name: 'SuratMandi', shop_domain: 'suratmandi.myshopify.com', auth_mode: 'token', api_version: '2026-10' };
  const f = (key, type, value) => ({ ownerId: 'gid://shopify/Product/1', namespace: 'custom', key, type, value });
  const warn = await sendFields(site, [f('colour', 'single_line_text_field', 'Pink'), f('work', 'list.single_line_text_field', '["Embroidery","Sequins"]'),
    f('occasion', 'list.single_line_text_field', '["Festive"]'), f('faq', 'rich_text_field', '{}')], 30_000);
  assert.deepEqual(calls, [
    ['colour:single_line_text_field', 'work:list.single_line_text_field', 'occasion:list.single_line_text_field', 'faq:rich_text_field'],
    ['colour:single_line_text_field', 'work:single_line_text_field', 'occasion:single_line_text_field'], // faq has no other kind
  ]);
  assert.match(warn, /did not take these custom fields: faq/);
  // all taken in the other kind: no warning
  calls.length = 0;
  assert.equal(await sendFields(site, [f('work', 'list.single_line_text_field', '["Zari"]')], 30_000), null);
  assert.deepEqual(calls, [['work:list.single_line_text_field'], ['work:single_line_text_field']]);
});
