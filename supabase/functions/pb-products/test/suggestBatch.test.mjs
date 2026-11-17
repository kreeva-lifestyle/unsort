// node --test --experimental-strip-types supabase/functions/pb-products/test/
// "Select all" on the suggestions (owner, 2026-11-17: "select all should work for all tags"): every pending id under
// the chip (suggestions_ids), then answered 100 at a time as ONE bulk change (tagsSuggestAct.ts batches).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { RUN, closed, opened, recorded, row, uid, world } = await import('./bulkWorld.mjs');
const { suggestionAct } = await import('../tagsSuggestAct.ts');
const { suggestionsIds } = await import('../tagsQueue.ts');

const sug = (n, phrase) => ({ id: uid(n), phrase, key: phrase.toLowerCase(), attribute_id: null, status: 'pending', uses: 1, examples: [], source: 'store', first_seen_at: '', last_seen_at: '' });
const ignored = (ns) => ns.map(n => row('pb_tag_suggestions', { id: uid(n) }, { status: 'pending' }, { status: 'ignored' }));
const runRow = (over = {}) => ({ id: RUN, kind: 'suggestions', status: 'running', created_by: 'u1', ...over });
const runOf = (r) => (m, u) => (m === 'GET' && u.startsWith('/rest/v1/pb_bulk_runs?id=eq.') && u.includes('select=id,kind,status,created_by') ? (r ? [r] : []) : undefined);
const sugs = (list) => (m, u) => (m === 'GET' && u.startsWith('/rest/v1/pb_tag_suggestions?id=in.') ? list.filter(s => u.includes(s.id)) : undefined);
const runPatches = (calls) => calls.filter(c => c.method === 'PATCH' && c.u.startsWith('/rest/v1/pb_bulk_runs'));

test('suggestions_ids: every pending id under the chip, in the list order, paged past 1,000', async () => {
  const calls = world((m, u) => {
    if (m !== 'GET' || !u.startsWith('/rest/v1/pb_tag_suggestions?')) return undefined;
    const offset = Number(/offset=(\d+)/.exec(u)[1]);
    return Array.from({ length: offset === 0 ? 1000 : 3 }, (_, i) => ({ id: uid(offset + i + 1) }));
  });
  const r = await suggestionsIds({ attribute_id: uid(7) });
  assert.equal(r.ids.length, 1003); assert.equal(r.ids[1002], uid(1003));
  const reads = calls.filter(c => c.u.startsWith('/rest/v1/pb_tag_suggestions?'));
  assert.equal(reads.length, 2);
  assert.match(reads[0].u, /select=id&status=eq\.pending&attribute_id=eq\.aaaaaaaa-0000-4000-8000-000000000007&order=uses\.desc,last_seen_at\.desc,id\.asc&limit=1000&offset=0/);
  world(() => []);
  assert.match((await (async () => { const c = world(() => []); await suggestionsIds({ attribute_id: 'none' }); return c[0].u; })()), /attribute_id=is\.null/);
  const all = world(() => []); await suggestionsIds({}); assert.doesNotMatch(all[0].u, /attribute_id/);
});

test('batches: the first opens one bulk change and leaves it open, the next ones join it, the last closes it with the full count', async () => {
  const list = [sug(1, 'Georgette'), sug(2, 'Wine'), sug(3, 'Net'), sug(4, 'Rama'), sug(5, 'Kora')];
  // first batch: opened (labelled from what it has), not closed
  let calls = world(sugs(list));
  const a = await suggestionAct({ ids: [uid(1), uid(2)], act: 'ignore', more: true }, 'u1');
  assert.equal(a.run_id, RUN); assert.equal(a.done, 1); // the fake PATCH answers one row
  assert.equal(opened(calls).label, 'Ignored 2 suggestions (Georgette, Wine)');
  assert.equal(runPatches(calls).length, 0, 'left open for the next batch');
  assert.ok(calls.filter(c => c.method === 'PATCH' && c.u.startsWith('/rest/v1/pb_tag_suggestions')).every(c => c.run === RUN));

  // a middle batch joins it: nothing opened, nothing closed
  calls = world(runOf(runRow()), sugs(list));
  const b = await suggestionAct({ ids: [uid(3)], act: 'ignore', more: true, run_id: RUN }, 'u1');
  assert.equal(b.run_id, RUN); assert.equal(opened(calls), undefined); assert.equal(runPatches(calls).length, 0);
  assert.equal(calls.find(c => c.method === 'PATCH').run, RUN);

  // the last batch: relabelled with every suggestion the batches changed, then closed
  calls = world(runOf(runRow()), recorded({ kind: 'suggestions', rows: ignored([1, 2, 3, 4, 5]) }), sugs(list),
    (m, u) => (m === 'GET' && u.startsWith('/rest/v1/pb_tag_suggestions?id=in.') && u.includes('select=id,phrase') ? list.slice(0, 3) : undefined));
  const c = await suggestionAct({ ids: [uid(4), uid(5)], act: 'ignore', run_id: RUN }, 'u1');
  assert.equal(c.run_id, RUN);
  const [label, done] = runPatches(calls);
  assert.deepEqual(label.body, { label: 'Ignored 5 suggestions (Georgette, Wine, Net and 2 more)' });
  assert.match(label.u, /status=eq\.running/);
  assert.equal(done.body.status, 'done'); assert.equal(done.body.items, 5);
});

test('batches: all of one gone meanwhile is not an error; another person\'s or a closed change cannot be joined', async () => {
  let calls = world(runOf(runRow()), sugs([]));
  const r = await suggestionAct({ ids: [uid(8)], act: 'nearest', more: true, run_id: RUN }, 'u1');
  assert.deepEqual(r, { ok: true, done: 0, conflicts: {}, retagged: 0, skipped: 0, run_id: RUN });
  assert.equal(calls.filter(c => c.method === 'PATCH').length, 0);

  for (const bad of [runRow({ created_by: 'u2' }), runRow({ status: 'done' }), runRow({ kind: 'retag' }), null]) {
    calls = world(runOf(bad), sugs([sug(1, 'Georgette')]));
    await assert.rejects(() => suggestionAct({ ids: [uid(1)], act: 'ignore', more: true, run_id: RUN }, 'u1'), /closed before the rest could join/);
    assert.equal(calls.filter(c => c.method === 'PATCH').length, 0, 'nothing changed');
  }
  // without a batch, nothing there is still "gone"
  world(sugs([]));
  await assert.rejects(() => suggestionAct({ ids: [uid(1)], act: 'ignore' }, 'u1'), /gone/);
});

test('batches: a batch that fails closes the change there, so what the earlier ones did can be taken back', async () => {
  const calls = world(runOf(runRow()), recorded({ kind: 'suggestions', rows: ignored([1, 2, 3]) }), sugs([sug(4, 'Rama'), sug(5, 'Kora')]),
    (m, u) => (m === 'PATCH' && u.startsWith('/rest/v1/pb_tag_suggestions') ? new Response('{"message":"boom"}', { status: 500 }) : undefined));
  await assert.rejects(() => suggestionAct({ ids: [uid(4), uid(5)], act: 'ignore', more: true, run_id: RUN }, 'u1'));
  assert.equal(closed(calls).status, 'done'); assert.equal(closed(calls).items, 3);
});
