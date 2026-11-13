// node --test --experimental-strip-types supabase/functions/pb-products/test/
// Starting an import (import/actions.ts importStart) against a fake store and a fake database. The vendor is optional
// (owner, 13 Nov 2026: "vendor not mandatory while scrapping from website"): none given, the run is queued without
// one and no vendor is made — the website's own name is not turned into a vendor either; a name given, the vendor is
// made (or found) and the run filed under it. ~12 s (the store is paced at one request a second).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { importStart } = await import('../import/actions.ts');
const product = JSON.parse(readFileSync(new URL('shopify.products.json', new URL('.', import.meta.url)), 'utf8')).products[0];

/** A Shopify store (robots, one product, a home page titled "Kumari Art | Sarees") and a database that records writes. */
function world() {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), method = init.method || 'GET';
    const ok = (body, status = 200, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
    if (u.startsWith('https://kumari-art.in/')) {
      const path = u.slice('https://kumari-art.in'.length);
      if (path === '/robots.txt') return ok('User-agent: *\nDisallow: /cart');
      if (path.startsWith('/products.json')) return ok({ products: [product] }, 200, { 'content-type': 'application/json' });
      if (path === '/') return ok('<html><head><title>Kumari Art | Sarees</title></head><body></body></html>', 200, { 'content-type': 'text/html' });
      return ok('', 404);
    }
    const path = decodeURIComponent(u.replace('https://sb.example/rest/v1/', ''));
    calls.push([method, path, init.body ? JSON.parse(init.body) : null]);
    if (method === 'POST' && path.startsWith('pb_vendors')) return ok([{ id: 'v1' }], 201);
    if (method === 'POST' && path.startsWith('pb_import_runs')) return ok([{ id: 'run1' }], 201);
    return ok([]);
  };
  return calls;
}
const posted = (calls, table) => calls.filter(([m, p]) => m === 'POST' && p.startsWith(`${table}?`)).map(([, , b]) => b[0]);

test('no vendor given: the run is queued without one, and no vendor is made', async () => {
  for (const vendor_name of ['', '   ', undefined]) {
    const calls = world();
    const r = await importStart({ url: 'https://kumari-art.in', ...(vendor_name === undefined ? {} : { vendor_name }) }, 'u1');
    assert.deepEqual([r.ok, r.run_id, r.platform], [true, 'run1', 'shopify']);
    assert.equal(posted(calls, 'pb_vendors').length, 0, 'not even one named after the website');
    assert.equal(posted(calls, 'pb_import_runs')[0].vendor_id, null);
    assert.equal(posted(calls, 'pb_activity')[0].details.vendor, null);
  }
});

test('a vendor given: made (or found) under its tidied name, and the run filed under it', async () => {
  const calls = world();
  await importStart({ url: 'https://kumari-art.in', vendor_name: '  Kumari   Art ' }, 'u1');
  assert.deepEqual(posted(calls, 'pb_vendors'), [{ name: 'Kumari Art' }]);
  assert.equal(posted(calls, 'pb_import_runs')[0].vendor_id, 'v1');
  assert.equal(posted(calls, 'pb_activity')[0].details.vendor, 'Kumari Art');
});
