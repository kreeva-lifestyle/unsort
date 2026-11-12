// node --test --experimental-strip-types supabase/functions/pb-products/test/
// The log of bulk changes (owner, 2026-11-12): every bulk action opens a run,
// marks its database calls with it and closes it; a revert asks the database
// to put the rows back, and deletes an import's products itself.
// The SQL side (what is put back, what is left alone) was run against the
// real schema in transactions that were rolled back: see the migration notes.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { REVERTED, startRun, endRun, settledRun } = await import('../bulkLog.ts');
const { retryFailed, rereadFailed } = await import('../bulk.ts');
const { bulkPreview, bulkRevert, counts } = await import('../bulkRevert.ts');
const { takeOffDue } = await import('../takeOff.ts');
const { routeWebsite } = await import('../routeSite.ts');

const RUN = '11111111-2222-4333-8444-555555555555';
const SITE = 'aaaaaaaa-2222-4333-8444-555555555555';
const ids = (n) => Array.from({ length: n }, (_, i) => `0000000${i % 10}-0000-4000-8000-${String(i).padStart(12, '0')}`);

/** A fake database. `on(method, path, body, headers)` answers a call (undefined → the default below). */
function world(on = () => undefined) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)).replace('https://sb.example', ''), method = init.method || 'GET';
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, u, body, run: headers['x-pb-bulk'] ?? null });
    const given = on(method, u, body, headers);
    if (given instanceof Response) return given;
    if (given !== undefined) return new Response(JSON.stringify(given), { status: 200 });
    if (method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '0-0/0' } });
    if (method === 'DELETE') return new Response(null, { status: 204 });
    if (u.startsWith('/rest/v1/pb_bulk_runs') && method === 'POST') return new Response(JSON.stringify([{ id: RUN }]), { status: 201 });
    return new Response(JSON.stringify([]), { status: 200 });
  };
  return calls;
}
const head = (n) => new Response(null, { status: 200, headers: { 'content-range': `0-0/${n}` } });

test('the note on a listing a revert took back can travel inside a database filter', () => {
  assert.doesNotMatch(REVERTED, /["',()]/, 'no quotes, commas or brackets');
  assert.match(REVERTED, /Put back on site/);
});

test('a bulk change opens a run; its own id is used when given, and an existing run is left alone', async () => {
  let calls = world();
  assert.equal(await startRun('reprice_site', '  Re-priced   listings on Arya Store ', { websiteId: SITE, userId: 'u1' }), RUN);
  assert.deepEqual(calls[0].body, [{ kind: 'reprice_site', label: 'Re-priced listings on Arya Store', website_id: SITE, created_by: 'u1', status: 'running' }]);
  calls = world((m, u) => (m === 'POST' && u.startsWith('/rest/v1/pb_bulk_runs') ? [] : undefined)); // the row is there already: nothing comes back
  assert.equal(await startRun('import', 'Imported products from shop.example', { id: RUN, createdAt: '2026-11-10T03:58:33Z' }), RUN);
  assert.match(calls[0].u, /on_conflict=id/);
  assert.equal(calls[0].body[0].id, RUN); assert.equal(calls[0].body[0].created_at, '2026-11-10T03:58:33Z');
});

test('closing a run: with rows it becomes done with their count; with none it leaves the log; a failure never throws', async () => {
  let calls = world((m) => (m === 'HEAD' ? head(118) : undefined));
  assert.equal(await endRun(RUN, { repriced: 118, kept: 2 }), 118);
  const p = calls.find(c => c.method === 'PATCH');
  assert.match(p.u, /pb_bulk_runs\?id=eq\.11111111.*status=eq\.running/);
  assert.equal(p.body.status, 'done'); assert.equal(p.body.items, 118); assert.deepEqual(p.body.details, { repriced: 118, kept: 2 });
  calls = world();
  assert.equal(await endRun(RUN, { repriced: 0 }), 0);
  assert.ok(calls.some(c => c.method === 'DELETE' && c.u.startsWith('/rest/v1/pb_bulk_runs?id=eq.11111111')), 'a change that touched nothing is not kept');
  world((m) => (m === 'HEAD' ? new Response(null, { status: 500 }) : undefined));
  assert.equal(await endRun(RUN), -1);
});

test('"Retry all failed" marks both of its database calls with the run, and closes it', async () => {
  const calls = world((m, u) => {
    if (m === 'HEAD') return head(3);
    if (m === 'GET' && u.startsWith('/rest/v1/pb_websites')) return [{ name: 'Arya Store' }];
    if (m === 'PATCH' && u.includes('generated_at=not.is.null')) return [{ id: 'a' }, { id: 'b' }];
    if (m === 'PATCH' && u.includes('generated_at=is.null')) return [{ id: 'c' }];
    return undefined;
  });
  assert.deepEqual(await retryFailed({ website_id: SITE }, 'u1'), { ok: true, retried: 3 });
  assert.equal(calls.find(c => c.method === 'POST' && c.u.startsWith('/rest/v1/pb_bulk_runs')).body[0].label, 'Retried failed listings on Arya Store');
  const marks = calls.filter(c => c.method === 'PATCH' && c.u.startsWith('/rest/v1/pb_listings'));
  assert.equal(marks.length, 2);
  assert.ok(marks.every(c => c.run === RUN), 'the database records what these change under the run');
  assert.ok(calls.filter(c => !c.u.startsWith('/rest/v1/pb_listings')).every(c => c.run === null), 'nothing else is recorded under it');
  const closed = calls.find(c => c.method === 'PATCH' && c.u.startsWith('/rest/v1/pb_bulk_runs'));
  assert.deepEqual(closed.body.details, { retried: 3, to_shopify: 2, to_writer: 1 });
});

test('"Read again" for unread products is recorded the same way', async () => {
  const calls = world((m, u) => (m === 'HEAD' ? head(2) : m === 'PATCH' && u.startsWith('/rest/v1/pb_products') ? [{ id: 'p1' }, { id: 'p2' }] : undefined));
  assert.deepEqual(await rereadFailed('u1'), { ok: true, queued: 2 });
  assert.equal(calls.find(c => c.method === 'PATCH' && c.u.startsWith('/rest/v1/pb_products')).run, RUN);
});

test('a run left "running" by a cut-off call is closed before it is looked at; an import only once the import is over', async () => {
  const row = (over) => ({ id: RUN, kind: 'reprice_site', label: 'x', status: 'running', website_id: SITE, created_at: new Date(Date.now() - 20 * 60_000).toISOString(), details: {}, ...over });
  let calls = world((m, u) => (m === 'HEAD' ? head(5) : m === 'GET' && u.startsWith('/rest/v1/pb_bulk_runs') ? [row()] : undefined));
  assert.equal((await settledRun(RUN)).status, 'done');
  assert.ok(calls.some(c => c.method === 'PATCH' && c.body.status === 'done'));
  calls = world((m, u) => (m === 'GET' && u.startsWith('/rest/v1/pb_bulk_runs') ? [row({ created_at: new Date().toISOString() })] : undefined));
  assert.equal((await settledRun(RUN)).status, 'running', 'a young run is still at work');
  calls = world((m, u) => (m === 'GET' && u.startsWith('/rest/v1/pb_bulk_runs') ? [row({ kind: 'import' })] : m === 'GET' && u.startsWith('/rest/v1/pb_import_runs') ? [{ id: RUN }] : undefined));
  assert.equal((await settledRun(RUN)).status, 'running', 'the import is still going, however old');
  world();
  assert.equal(await settledRun(RUN), null);
});

test('counts: only the numbers of the database answer', () => {
  assert.deepEqual(counts({ kind: 'reread', label: 'x', restored: 136, fields: 454, changed: 0, ids: ['a'], busy: 0 }), { restored: 136, fields: 454, changed: 0, busy: 0 });
  assert.deepEqual(counts(null), {});
});

test('preview asks the database without changing anything; revert passes who and the note, and writes the timeline', async () => {
  const run = { id: RUN, kind: 'route_site', label: 'Sent matching products to Arya Store', status: 'done', website_id: SITE, created_at: new Date().toISOString(), details: {} };
  let calls = world((m, u) => (m === 'GET' && u.startsWith('/rest/v1/pb_bulk_runs') ? [run] : u === '/rest/v1/rpc/pb_bulk_revert' ? { kind: 'route_site', label: run.label, aside: 40, live: 12, off: 1, gone: 0, busy: 0 } : undefined));
  assert.deepEqual(await bulkPreview({ run_id: RUN }), { ok: true, kind: 'route_site', aside: 40, live: 12, off: 1, gone: 0, busy: 0 });
  assert.deepEqual(calls.find(c => c.u === '/rest/v1/rpc/pb_bulk_revert').body, { p_run: RUN, p_apply: false });
  calls = world((m, u) => (m === 'GET' && u.startsWith('/rest/v1/pb_bulk_runs') ? [run] : u === '/rest/v1/rpc/pb_bulk_revert' ? { kind: 'route_site', label: run.label, aside: 40, live: 12, off: 1, gone: 0, busy: 0 } : undefined));
  assert.deepEqual(await bulkRevert({ run_id: RUN }, 'u1'), { ok: true, kind: 'route_site', aside: 40, live: 12, off: 1, gone: 0, busy: 0 });
  assert.deepEqual(calls.find(c => c.u === '/rest/v1/rpc/pb_bulk_revert').body, { p_run: RUN, p_apply: true, p_user: 'u1', p_note: REVERTED });
  const log = calls.find(c => c.u.startsWith('/rest/v1/pb_activity')).body[0];
  assert.equal(log.action, 'bulk_reverted'); assert.equal(log.website_id, SITE); assert.equal(log.details.live, 12);
  world();
  await assert.rejects(() => bulkRevert({ run_id: RUN }, 'u1'), /no longer in the list/);
});

test('reverting an import deletes only what the database calls untouched, rows before files, and says what it kept', async () => {
  const run = { id: RUN, kind: 'import', label: 'Imported products from shop.example', status: 'done', website_id: null, created_at: new Date().toISOString(), details: {} };
  const left = new Map([...ids(30).map(id => [id, 'delete']), ['on-site-1', 'on_site'], ['edited-1', 'edited']]);
  const order = [], marked = [];
  let closed = null;
  const calls = world((m, u, body) => {
    if (m === 'GET' && u.startsWith('/rest/v1/pb_bulk_runs?id=eq') && u.includes('select=id,kind')) return [run];
    if (m === 'GET' && u.startsWith('/rest/v1/pb_bulk_runs?id=eq')) return [{ revert_result: null }];
    if (u === '/rest/v1/rpc/pb_bulk_revert') return { kind: 'import', delete: 30, on_site: 1, edited: 1 };
    if (u === '/rest/v1/rpc/pb_bulk_import_targets') return [...left].map(([product_id, verdict]) => ({ product_id, verdict }));
    if (m === 'GET' && u.startsWith('/rest/v1/pb_product_images')) return [{ path: 'a/1.jpg' }, { path: 'a/2.jpg' }];
    if (m === 'DELETE' && u.startsWith('/rest/v1/pb_products')) { order.push('rows'); for (const id of u.match(/in\.\(([^)]*)\)/)[1].split(',')) left.delete(id); return new Response(null, { status: 204 }); }
    if (m === 'DELETE' && u.startsWith('/storage/v1/object/')) { order.push('files'); return body.prefixes.map(name => ({ name })); }
    if (u === '/rest/v1/rpc/pb_bulk_mark_done') { marked.push(body.p_ids.length); return 0; }
    if (u === '/rest/v1/rpc/pb_bulk_close') { closed = body; return new Response(null, { status: 204 }); }
    return undefined;
  });
  const r = await bulkRevert({ run_id: RUN }, 'u1');
  assert.deepEqual(r, { ok: true, kind: 'import', deleted: 30, on_site: 1, edited: 1, busy: 0, more: false });
  assert.deepEqual(order, ['rows', 'files', 'rows', 'files'], '25 at a time, the rows before their files');
  assert.deepEqual(marked, [25, 5, 1], 'the deleted ones, then the one kept for good (typed into)');
  assert.deepEqual(closed, { p_run: RUN, p_user: 'u1', p_result: { deleted: 30, on_site: 1, edited: 1, busy: 0 }, p_more: true });
  assert.ok(left.has('on-site-1') && left.has('edited-1'), 'a product on a store or typed into is never deleted');
  assert.equal(calls.filter(c => c.method === 'DELETE' && c.u.startsWith('/rest/v1/pb_products')).every(c => !c.u.includes('on-site-1') && !c.u.includes('edited-1')), true);
});

test('taking listings off their store: a store that fails is tried once a run, and the others still go', async () => {
  const due = [{ id: 'l1', website_id: 'w-down' }, { id: 'l2', website_id: 'w-down' }, { id: 'l3', website_id: 'w-ok' }];
  const listing = (id) => ({ id, product_id: 'p', website_id: id === 'l3' ? 'w-ok' : 'w-down', status: 'published', shopify_product_id: `gid://shopify/Product/${id}`, error: null, claimed_at: null });
  const patches = [];
  let shopify = 0;
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)), method = init.method || 'GET', body = init.body ? JSON.parse(init.body) : null;
    const ok = (b, status = 200) => new Response(JSON.stringify(b), { status });
    if (u.includes('myshopify.com')) { shopify++; return u.includes('down-store') ? ok({ errors: 'down' }, 503) : ok({ data: { productUpdate: { product: { status: 'DRAFT' }, userErrors: [] } } }); }
    if (u.includes('/rest/v1/pb_listings?unpublish_due=eq.true')) return ok(due.filter(l => !u.includes(`not.in.(${l.website_id}`)));
    if (u.includes('/rest/v1/pb_listings?id=eq.') && method === 'GET') return ok([listing(u.match(/id=eq\.(l\d)/)[1])]);
    if (u.includes('/rest/v1/pb_listings?id=eq.') && method === 'PATCH') {
      const id = u.match(/id=eq\.(l\d)/)[1];
      patches.push({ id, ...body });
      if (body.unpublish_due === false) due.splice(due.findIndex(l => l.id === id), 1); // off its store: no longer marked
      return ok([{ ...listing(id), ...body }]);
    }
    if (u.includes('/rest/v1/pb_websites?')) return ok([{ id: u.includes('w-ok') ? 'w-ok' : 'w-down', name: 'Store', shop_domain: u.includes('w-ok') ? 'ok-store.myshopify.com' : 'down-store.myshopify.com', auth_mode: 'token', api_version: '2025-10', active: true }]);
    if (u.includes('/rest/v1/pb_website_secrets')) return ok([{ website_id: 'w', access_token: 'shpat_test' }]);
    return ok([{}], method === 'POST' ? 201 : 200);
  };
  const n = await takeOffDue(10, () => true, 'u1');
  assert.equal(n, 1, 'only the listing of the store that answers is off');
  assert.ok(patches.some(p => p.id === 'l3' && p.unpublish_due === false && p.error === REVERTED));
  assert.ok(patches.some(p => p.id === 'l1' && typeof p.unpublish_tried_at === 'string'), 'the failed one is tried again later');
  assert.equal(patches.some(p => p.id === 'l2'), false, 'the second listing of the store that is down is not even tried');
  assert.ok(patches.some(p => p.id === 'l1' && p.status === 'published'), 'and it is put back as it was: it is still on the store');
  assert.ok(shopify >= 2);
});

test('a new send queues a taken-back listing that never reached the store, and only counts the ones hidden there', async () => {
  const P = 'cccccccc-2222-4333-8444-555555555555';
  const calls = world((m, u) => {
    if (m === 'HEAD' && u.startsWith('/rest/v1/pb_bulk_items')) return head(1);
    if (m === 'HEAD' && u.startsWith('/rest/v1/pb_listings')) return head(2); // hidden on the store by a revert
    if (m === 'GET' && u.startsWith('/rest/v1/pb_websites')) return [{ id: SITE, name: 'Arya Store', active: true, routing_default: 'all' }];
    if (m === 'GET' && u.startsWith('/rest/v1/pb_products')) return [{ id: P, status: 'ready', category: 'Saree', vendor_id: null, cost_price: 100, sizes: [], attributes: {} }];
    if (m === 'GET' && u.startsWith('/rest/v1/pb_listings')) return [{ id: 'l-back', product_id: P }];
    if (m === 'PATCH' && u.startsWith('/rest/v1/pb_listings?id=eq.l-back')) return [{ id: 'l-back' }];
    return undefined;
  });
  assert.deepEqual(await routeWebsite({ website_id: SITE }, 'u1'), { ok: true, queued: 1, matched: 1, more: false, hidden: 2 });
  const asked = calls.find(c => c.method === 'GET' && c.u.startsWith('/rest/v1/pb_listings'));
  assert.match(asked.u, /status=eq\.skipped&shopify_product_id=is\.null&error=in\.\(/, 'only listings that are not on Shopify are queued again');
  assert.ok(asked.u.includes(`"${REVERTED}"`));
  const back = calls.find(c => c.method === 'PATCH' && c.u.startsWith('/rest/v1/pb_listings?id=eq.l-back'));
  assert.equal(back.body.status, 'queued'); assert.equal(back.run, RUN);
  const hidden = calls.find(c => c.method === 'HEAD' && c.u.startsWith('/rest/v1/pb_listings'));
  assert.match(hidden.u, /status=eq\.skipped&shopify_product_id=not\.is\.null&error=eq\./);
});

