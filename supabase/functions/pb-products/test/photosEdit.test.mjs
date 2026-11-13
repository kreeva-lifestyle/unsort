// node --test --experimental-strip-types supabase/functions/pb-products/test/
// Removing and reordering a product's photos: what is deleted, what is refused, and what it sets going
// (the store follows; no listing is written again for a photo).
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { photosSet, photosSync } = await import('../photosEdit.ts');
const { galleryBehind, routeProduct } = await import('../route.ts');

const ID = '11111111-2222-4333-8444-555555555555';
const img = (n) => ({ id: `aaaaaaaa-0000-4000-8000-00000000000${n}`, path: `${ID}/${n}.jpg` });
const [A, B, C, D] = [1, 2, 3, 4].map(img);
const now = () => new Date().toISOString();
const site = (over = {}) => ({ id: 's1', name: 'Arya Store', active: true, publish_mode: 'live', routing_default: 'all', pricing: {}, ...over });
const listing = (over = {}) => ({ id: 'l1', product_id: ID, website_id: 's1', status: 'published', error: null, claimed_at: null, locked: [], price: 1000, compare_at_price: null,
  shopify_product_id: 'gid://shopify/Product/1', published_at: '2026-11-12T10:00:00Z', pb_websites: site(), ...over });
const product = (over = {}) => ({ id: ID, status: 'ready', ai_error: null, claimed_at: null, cost_price: 1000, sell_price: null, sizes: ['M'], sku: 'KB 1', ...over });

/** A fake database + storage. `w.images` in order; `w.sent` = the photos each listing was last sent with. */
function world(w) {
  const calls = [];
  w.logged = []; w.patched = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)).replace('https://sb.example', ''), method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    const ok = (b, status = 200) => new Response(JSON.stringify(b), { status });
    calls.push(`${method} ${u.split('&select')[0].split('?select')[0]}`);
    if (u.startsWith('/rest/v1/pb_products?') && method === 'GET') return ok(w.product ? [w.product] : []);
    if (u.startsWith('/rest/v1/pb_products?') && method === 'PATCH') {
      w.patched.push({ table: 'pb_products', u, body });
      if (w.product && (!u.includes('status=eq.') || u.includes(`status=eq.${w.product.status}`)) && !(u.includes('route_due=eq.true') && !w.product.route_due)) { Object.assign(w.product, body); return ok([{ id: ID }]); }
      return ok([]);
    }
    if (u.startsWith('/rest/v1/pb_listings?') && method === 'GET') return ok(u.includes('status=eq.generating') ? (w.writing ? [{ id: 'lw' }] : []) : (w.listings || []));
    if (u.startsWith('/rest/v1/pb_listings?') && method === 'PATCH') {
      const l = (w.listings || []).find(x => u.includes(`id=eq.${x.id}`) && (!/[?&]status=eq\./.test(u) || u.includes(`status=eq.${x.status}`)));
      w.patched.push({ table: 'pb_listings', u, body });
      if (!l) return ok([]);
      Object.assign(l, body); return ok([{ id: l.id }]);
    }
    if (u.startsWith('/rest/v1/pb_listings') && method === 'POST') { w.inserted = body; return ok(body.map((r, i) => ({ id: `new${i}`, ...r })), 201); }
    if (u.startsWith('/rest/v1/pb_product_images?') && method === 'GET') return ok(u.includes('select=path') ? w.images.slice(0, 20).map(i => ({ path: i.path })) : w.images.map(i => ({ id: i.id })));
    if (u.startsWith('/rest/v1/pb_product_images?') && method === 'DELETE') { w.images = w.images.filter(i => !u.includes(i.id)); w.rowsGone = (w.rowsGone || 0) + 1; return new Response(null, { status: 204 }); }
    if (u.startsWith('/rest/v1/rpc/pb_photos_set')) {
      if (body.p_order.some(x => !w.images.some(i => i.id === x))) return ok({ code: 'P0001', message: 'The photos changed meanwhile. Open the product again.' }, 400);
      const left = w.images.filter(i => !body.p_order.includes(i.id));
      w.images = [...body.p_order.map(x => w.images.find(i => i.id === x)), ...left];
      return ok(left);
    }
    if (u.startsWith('/rest/v1/rpc/pb_products_refresh')) {
      if (w.gateFails) return ok({ message: 'down' }, 500);
      const status = ['ready', 'needs_info'].includes(w.product.status) ? (w.images.length ? w.product.status : 'needs_info') : w.product.status;
      const was = w.product.status; w.product.status = status;
      return ok([{ id: ID, status, was, missing: [] }]);
    }
    if (u.startsWith('/storage/v1/object/playbook-products') && method === 'DELETE') { w.files = body.prefixes; return w.storageFails ? ok({ message: 'down' }, 500) : ok(body.prefixes.map(name => ({ name }))); }
    if (u.startsWith('/rest/v1/pb_activity') && method === 'GET') return ok(Object.entries(w.sent || {}).map(([listing_id, details]) => ({ listing_id, details })));
    if (u.startsWith('/rest/v1/pb_activity')) { w.logged.push(body[0]); return ok([{}], 201); }
    if (u.startsWith('/rest/v1/pb_websites?')) return ok(w.sites || [site()]);
    if (u.startsWith('/rest/v1/pb_routing_rules?')) return ok([]);
    return ok([], 404);
  };
  return calls;
}
const paths = (list) => list.map(i => i.path);
const log = (w, action) => w.logged.find(x => x.action === action);

test('a removed photo goes for good, and a published listing is sent to the store again without the AI', async () => {
  const w = { product: product(), images: [A, B, C], listings: [listing()], sent: { l1: { photos: paths([A, B, C]) } } };
  const calls = world(w);
  const r = await photosSet({ product_id: ID, order: [A.id, C.id], remove: [B.id] }, 'user-1');
  assert.deepEqual(r, { ok: true, removed: 1, status: 'ready', resent: 1, review: 0, reread: false });
  assert.deepEqual(w.images, [A, C]); assert.deepEqual(w.files, [B.path]);
  const row = calls.findIndex(c => c.startsWith('DELETE /rest/v1/pb_product_images')), file = calls.findIndex(c => c.startsWith('DELETE /storage'));
  assert.ok(row >= 0 && file > row, 'the row goes before the file');
  assert.equal(w.listings[0].status, 'publishing', 'sent again as it is: not queued for the writer');
  assert.deepEqual(log(w, 'photos_edited').details, { removed: 1, photos: 2 }); assert.equal(log(w, 'photos_edited').user_id, 'user-1');
  assert.deepEqual(log(w, 'routed').details, { websites: [], resent: ['Arya Store'], photos: true });
});

test('a photo someone added meanwhile is in neither list: it stays, after the others', async () => {
  const w = { product: product(), images: [A, B, C, D], listings: [] };
  world(w);
  const r = await photosSet({ product_id: ID, order: [C.id, A.id], remove: [B.id] }, null); // D arrived after the page was opened
  assert.equal(r.removed, 1);
  assert.deepEqual(w.images, [C, A, D]); assert.deepEqual(w.files, [B.path]);
  assert.deepEqual(log(w, 'photos_edited').details, { removed: 1, photos: 3, reordered: true, main_changed: true });
});

test('a new main photo: nothing is deleted; a review site waits for approval; a listing still waiting is left as it is', async () => {
  const waiting = listing({ id: 'l2', status: 'review', published_at: null, shopify_product_id: null, pb_websites: site({ name: 'Second Store' }) });
  const w = { product: product(), images: [A, B, C], listings: [listing({ pb_websites: site({ publish_mode: 'review' }) }), waiting], sent: { l1: { photos: paths([A, B, C]) } } };
  const calls = world(w);
  const r = await photosSet({ product_id: ID, order: [B.id, A.id, C.id], remove: [] }, null);
  assert.deepEqual(r, { ok: true, removed: 0, status: 'ready', resent: 0, review: 1, reread: false });
  assert.ok(!calls.some(c => c.startsWith('DELETE')), 'nothing is deleted');
  assert.equal(w.listings[0].status, 'review');
  assert.equal(w.listings[1].status, 'review'); assert.ok(!w.patched.some(x => x.u.includes('id=eq.l2')), 'not written again for a photo');
  assert.deepEqual(log(w, 'photos_edited').details, { removed: 0, photos: 3, reordered: true, main_changed: true });
});

test('refused: while the AI reads it or writes a listing, a list that is not valid, a product or photo that is gone', async () => {
  world({ product: product({ status: 'reading', claimed_at: now() }), images: [A] });
  await assert.rejects(photosSet({ product_id: ID, order: [A.id] }, null), e => e.status === 409 && /reading this product/.test(e.message));
  const w = { product: product(), images: [A, B], writing: true };
  world(w);
  await assert.rejects(photosSet({ product_id: ID, order: [A.id], remove: [B.id] }, null), e => e.status === 409 && /being written/.test(e.message));
  assert.deepEqual(w.images, [A, B]);
  world({ product: product(), images: [A, B] });
  for (const bad of [{ order: [A.id], remove: [A.id] }, { order: [A.id, A.id] }, { order: ['x'] }, { order: 'no' }, { order: [A.id], remove: 'no' }]) {
    await assert.rejects(photosSet({ product_id: ID, ...bad }, null), e => e.status === 400 && /not valid/.test(e.message));
  }
  await assert.rejects(photosSet({ product_id: 'x', order: [] }, null), e => e.status === 400);
  world({ product: null, images: [] });
  await assert.rejects(photosSet({ product_id: ID, order: [] }, null), e => e.status === 404);
  const w2 = { product: product(), images: [A] };
  world(w2);
  await assert.rejects(photosSet({ product_id: ID, order: [A.id, B.id] }, null), e => e.status === 400 && /changed meanwhile/.test(e.message)); // B was removed by someone else
  assert.equal(w2.logged.length, 0);
});

test('a product the AI gave up on because of a photo is read again once a photo is removed; nothing is sent meanwhile', async () => {
  const err = 'The AI could not open one of the product photos.';
  const w = { product: product({ status: 'needs_info', ai_error: err }), images: [A, B], listings: [listing()], sent: { l1: { photos: paths([A, B]) } } };
  world(w);
  const r = await photosSet({ product_id: ID, order: [A.id], remove: [B.id] }, null);
  assert.deepEqual(r, { ok: true, removed: 1, status: 'new', resent: 0, review: 0, reread: true });
  assert.equal(w.product.status, 'new'); assert.equal(w.product.ai_error, null);
  assert.equal(w.listings[0].status, 'published');
  // a new main photo alone does not start a read, and another error is not a photo error
  const w2 = { product: product({ status: 'needs_info', ai_error: err }), images: [A, B] };
  world(w2);
  assert.equal((await photosSet({ product_id: ID, order: [B.id, A.id] }, null)).reread, false);
  const w3 = { product: product({ status: 'needs_info', ai_error: 'The AI is busy.' }), images: [A, B] };
  world(w3);
  assert.equal((await photosSet({ product_id: ID, order: [A.id], remove: [B.id] }, null)).reread, false);
});

test('a listing the writer gave up on because of a photo is queued again; the last photo gone holds the product', async () => {
  const failed = listing({ status: 'failed', error: 'The AI could not open one of the product photos.', published_at: null, shopify_product_id: null });
  const w = { product: product(), images: [A, B], listings: [failed] };
  world(w);
  await photosSet({ product_id: ID, order: [A.id], remove: [B.id] }, null);
  assert.equal(w.listings[0].status, 'queued'); assert.equal(w.listings[0].error, null);
  const w2 = { product: product(), images: [A], listings: [listing()], sent: { l1: { photos: paths([A]) } } };
  world(w2);
  const r = await photosSet({ product_id: ID, order: [], remove: [A.id] }, null);
  assert.equal(r.status, 'needs_info'); assert.equal(r.resent, 0);
  assert.equal(w2.listings[0].status, 'published', 'the store keeps what it has while the product is held');
});

test('the photos are saved even when what follows fails: a warning, and the worker checks the websites again', async () => {
  const w = { product: product(), images: [A, B], listings: [listing()], sent: { l1: { photos: paths([A, B]) } }, gateFails: true, storageFails: true };
  world(w);
  const r = await photosSet({ product_id: ID, order: [A.id], remove: [B.id] }, null);
  assert.equal(r.ok, true); assert.equal(r.removed, 1); assert.deepEqual(w.images, [A]);
  assert.match(r.warning, /1 photo file could not be removed/); assert.match(r.warning, /checks them again by itself/);
  assert.equal(w.product.route_due, true);
});

test('a listing going out right now is checked again by the worker; photos added in the app reach the store the same way', async () => {
  const w = { product: product(), images: [A, B], listings: [listing({ status: 'publishing', claimed_at: now() })], sent: {} };
  world(w);
  await photosSet({ product_id: ID, order: [B.id, A.id] }, null);
  assert.equal(w.product.route_due, true);
  const w2 = { product: product(), images: [A, B, C], listings: [listing()], sent: { l1: { photos: paths([A, B]) } } };
  world(w2);
  assert.deepEqual(await photosSync({ product_id: ID }, null), { ok: true, status: 'ready', resent: 1, review: 0, reread: false });
  assert.equal(w2.listings[0].status, 'publishing');
  world({ product: null, images: [] });
  await assert.rejects(photosSync({ product_id: ID }, null), e => e.status === 404);
});

test('"behind": only a real difference from what the store was last sent, or last refused', () => {
  assert.equal(galleryBehind({ photos: ['a', 'b'] }, ['a', 'b']), false);
  assert.equal(galleryBehind({ photos: ['a', 'b'] }, ['b', 'a']), true);
  assert.equal(galleryBehind({ photos: ['a', 'b'] }, ['a']), true);
  assert.equal(galleryBehind({ photos: ['a'], photos_tried: ['a', 'b'] }, ['a', 'b']), false, 'the store refused this list: not sent again by itself');
  assert.equal(galleryBehind({ photos: ['a'], photos_tried: ['a', 'b'] }, ['a', 'c']), true);
  assert.equal(galleryBehind({}, ['a']), false, 'no record of what was sent: left alone');
  assert.equal(galleryBehind(undefined, ['a']), false);
  assert.equal(galleryBehind({ photos: ['a'] }, []), false, 'no photos here: nothing would be sent');
});

test('routing: a published listing whose photos changed is sent again; one waiting to go out again is not rewritten', async () => {
  const p = { id: ID, status: 'ready', cost_price: 1000, sell_price: null, sizes: ['M'], sku: 'KB 1', category: 'Kurta set', fabric: 'Cotton', color: 'Red', vendor_id: null, attributes: {}, tags: [] };
  const w = { product: product(), images: [B, A], listings: [listing()], sent: { l1: { photos: paths([A, B]), sizes: ['M'], sku: 'KB 1' } } };
  world(w);
  let r = await routeProduct(p, null);
  assert.equal(r.resent, 1); assert.equal(w.listings[0].status, 'publishing');
  // Routed again before it went out (a second change in the same minute): it stays as it is.
  r = await routeProduct(p, null);
  assert.equal(r.resent, 0); assert.equal(r.routed, 0); assert.equal(w.listings[0].status, 'publishing');
  // …and only its price follows a new cost.
  r = await routeProduct({ ...p, cost_price: 1200 }, null);
  assert.equal(r.repriced, 1); assert.equal(w.listings[0].status, 'publishing'); assert.equal(w.listings[0].price, 1200);
  // A listing that was never published and waits for review is written again, as before.
  const w2 = { product: product(), images: [A], listings: [listing({ status: 'review', published_at: null, shopify_product_id: null })] };
  world(w2);
  r = await routeProduct(p, null);
  assert.equal(r.routed, 1); assert.equal(w2.listings[0].status, 'queued');
});
