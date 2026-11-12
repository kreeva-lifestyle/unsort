// node --test --experimental-strip-types supabase/functions/pb-products/test/
// Delete a product for good: what is refused, what is removed and in which order, what stays as a trace.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { deleteProduct, onShopify } = await import('../productDelete.ts');

const ID = '11111111-2222-4333-8444-555555555555';
const now = () => new Date().toISOString();

/** A fake database + storage. `w.product` null = already gone. */
function world(w) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)), method = init.method || 'GET';
    const ok = (body, status = 200) => new Response(JSON.stringify(body), { status });
    calls.push(`${method} ${u.replace('https://sb.example', '').split('&select')[0].split('?select')[0]}`);
    if (u.includes('/rest/v1/pb_products?') && method === 'GET') return ok(w.product ? [w.product] : []);
    if (u.includes('/rest/v1/pb_listings?')) return ok(w.listings || []);
    if (u.includes('/rest/v1/pb_product_images?')) return ok((w.files || []).map(path => ({ path })));
    if (u.includes('/rest/v1/pb_products?') && method === 'DELETE') { w.deleted = true; return new Response(null, { status: w.dbFails ? 500 : 204 }); }
    if (u.includes('/storage/v1/object/playbook-products') && method === 'DELETE') {
      w.removed = JSON.parse(init.body).prefixes;
      if (w.storageFails) return ok({ message: 'down' }, 500);
      return ok(w.removed.slice(0, w.removed.length - (w.storageMisses || 0)).map(name => ({ name })));
    }
    if (u.includes('/rest/v1/pb_activity')) { w.logged = JSON.parse(init.body)[0]; return ok([{}], 201); }
    return ok([], 404);
  };
  return calls;
}
const product = (over = {}) => ({ id: ID, name: 'Wine sharara set', sku: 'KB 302 WINE XS', status: 'ready', source: 'import', source_ref: 'www.bahu.example:7001', claimed_at: null, ...over });

test('a product is removed: the row first, then its files, and one line stays to say who deleted what', async () => {
  const w = { product: product(), listings: [{ id: 'l1', status: 'review', shopify_product_id: null, claimed_at: null, pb_websites: { name: 'Arya Store' } }], files: [`${ID}/1.jpg`, `${ID}/2.jpg`, `${ID}/v.mp4`] };
  const calls = world(w);
  assert.deepEqual(await deleteProduct({ product_id: ID }, 'user-1'), { ok: true, photos_left: 0 });
  assert.equal(w.deleted, true);
  assert.deepEqual(w.removed, [`${ID}/1.jpg`, `${ID}/2.jpg`, `${ID}/v.mp4`]);
  const del = calls.findIndex(c => c.startsWith('DELETE /rest/v1/pb_products')), files = calls.findIndex(c => c.startsWith('DELETE /storage'));
  assert.ok(del >= 0 && files > del, 'the row goes before the files');
  assert.equal(w.logged.action, 'deleted'); assert.equal(w.logged.product_id, null); assert.equal(w.logged.user_id, 'user-1');
  assert.deepEqual(w.logged.details, { name: 'Wine sharara set', sku: 'KB 302 WINE XS', source: 'import', source_ref: 'www.bahu.example:7001', files: 3 });
});

test('refused while it is on Shopify, naming the website; a listing taken off the site does not block', async () => {
  const live = { id: 'l1', status: 'published', shopify_product_id: 'gid://shopify/Product/1', shopify_status: 'ACTIVE', claimed_at: null, pb_websites: { name: 'Arya Store' } };
  const off = { ...live, status: 'skipped', shopify_status: 'DRAFT' }; // Remove from site: removed here and Draft there
  const w = { product: product(), listings: [live], files: [`${ID}/1.jpg`] };
  world(w);
  await assert.rejects(deleteProduct({ product_id: ID }, null), e => e.status === 409 && /on Shopify \(Arya Store\)/.test(e.message) && /Remove from site/.test(e.message));
  assert.equal(w.deleted, undefined); assert.equal(w.removed, undefined); assert.equal(w.logged, undefined);
  const failed = { ...live, status: 'failed' }; // an update that failed: the product is still on Shopify
  assert.equal(onShopify([failed, off, { ...live, shopify_product_id: null }]).length, 1);
  const w2 = { product: product(), listings: [off], files: [] };
  world(w2);
  assert.equal((await deleteProduct({ product_id: ID }, null)).ok, true);
  assert.equal(w2.deleted, true);
  // Removed in Playbook but perhaps still on sale on Shopify: not deleted, and the way out is named.
  const w3 = { product: product(), listings: [{ ...live, status: 'skipped' }], files: [] };
  world(w3);
  await assert.rejects(deleteProduct({ product_id: ID }, null), e => e.status === 409 && /Put back on site, then Remove from site/.test(e.message));
  assert.equal(w3.deleted, undefined);
});

test('refused while the AI reads it or a listing is being written or sent', async () => {
  const w = { product: product({ status: 'reading', claimed_at: now() }) };
  world(w);
  await assert.rejects(deleteProduct({ product_id: ID }, null), e => e.status === 409 && /reading this product/.test(e.message));
  const w2 = { product: product(), listings: [{ id: 'l1', status: 'generating', shopify_product_id: null, claimed_at: now(), pb_websites: null }] };
  world(w2);
  await assert.rejects(deleteProduct({ product_id: ID }, null), e => e.status === 409 && /being written or sent/.test(e.message));
  assert.equal(w2.deleted, undefined);
  // a claim that went stale (a run that died) no longer blocks
  const old = new Date(Date.now() - 20 * 60_000).toISOString();
  const w3 = { product: product({ status: 'reading', claimed_at: old }), listings: [{ id: 'l1', status: 'publishing', shopify_product_id: null, claimed_at: old, pb_websites: null }] };
  world(w3);
  assert.equal((await deleteProduct({ product_id: ID }, null)).ok, true);
});

test('files that could not be removed are counted, and the product is still gone', async () => {
  const w = { product: product(), files: [`${ID}/1.jpg`, `${ID}/2.jpg`], storageMisses: 1 };
  world(w);
  assert.deepEqual(await deleteProduct({ product_id: ID }, null), { ok: true, photos_left: 1 });
  assert.equal(w.logged.details.files_left, 1);
  const w2 = { product: product(), files: [`${ID}/1.jpg`], storageFails: true };
  world(w2);
  assert.deepEqual(await deleteProduct({ product_id: ID }, null), { ok: true, photos_left: 1 });
  assert.equal(w2.deleted, true);
});

test('a product that is already gone, a bad id, a database that refuses', async () => {
  world({ product: null });
  await assert.rejects(deleteProduct({ product_id: ID }, null), e => e.status === 404);
  await assert.rejects(deleteProduct({ product_id: 'nope' }, null), e => e.status === 400);
  await assert.rejects(deleteProduct({}, null), e => e.status === 400);
  const w = { product: product(), files: [`${ID}/1.jpg`], dbFails: true };
  world(w);
  await assert.rejects(deleteProduct({ product_id: ID }, null), e => e.status === 502);
  assert.equal(w.removed, undefined, 'no file is touched when the row could not be deleted');
  assert.equal(w.logged, undefined);
});
