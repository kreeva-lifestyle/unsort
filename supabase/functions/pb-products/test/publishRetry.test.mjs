// node --test --experimental-strip-types supabase/functions/pb-products/test/
// One publish from end to end (publish.ts publishOne) over a fake Supabase and a fake Shopify. Second review of
// pre-launch fix D19, findings 2 and 8: the first send saved the product on Shopify and then failed at the Online
// Store step; the retry sent the sizes' codes WITHOUT their colour part, so two colours of one design shared SKUs
// and barcodes again — and one product could carry two codes on two websites.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { publishOne } = await import('../publish.ts');

const P = 'cccccccc-0000-4000-8000-000000000001', W = 'eeeeeeee-0000-4000-8000-000000000001', L = 'dddddddd-0000-4000-8000-000000000001';
const GID = 'gid://shopify/Product/1';

/** `w.sets`: the SKUs of every productSet that reached the store. `w.channelDown`: the Online Store step fails (Shopify 500). */
function world(o = {}) {
  const w = {
    product: { id: P, vendor_id: null, source: 'telegram', sku: 'KA-5070', name: 'Kurta', category: 'Kurta', fabric: 'Cotton', color: 'Wine', sizes: ['M', 'L'], in_stock: true, temp_out_at: null, perm_out_at: null,
      cost_price: 500, status: 'ready', tags: [], missing_attrs: [], locked: [], attributes: {}, sku_colour: null, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', ...o.product },
    listing: { id: L, product_id: P, website_id: W, status: 'publishing', price: 999, compare_at_price: null, title: 'Wine cotton kurta', description_html: '<p>A kurta.</p>', handle: null, tags: [], image_alts: [], locked: [],
      generated_at: '2026-11-02T00:00:00Z', shopify_product_id: null, shopify_status: null, published_at: null, first_published_at: null, attempts: 0, ...o.listing },
    site: { id: W, name: 'Kreeva', shop_domain: 'kreeva.myshopify.com', auth_mode: 'token', api_version: '2026-10', active: true, publish_mode: 'live', track_inventory: false, pricing: {}, tag_rules: {},
      content: { profile: { custom_fields: false, faq_in_description: false } } },
    sets: [], failed: [], channelDown: !!o.channelDown, store: null,
  };
  const node = (handle) => ({ id: GID, handle, tags: [], options: [{ id: 'o1', name: 'Size', optionValues: [{ id: 'ov1', name: 'M' }, { id: 'ov2', name: 'L' }] }],
    variants: { nodes: [{ id: 'v1', selectedOptions: [{ name: 'Size', value: 'M' }] }, { id: 'v2', selectedOptions: [{ name: 'Size', value: 'L' }] }] }, media: { nodes: [] }, metafield: { value: L } });
  if (w.listing.shopify_product_id) w.store = node('wine-cotton-kurta');
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)), method = init.method || 'GET', body = init.body ? JSON.parse(init.body) : null;
    const ok = (b, status = 200) => new Response(JSON.stringify(b), { status });
    if (u.startsWith('https://kreeva.myshopify.com/')) {
      const q = body.query;
      if (q.includes('currencyCode')) return ok({ data: { shop: { currencyCode: 'INR' } } });
      if (q.includes('PbByHandle')) return ok({ data: {} });
      if (q.includes('PbExisting')) return ok({ data: { product: w.store } });
      if (q.includes('productSet')) {
        const input = body.variables.input;
        w.sets.push(input.variants.map(v => v.inventoryItem.sku));
        w.store = node(input.handle);
        return ok({ data: { productSet: { product: { id: GID, status: 'ACTIVE', handle: input.handle, media: { nodes: [] } }, userErrors: [] } } });
      }
      if (q.includes('publications')) return ok({ data: { publications: { nodes: [{ id: 'gid://shopify/Publication/1', catalog: { title: 'Online Store' } }] } } });
      if (q.includes('publishablePublish')) return w.channelDown ? ok({}, 500) : ok({ data: { publishablePublish: { userErrors: [] } } });
      return ok({ data: {} });
    }
    const path = u.replace('https://sb.example', '');
    if (path.startsWith('/rest/v1/pb_products?') && method === 'GET') return ok([w.product]);
    if (path.startsWith('/rest/v1/pb_products?') && method === 'PATCH') {
      if (path.includes('sku_colour=is.null') && w.product.sku_colour !== null) return ok([]); // decided already: not replaced
      Object.assign(w.product, body);
      return ok([{ id: P }]);
    }
    if (path.startsWith('/rest/v1/pb_websites?')) return ok([w.site]);
    if (path.startsWith('/rest/v1/pb_website_secrets?') && method === 'GET') return ok([{ access_token: 'shpat_test', online_store_publication_id: null }]);
    if (path.startsWith('/rest/v1/pb_listings?') && method === 'GET') return ok(w.listing.shopify_product_id ? [{ id: L }] : []);
    if (path.startsWith('/rest/v1/pb_listings?') && method === 'PATCH') { Object.assign(w.listing, body); return ok([w.listing]); }
    if (path.startsWith('/rest/v1/pb_activity?') && method === 'GET') return ok(path.includes('action=eq.failed') ? w.failed : []);
    if (path.startsWith('/rest/v1/pb_activity') && method === 'POST') {
      if (body[0].action === 'failed') w.failed.unshift({ details: body[0].details, created_at: new Date().toISOString() });
      return ok([{}], 201);
    }
    return ok(method === 'GET' || path.startsWith('/rest/v1/rpc/') ? [] : [{}], method === 'POST' && !path.startsWith('/rest/v1/rpc/') ? 201 : 200);
  };
  return w;
}
const send = (w) => publishOne({ ...w.listing, status: 'publishing' }, { manual: false, userId: null, budget: { hard: Date.now() + 120_000 } });

test('a first send that fails after the product is saved on Shopify: the retry sends the very same codes', async () => {
  const w = world({ channelDown: true });
  await assert.rejects(send(w), /Shopify is having trouble/);
  assert.deepEqual(w.sets, [['KA-5070-WINE-M', 'KA-5070-WINE-L']]);
  assert.equal(w.product.sku_colour, 'WINE', 'the colour part was saved before anything was sent');
  assert.deepEqual([w.listing.status, w.listing.shopify_product_id], ['failed', GID], 'the product is on the store; the listing failed at the Online Store step');
  w.product.color = 'Maroon'; // meanwhile the AI or a person re-words the colour
  w.channelDown = false;
  assert.equal((await send(w)).status, 'published');
  assert.deepEqual(w.sets[1], ['KA-5070-WINE-M', 'KA-5070-WINE-L'], 'not without the colour part, and not with the new word for it');
});

test('a product that is on a store from before codes carried a colour keeps its codes exactly as they are', async () => {
  const w = world({ listing: { shopify_product_id: GID, shopify_status: 'ACTIVE', handle: 'wine-cotton-kurta', published_at: '2026-11-03T00:00:00Z', first_published_at: '2026-11-03T00:00:00Z' } });
  assert.equal((await send(w)).status, 'published');
  assert.deepEqual(w.sets, [['KA-5070-M', 'KA-5070-L']]);
  assert.equal(w.product.sku_colour, '', 'and that is what is kept for it, on every website');
});

test('the same goods carry one code on every website: a second website, first sent after the colour was re-worded', async () => {
  const w = world({ product: { sku_colour: 'MAROON', color: 'Wine' } }); // decided when the first website got it
  assert.equal((await send(w)).status, 'published');
  assert.deepEqual(w.sets, [['KA-5070-MAROON-M', 'KA-5070-MAROON-L']]);
});
