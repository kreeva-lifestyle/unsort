// node --test --experimental-strip-types supabase/functions/pb-products/test/
// "Archive the copies" (copies.ts; pre-launch fix D18): the held copies archived in one go, as a bulk change that the
// log keeps and can take back. What is archived and what is left is decided in the database (pb_copies_archive) and
// checked there: supabase/tests/sql/t_dups.sql part 6. Here: that the server asks it the right way. (Looking first is
// a plain database read the app makes itself, with apply = false.)
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { copiesArchive } = await import('../copies.ts');

const RUN = '11111111-2222-4333-8444-555555555555';
/** A fake database: `answer` is what pb_copies_archive returns (a Response to fail), `items` how many rows the run recorded. */
function world(answer, items = 0) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)).replace('https://sb.example', ''), method = init.method || 'GET';
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    calls.push({ method, u, body: init.body ? JSON.parse(init.body) : null, run: headers['x-pb-bulk'] ?? null });
    if (u.startsWith('/rest/v1/rpc/pb_copies_archive')) return answer instanceof Response ? answer : new Response(JSON.stringify(answer), { status: 200 });
    if (method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': `0-0/${items}` } });
    if (method === 'DELETE') return new Response(null, { status: 204 });
    if (u.startsWith('/rest/v1/pb_bulk_runs') && method === 'POST') return new Response(JSON.stringify([{ id: RUN }]), { status: 201 });
    return new Response(JSON.stringify([{}]), { status: method === 'POST' ? 201 : 200 });
  };
  return calls;
}

test('archiving is a bulk change: opened, marked on the database call, closed with its counts', async () => {
  const calls = world({ archived: 9, priced: 2, on_site: 1 }, 9);
  assert.deepEqual(await copiesArchive('u1'), { ok: true, archived: 9, priced: 2, on_site: 1, run_id: RUN });
  assert.deepEqual(calls[0].body, [{ kind: 'copies', label: 'Archived the products waiting as copies', website_id: null, created_by: 'u1', status: 'running' }]);
  const rpc = calls.find(c => c.u.startsWith('/rest/v1/rpc/pb_copies_archive'));
  assert.deepEqual(rpc.body, { p_apply: true, p_user: 'u1' });
  assert.equal(rpc.run, RUN, 'so the database records every product it archives, in the same transaction');
  const done = calls.find(c => c.method === 'PATCH' && c.u.startsWith('/rest/v1/pb_bulk_runs'));
  assert.equal(done.body.status, 'done'); assert.equal(done.body.items, 9);
  assert.deepEqual(done.body.details, { archived: 9, priced: 2, on_site: 1 });
  const log = calls.find(c => c.method === 'POST' && c.u.startsWith('/rest/v1/pb_activity'));
  assert.deepEqual(log.body[0].details, { archived: 9, priced: 2, on_site: 1, run_id: RUN });
});

test('nothing to archive: the change leaves the log again and no id is handed out', async () => {
  const calls = world({ archived: 0, priced: 3, on_site: 0 }, 0);
  assert.deepEqual(await copiesArchive('u1'), { ok: true, archived: 0, priced: 3, on_site: 0, run_id: null });
  assert.ok(calls.some(c => c.method === 'DELETE' && /pb_bulk_runs\?id=eq\.11111111.*status=eq\.running/.test(c.u)));
  assert.ok(!calls.some(c => c.u.startsWith('/rest/v1/pb_activity')));
});

test('a refusal by the database is passed on, and the opened change is closed', async () => {
  const calls = world(new Response(JSON.stringify({ code: 'P0001', message: 'Only the server can do this.' }), { status: 400 }), 0);
  await assert.rejects(copiesArchive('u1'), /Only the server can do this/);
  assert.ok(calls.some(c => c.method === 'DELETE' && c.u.startsWith('/rest/v1/pb_bulk_runs')), 'not left "running"');
});
