// node --test --experimental-strip-types supabase/functions/pb-products/test/
// Categories: rename, and move a category's products (owner, 13 Nov 2026: "If deleted than it has to be moved to correct
// category and let ai decide which product type is it for that category", "unable to rename the category"). The server
// part (categoryMove.ts) and its own revert (categoryRevert.ts) against a fake database: what is called, in what order,
// and what a revert files back. The database functions themselves: t_dups.sql part 11.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { categoryMove, categoryRename } = await import('../categoryMove.ts');
const { previewCategory, revertCategory } = await import('../categoryRevert.ts');

/** A fake database: `on` answers by path prefix; every call is kept as [method, path, body, run header]. */
function world(on = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = decodeURIComponent(String(url)).replace('https://sb.example/rest/v1/', '');
    const method = init.method || 'GET';
    const run = Object.entries(init.headers || {}).find(([k]) => k.toLowerCase() === 'x-pb-bulk')?.[1] ?? null;
    calls.push([method, path, init.body ? JSON.parse(init.body) : null, run]);
    const ok = (b, status = 200) => new Response(JSON.stringify(b), { status });
    for (const [prefix, answer] of Object.entries(on)) if (path.startsWith(prefix)) return ok(typeof answer === 'function' ? answer(path, init) : answer);
    if (method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '0-0/2' } });
    if (path.startsWith('rpc/pb_bulk_products')) return ok(2);
    if (path.startsWith('pb_bulk_runs?id=') && method === 'GET') return ok([{ kind: 'category_move' }]);
    if (method === 'POST') return ok([{ id: 'run1' }], 201);
    if (method === 'PATCH') return ok([{ id: 'x' }]);
    return ok([]);
  };
  return calls;
}
const rpcs = (calls) => calls.filter(([m, p]) => m === 'POST' && p.startsWith('rpc/')).map(([, p, b, run]) => [p.slice(4), b, run]);

test('rename: one database call inside a bulk change named after both names', async () => {
  const calls = world({ 'rpc/pb_category_rename': 3 });
  const r = await categoryRename({ from: ' Anarkali ', to: 'Anarkali  Suit' }, 'u1');
  assert.deepEqual(r, { ok: true, renamed: 3, run_id: 'run1' });
  assert.deepEqual(rpcs(calls).find(([f]) => f === 'pb_category_rename'), ['pb_category_rename', { p_from: 'Anarkali', p_to: 'Anarkali Suit' }, 'run1']);
  assert.equal(calls.find(([m, p]) => m === 'POST' && p.startsWith('pb_bulk_runs'))[2][0].label, 'Renamed the category Anarkali to Anarkali Suit');
  assert.deepEqual(calls.find(([m, p]) => m === 'PATCH' && p.startsWith('pb_bulk_runs'))[2].details, { from: 'Anarkali', to: 'Anarkali Suit', unit: 'products' }); // what the revert needs
});

test('move: the products go, the old name leaves the list, and the AI is asked only for those missing a tag', async () => {
  const [p1, p2, p3] = [1, 2, 3].map(n => `a0000000-0000-4000-8000-00000000000${n}`);
  const moved = [
    { id: p1, status: 'needs_info', was: 'needs_info', missing: ['Product Type'] }, // Salwar Suit needs one: AI
    { id: p2, status: 'ready', was: 'needs_info', missing: [] },                     // complete there: Ready
    { id: p3, status: 'needs_info', was: 'needs_info', missing: ['Category'] },     // not for the AI
  ];
  const calls = world({ 'rpc/pb_category_move': moved, 'pb_settings?key=eq.categories': [{ value: ['Saree', 'Anarkali', 'Salwar Suit'] }], 'rpc/pb_categories_prune': 0,
    'pb_products?status=in.(ready,needs_info)&tag_fill_run': (p) => (p.includes(`id=in.(${p1})`) ? [{ id: p1 }] : []) });
  const r = await categoryMove({ from: 'Anarkali', to: 'Salwar Suit', remove: true }, 'u1');
  assert.deepEqual({ moved: r.moved, to_ready: r.to_ready, queued: r.queued, removed: r.removed }, { moved: 3, to_ready: 1, queued: 1, removed: true });
  const order = rpcs(calls).map(([f]) => f);
  assert.ok(order.indexOf('pb_category_move') < order.indexOf('pb_categories_prune'), 'moved first, then taken off the list');
  assert.deepEqual(calls.find(([m, p]) => m === 'POST' && p.startsWith('pb_settings'))[2], [{ key: 'categories', value: ['Saree', 'Salwar Suit'] }]);
  const fill = calls.find(([m, p]) => m === 'PATCH' && p.includes('tag_fill_run=is.null'));
  assert.ok(fill[1].includes(`id=in.(${p1})`) && !fill[1].includes(p3) && !fill[1].includes(p2), 'only p1 is queued for the AI');
});

test('move: refused onto the same category; nothing is called', async () => {
  const calls = world();
  await assert.rejects(categoryMove({ from: 'Saree', to: ' saree ' }, 'u1'), /another category/);
  assert.equal(calls.length, 0);
});

const RUN = (o = {}) => ({ id: 'r1', kind: 'category_move', label: 'Moved the products of Anarkali to Salwar Suit', status: 'done', website_id: null, created_at: new Date().toISOString(), details: { from: 'Anarkali', to: 'Salwar Suit' }, ...o });
const ITEMS = [
  { pk: { id: 'p1' }, before: { category: 'Anarkali', status: 'needs_info' }, after: { category: 'Salwar Suit', status: 'needs_info' } },
  { pk: { id: 'p1' }, before: { category: 'Salwar Suit', status: 'needs_info' }, after: { category: 'Salwar Suit', status: 'ready' } }, // the check after the move
  { pk: { id: 'p2' }, before: { category: 'Anarkali' }, after: { category: 'Salwar Suit' } },
  { pk: { id: 'p3' }, before: { category: 'Anarkali' }, after: { category: 'Salwar Suit' } },
  { pk: { id: 'p4' }, before: { category: 'Anarkali' }, after: { category: 'Salwar Suit' } },
];
const NOW = [
  { id: 'p1', category: 'Salwar Suit', locked: [] },
  { id: 'p2', category: 'Saree', locked: [] },                // moved again since: stays
  { id: 'p3', category: 'Salwar Suit', locked: ['category'] }, // a person fixed its category: stays
];                                                            // p4: deleted since

test('a move\'s revert, previewed: what goes back, what stays, what is gone', async () => {
  world({ 'pb_bulk_items?': ITEMS, 'pb_products?id=in.': NOW });
  assert.deepEqual(await previewCategory(RUN()), { restored: 1, changed: 2, gone: 1 });
});

test('a move\'s revert: each product still in Salwar Suit goes back to Anarkali, only where it still is; checked and retagged', async () => {
  const calls = world({ 'pb_bulk_items?': ITEMS, 'pb_products?id=in.': (p, init) => (init.method === 'PATCH' ? [{ id: 'p1' }] : NOW), 'pb_products?status=in.(ready,needs_info)': [] });
  const r = await revertCategory(RUN(), 'u1');
  assert.deepEqual(r, { restored: 1, changed: 2, gone: 1 });
  const back = calls.find(([m, p]) => m === 'PATCH' && p.startsWith('pb_products?id=in.'));
  assert.deepEqual([back[1], back[2]], ['pb_products?id=in.(p1)&category=eq.Salwar Suit&select=id', { category: 'Anarkali' }]);
  const order = rpcs(calls).map(([f]) => f);
  assert.deepEqual(order.filter(f => ['pb_products_refresh', 'pb_bulk_mark_done', 'pb_bulk_close'].includes(f)), ['pb_products_refresh', 'pb_bulk_mark_done', 'pb_bulk_close']);
  assert.deepEqual(rpcs(calls).find(([f]) => f === 'pb_bulk_mark_done')[1].p_ids, ['p1', 'p2', 'p3', 'p4']);
});

test('a rename\'s revert renames it back; refused like every revert when taken back already or too old', async () => {
  let calls = world({ 'rpc/pb_category_rename': 2 });
  assert.deepEqual(await revertCategory(RUN({ kind: 'category_rename', details: { from: 'Anarkali', to: 'Anarkali Suit' } }), 'u1'), { renamed: 1, products: 2 });
  assert.deepEqual(rpcs(calls).find(([f]) => f === 'pb_category_rename')[1], { p_from: 'Anarkali Suit', p_to: 'Anarkali' });
  calls = world();
  await assert.rejects(revertCategory(RUN({ status: 'reverted' }), 'u1'), /already reverted/);
  await assert.rejects(previewCategory(RUN({ created_at: new Date(Date.now() - 8 * 86_400_000).toISOString() })), /more than 7 days/);
  assert.equal(calls.length, 0);
});
