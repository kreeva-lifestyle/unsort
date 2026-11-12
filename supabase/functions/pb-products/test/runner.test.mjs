// node --test --experimental-strip-types supabase/functions/pb-products/test/
// The import step end to end against a fake store and a fake database (fetch is
// replaced): the store's currency read once (meta.json), product pages fetched
// once each, known products skipped BEFORE their page is fetched (one lookup
// per page), a run out of time mid-page saves cursor.skip + skip_ref and the
// next tick carries on after that product; ingest stores attributes + sku; a
// rate limit waits without a second request. ~12 s (1 s pacing).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { advanceImport } = await import('../import/runner.ts');
const { extras } = await import('../ingest.ts');

const here = new URL('.', import.meta.url);
const read = (f) => readFileSync(new URL(f, here), 'utf8');
const base = JSON.parse(read('shopify.products.json')).products[0];
const products = [1, 2, 3, 4, 5, 6, 7].map(n => ({ ...base, id: 800 + n, handle: `saree-${n}`, title: `Saree ${n}`, images: [] }));
const pageHtml = read('shopify.page.html');

function fakeWorld(run, store = null) {
  const calls = { site: [], inserts: [], saves: [], known: [], values: [], suggest: [] };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), method = init.method || 'GET';
    const ok = (body, status = 200, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
    if (u.startsWith('https://kumari.example/')) {
      calls.site.push(u.slice('https://kumari.example'.length));
      if (store) return store(u.slice('https://kumari.example'.length));
      if (u.endsWith('/meta.json')) return ok({ name: 'Kumari Art', currency: 'INR' });
      if (u.endsWith('/robots.txt')) return ok('User-agent: *\nDisallow: /cart');
      if (u.includes('/products.json')) return ok({ products });
      if (u.includes('/products/')) return ok(pageHtml, 200, { 'content-type': 'text/html' });
      return ok('', 404);
    }
    const path = decodeURIComponent(u.replace('https://sb.example/rest/v1/', ''));
    if (path.startsWith('pb_import_runs?') && path.includes('select=id,cursor&order')) return ok([{ id: run.id, cursor: run.cursor }]);
    if (path.startsWith('pb_import_runs?') && method === 'PATCH') {
      const body = JSON.parse(init.body);
      if ('status' in body && body.status === 'running') return ok([run]);
      calls.saves.push(body);
      return ok([{ id: run.id }]);
    }
    if (path.startsWith('pb_vendors?id=')) return ok([{ name: 'Kumari Art' }]);
    // The taxonomy (Tags page): Fabric {Silk}; nothing linked to a category yet.
    if (path.startsWith('pb_settings?')) return ok([{ key: 'categories', value: ['Saree'] }]);
    if (path.startsWith('pb_attributes?')) return ok([{ id: 'a-fab', name: 'Fabric', key: 'fabric', multi: false, position: 1, shopify_prefix: null }]);
    if (path.startsWith('pb_attribute_values?')) return ok([{ id: 'v-silk', attribute_id: 'a-fab', name: 'Silk', key: 'silk', aliases: [], position: 1 }]);
    if (path.startsWith('pb_category_attributes?')) return ok([]);
    if (path.startsWith('pb_product_values?')) return ok([]);
    if (path.startsWith('rpc/pb_product_values_set')) { calls.values.push(JSON.parse(init.body)); return ok([{ id: 'p', status: 'new', was: 'new', missing: [] }]); }
    if (path.startsWith('rpc/pb_tag_suggest')) { calls.suggest.push(...JSON.parse(init.body).p_rows); return ok(1); }
    if (path.startsWith('pb_websites?')) return ok([{ shop_domain: 'aryadesigns.myshopify.com' }]);
    // Two questions share this shape: the page's "which of these were imported before" (select=source_ref, asked for
    // the site's address and its www twin) and ingest's own check of one product (select=id).
    if (path.startsWith('pb_products?source=eq.import&source_ref=in.') && path.includes('select=source_ref')) {
      calls.known.push(path);
      return ok(path.includes('"kumari.example:801"') ? [{ source_ref: 'kumari.example:801' }] : []);
    }
    if (path.startsWith('pb_products?source=eq.import&source_ref=in.')) return ok([]);
    if (path.startsWith('pb_products?source=eq.import&source_ref=eq.')) return ok([]);
    if (path.startsWith('pb_vendors?') && method === 'POST') return ok([{ id: 'v1' }]);
    if (path.startsWith('pb_products?') && method === 'POST') { const row = JSON.parse(init.body)[0]; calls.inserts.push(row); return ok([{ id: `p${calls.inserts.length}` }]); }
    if (method === 'PATCH' || path.startsWith('pb_activity')) return ok([]);
    throw new Error(`unexpected ${method} ${u}`);
  };
  return calls;
}

const runRow = (over) => ({
  id: 'r1', url: 'https://kumari.example', host: 'kumari.example', platform: 'shopify', status: 'queued', in_stock_only: true, use_their_price: true,
  vendor_id: 'v1', cursor: {}, found: 0, added: 0, skipped: 0, out_of_stock: 0, failed: 0, sample: null, error: null, started_at: '2026-11-08T00:00:00Z', created_by: null, ...over,
});

test('out of time mid-page: known product skipped without its page, cursor.skip + skip_ref saved, then finished next tick', async () => {
  let calls = fakeWorld(runRow({}));
  let out = await advanceImport(Date.now() + 10_500, null); // only the first batch of 3 fits before the 10 s reserve
  assert.deepEqual(out, { run_id: 'r1', found: 4, added: 3 });
  assert.deepEqual(calls.site, ['/robots.txt', '/meta.json', '/products.json?limit=50&page=1', '/products/saree-2', '/products/saree-3', '/products/saree-4']); // no page for 801
  assert.equal(calls.known.length, 2); // the whole page in one lookup per address of the site (kumari.example, www.kumari.example)
  assert.match(calls.known[1], /source_ref=in\.\("www\.kumari\.example:801",/);
  assert.match(calls.known[0], /source_ref=in\.\("kumari\.example:801","kumari\.example:802",.*"kumari\.example:807"\)/);
  const save1 = calls.saves.at(-1);
  assert.deepEqual(save1.cursor, { currency: 'INR', skip: 4, skip_ref: '804', errors: 0 });
  assert.equal(save1.claimed_at, null);
  assert.equal(save1.status, undefined); // still running
  assert.deepEqual([save1.found, save1.added, save1.skipped], [4, 3, 1]);
  const row = calls.inserts[0];
  assert.equal(row.sku, 'KA-5070');
  assert.equal(row.sell_price, 2499); // the store's INR price (meta.json), from the variants on sale
  assert.equal(row.attributes.seo_title, 'Banarasi Silk Saree – Maroon | Kumari Art');
  assert.equal(row.attributes.manufacturer, 'Varanasi Weavers Co-op');
  assert.equal(row.attributes.brand, 'Kumari Art');
  assert.equal(row.attributes.source_page_url, 'https://kumari.example/products/saree-2');
  // Tags at ingest: the rules over every attribute ("Banarasi Silk Saree" → Fabric: Silk), written in one
  // call while the product is held; the store's tags that match no value go to suggestions, junk filtered.
  assert.equal('tags' in row, false);
  const first = calls.values.find(v => v.p_product === 'p1');
  assert.deepEqual(first.p_rows, [{ value_id: 'v-silk', source: 'rules' }]);
  assert.equal(first.p_mode, 'auto');
  assert.ok(calls.suggest.length > 0 && calls.suggest.every(s => !s.phrase.startsWith('_') && s.source === 'store'), JSON.stringify(calls.suggest));

  calls = fakeWorld(runRow({ status: 'running', cursor: save1.cursor, found: 4, added: 3, skipped: 1, sample: save1.sample }));
  out = await advanceImport(Date.now() + 60_000, null);
  assert.deepEqual(out, { run_id: 'r1', found: 3, added: 3 });
  assert.deepEqual(calls.site, ['/robots.txt', '/products.json?limit=50&page=1', '/products/saree-5', '/products/saree-6', '/products/saree-7']);
  const save2 = calls.saves.at(-1);
  assert.equal(save2.status, 'done');
  assert.equal('skip' in save2.cursor, false);
  assert.deepEqual([save2.found, save2.added, save2.skipped], [7, 6, 1]);
});

test('a store that asks us to slow down: one request, the run waits (not an error), and the next tick does not call it', async () => {
  const slow = (p) => p === '/robots.txt' ? new Response('') : new Response('Too Many Requests', { status: 429, headers: { 'retry-after': '120' } });
  let calls = fakeWorld(runRow({ cursor: { currency: 'INR' } }), slow);
  await advanceImport(Date.now() + 5_000, null);
  assert.deepEqual(calls.site, ['/robots.txt', '/products.json?limit=50&page=1']); // no /collections/all fallback
  const s = calls.saves.at(-1);
  assert.ok(s.cursor.wait_until > Date.now() + 100_000);
  assert.equal(s.cursor.errors, undefined);
  assert.equal(s.claimed_at, null);
  calls = fakeWorld(runRow({ status: 'running', cursor: s.cursor }), slow);
  await advanceImport(Date.now() + 5_000, null);
  assert.deepEqual(calls.site, []);
});

test('ingest: attributes and sku only from an import, cleaned', () => {
  const x = extras({ source: 'import', sku: '  KA 50 ', attributes: { brand: ' Kumari  Art ', 'Bad Key': 'x', nested: { a: 1 }, empty: '', weight: '750 g' } });
  assert.equal(x.sku, 'KA 50');
  assert.deepEqual(x.attributes, { brand: 'Kumari Art', weight: '750 g' });
  assert.throws(() => extras({ source: 'telegram', attributes: { brand: 'x' } }), /only from a website import/);
  assert.throws(() => extras({ source: 'import', attributes: ['x'] }), /must be an object/);
  assert.deepEqual(extras({ source: 'telegram' }), {});
  // Owner, 2026-11-12: the store's size choices come in as written, measurement included, and only from an import.
  assert.deepEqual(extras({ source: 'import', sizes: [' XS (34) ', 'S  (36)', 'XS (34)', '', null, 'Free Size'] }).sizes, ['XS (34)', 'S (36)', 'Free Size']);
  assert.ok(!('sizes' in extras({ source: 'import', sizes: [] })) && !('sizes' in extras({ source: 'import', sizes: 'XS' })));
  assert.throws(() => extras({ source: 'telegram', sizes: ['M'] }), /only from a website import/);
  assert.equal(extras({ source: 'import', sizes: Array.from({ length: 40 }, (_, i) => `S${i}`) }).sizes.length, 30);
});
