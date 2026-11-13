// node --test --experimental-strip-types supabase/functions/pb-products/test/
// Bulk-change log, part 2, over a fake database (bulkWorld.mjs): a vendor's stock notice that marks two or more
// products is one bulk change (the stock writes carry it, the notice's own row does not); its revert names the note
// its listings carry; and a website is not moved to another store while products of it are on the old one. What the
// database puts back is tried on PostgreSQL: supabase/tests/sql/t_stock.sql.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { RUN, closed, dropped, head, revertDb, opened, recorded, rpcCall, uid, world } = await import('./bulkWorld.mjs');
const { stockNotice } = await import('../stockNotice.ts');
const { bulkPreview, bulkRevert } = await import('../bulkRevert.ts');
const { PERM_NOTE } = await import('../stockSend.ts');
const { saveCredentials } = await import('../siteActions.ts');

const NOTICE = { id: uid(50), vendor_id: uid(60), source: 'telegram', status: 'reading', ai_read_at: null, locked: [], created_at: '2026-11-10T20:00:00Z', source_posted_at: '2026-11-10T15:00:00Z' };
const cands = [uid(1), uid(2)].map(id => ({ id, name: null, sku: 'D no 5081', in_stock: true, status: 'ready', code_key: '#5081', colour_keys: ['pink'], same_vendor: true, notice_key: '#5081' }));
const notice = (kind) => stockNotice(NOTICE, { kind, items: [{ code: '5081', colours: [], note: '' }] }, null, { model: 'm', usd: 0.001 }, null);
const noticeDb = (products) => [recorded({ kind: 'stock_notice', products }), (m, u) => {
  if (u === '/rest/v1/rpc/pb_stock_candidates') return cands;
  if (u === '/rest/v1/rpc/pb_stock_save') return 1;
  if (m === 'PATCH' && u.startsWith(`/rest/v1/pb_products?id=eq.${NOTICE.id}`)) return [{ ...NOTICE, status: 'archived' }];
  return undefined;
}];

test('a stock notice that marks two products: one bulk change; the stock writes carry it, the notice\'s own row does not', async () => {
  const calls = world(...noticeDb(2));
  assert.equal((await notice('unknown')).status, 'archived');
  assert.equal(opened(calls).kind, 'stock_notice'); assert.equal(opened(calls).label, 'Stock notice: 5081');
  const saves = calls.filter(c => c.u === '/rest/v1/rpc/pb_stock_save');
  assert.equal(saves.length, 2); assert.ok(saves.every(c => c.run === RUN));
  assert.equal(calls.find(c => c.method === 'PATCH' && c.u.startsWith(`/rest/v1/pb_products?id=eq.${NOTICE.id}`)).run, null);
  assert.deepEqual(closed(calls).details, { notice: 'unknown', notice_id: NOTICE.id, codes: 1, marked: 2, left: 0, unit: 'products' });
});

test('a permanent notice: setting the listings aside and archiving the product are part of the change too', async () => {
  const calls = world(...noticeDb(2));
  await notice('permanent');
  assert.equal(opened(calls).label, 'Stock notice (permanent): 5081');
  const aside = calls.filter(c => c.method === 'PATCH' && c.u.startsWith('/rest/v1/pb_listings'));
  assert.equal(aside.length, 2); assert.ok(aside.every(c => c.run === RUN && c.body.error === PERM_NOTE));
  const archived = calls.filter(c => c.method === 'PATCH' && c.u.includes('perm_out_at=not.is.null') && c.body.status === 'archived');
  assert.equal(archived.length, 2); assert.ok(archived.every(c => c.run === RUN));
});

test('a notice that marks one product leaves the log; a failure half-way still closes the change before it is reported', async () => {
  let calls = world(...noticeDb(1));
  await notice('unknown');
  assert.ok(dropped(calls));
  calls = world((m, u) => (u === '/rest/v1/rpc/pb_stock_save' ? new Response(JSON.stringify({ message: 'down' }), { status: 500 }) : undefined), ...noticeDb(2));
  await assert.rejects(() => notice('unknown'));
  assert.ok(closed(calls) || dropped(calls), 'closed, not left running');
});


test('taking back a stock notice: the preview and the revert both name the note its listings carry', async () => {
  let calls = world(revertDb('stock_notice', { restored: 2, changed: 1, gone: 0, back: 1 }));
  assert.deepEqual(await bulkPreview({ run_id: RUN }), { ok: true, kind: 'stock_notice', restored: 2, changed: 1, gone: 0, back: 1 });
  assert.equal(rpcCall(calls, 'pb_bulk_revert').body.p_note, PERM_NOTE);
  calls = world(revertDb('stock_notice', { restored: 2, changed: 1, gone: 0, back: 1 }));
  await bulkRevert({ run_id: RUN }, 'u1');
  assert.deepEqual(rpcCall(calls, 'pb_bulk_revert').body, { p_run: RUN, p_apply: true, p_user: 'u1', p_note: PERM_NOTE });
});

const SITE = { id: uid(70), name: 'Kreeva', shop_domain: 'old-store.myshopify.com', auth_mode: 'token', api_version: '2026-10', active: true, publish_mode: 'live', routing_default: 'all', track_inventory: false, pricing: {}, tag_rules: {}, content: {}, connected_at: null, shop_name: null, last_error: null };
const move = { website_id: SITE.id, auth_mode: 'token', access_token: 'shpat_new', shop_domain: 'new-store.myshopify.com' };

test('a website is not moved to another store while products of it are on the old one', async () => {
  let calls = world((m, u) => (m === 'GET' && u.startsWith('/rest/v1/pb_websites?id=eq.') ? [SITE] : m === 'HEAD' && u.startsWith('/rest/v1/pb_listings') ? head(3) : undefined));
  await assert.rejects(() => saveCredentials(move, 'u1'), (e) => e.status === 409 && /3 products of this website are on old-store\.myshopify\.com/.test(e.message) && /new website/.test(e.message));
  const asked = calls.find(c => c.method === 'HEAD' && c.u.startsWith('/rest/v1/pb_listings'));
  assert.match(asked.u, /website_id=eq\.aaaaaaaa.*shopify_product_id=not\.is\.null.*shopify_status\.not\.in\.\(DRAFT,ARCHIVED\)/);
  assert.ok(!calls.some(c => c.method === 'PATCH'), 'nothing was changed');
  calls = world((m, u) => (m === 'GET' && u.startsWith('/rest/v1/pb_websites?id=eq.') ? [SITE] : m === 'HEAD' && u.startsWith('/rest/v1/pb_listings') ? head(1) : undefined));
  await assert.rejects(() => saveCredentials(move, 'u1'), /^Error: 1 product of this website is on old-store/);
  // none on the old store (never sent, or all taken off): the move goes ahead as before
  calls = world((m, u) => (m === 'GET' && u.startsWith('/rest/v1/pb_websites?id=eq.') ? [SITE] : undefined));
  await saveCredentials(move, 'u1').catch(() => null); // the connection test of the made-up store fails afterwards
  assert.equal(calls.find(c => c.method === 'PATCH' && c.u.startsWith('/rest/v1/pb_websites')).body.shop_domain, 'new-store.myshopify.com');
  // the same store, new credentials: never asked
  calls = world((m, u) => (m === 'GET' && u.startsWith('/rest/v1/pb_websites?id=eq.') ? [SITE] : undefined));
  await saveCredentials({ ...move, shop_domain: 'OLD-store.myshopify.com' }, 'u1').catch(() => null);
  assert.ok(!calls.some(c => c.method === 'HEAD' && c.u.startsWith('/rest/v1/pb_listings')));
});
