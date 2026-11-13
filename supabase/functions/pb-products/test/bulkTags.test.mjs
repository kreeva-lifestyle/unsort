// node --test --experimental-strip-types supabase/functions/pb-products/test/
// Bulk-change log, part 2 (20261113090000_pb_bulk_log_tags_stock.sql): the changes that reach products through the
// tag lists are bulk changes that Settings → Bulk changes takes back (stock notices and the store move:
// bulkStock.test.mjs). Here, over a fake database (bulkWorld.mjs): which of them count as bulk (bulkLog.ts endRun),
// which database calls carry the change (the x-pb-bulk header the recording trigger reads), and what a revert adds to
// the database's counts (the list counts). What the database puts back is tried on PostgreSQL:
// supabase/tests/sql/t_tags.sql.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { RUN, closed, dropped, head, revertDb, link, opened, recorded, row, rpcCall, uid, world } = await import('./bulkWorld.mjs');
const { endRun } = await import('../bulkLog.ts');
const { attributeDelete, categoriesSave, categoryLinkSave, valueDelete, valueMerge } = await import('../tagsBulk.ts');
const { suggestionAct } = await import('../tagsQueue.ts');
const { bulkPreview } = await import('../bulkRevert.ts');

test('what counts as bulk: two or more products, or two entries out of the lists, or two suggestions — else it leaves the log', async () => {
  let calls = world(recorded({ kind: 'value_delete', products: 12 }));
  assert.equal(await endRun(RUN), 12);
  assert.equal(closed(calls).items, 12); assert.deepEqual(closed(calls).details, { unit: 'products' });

  // an attribute that only one product used, deleted with its three values: four entries out of the lists
  const gone = [row('pb_attributes', { id: 'a1' }, { id: 'a1', name: 'Work' }, null),
    ...['v1', 'v2', 'v3'].map(v => row('pb_attribute_values', { id: v }, { id: v, attribute_id: 'a1' }, null))];
  calls = world(recorded({ kind: 'attribute_delete', products: 1, rows: gone }));
  assert.equal(await endRun(RUN, { regated: 1 }), 4);
  assert.deepEqual(closed(calls).details, { regated: 1, unit: 'entries' });

  // a category's two links saved again as they were (deleted and written back): no change at all
  const same = ['a1', 'a2'].flatMap((a, i) => [row('pb_category_attributes', { category: 'Lehenga', attribute_id: a }, link(a, i + 1), null),
    row('pb_category_attributes', { category: 'Lehenga', attribute_id: a }, null, link(a, i + 1))]);
  calls = world(recorded({ kind: 'category_links', rows: same }));
  assert.equal(await endRun(RUN), 0);
  assert.ok(dropped(calls));

  const ignored = ['s1', 's2', 's3'].map(s => row('pb_tag_suggestions', { id: s }, { status: 'pending' }, { status: 'ignored' }));
  calls = world(recorded({ kind: 'suggestions', rows: ignored }));
  assert.equal(await endRun(RUN), 3);
  assert.equal(closed(calls).details.unit, 'suggestions');

  for (const kind of ['stock_notice', 'retag', 'tag_fill', 'value_merge']) { // one product reached, nothing else: an edit
    calls = world(recorded({ kind, products: 1, rows: kind === 'value_merge' ? [gone[1]] : [] }));
    assert.equal(await endRun(RUN), 0, kind);
    assert.ok(dropped(calls), kind);
  }
  calls = world(recorded({ kind: 'import', products: 0, rows: [{}, {}, {}] })); // the other kinds count their rows, as before
  assert.equal(await endRun(RUN), 3);
  assert.ok(!calls.some(c => c.u === '/rest/v1/rpc/pb_bulk_products'));
});

test('deleting a tag value: one bulk change named after it; the database call carries it; the answer says where it is', async () => {
  const calls = world(recorded({ kind: 'value_delete', products: 3 }), (m, u) => {
    if (m === 'GET' && u.startsWith('/rest/v1/pb_attribute_values?id=eq.')) return [{ name: 'Silk', pb_attributes: { name: 'Fabric' } }];
    if (u === '/rest/v1/rpc/pb_value_delete') return 3;
    return undefined;
  });
  assert.deepEqual(await valueDelete({ id: uid(1) }, 'u1'), { ok: true, regated: 3, run_id: RUN });
  assert.deepEqual({ ...opened(calls) }, { kind: 'value_delete', label: 'Deleted the tag value Silk (Fabric)', website_id: null, created_by: 'u1', status: 'running' });
  assert.equal(rpcCall(calls, 'pb_value_delete').run, RUN);
  assert.ok(calls.indexOf(rpcCall(calls, 'pb_value_delete')) > calls.findIndex(c => c.method === 'POST' && c.u.startsWith('/rest/v1/pb_bulk_runs')), 'opened before the change');
  const log = calls.find(c => c.u.startsWith('/rest/v1/pb_activity')).body[0];
  assert.equal(log.details.run_id, RUN);
});

test('a value used by one product is an ordinary edit: deleted, and not listed', async () => {
  const calls = world(recorded({ kind: 'value_delete', products: 1 }), (m, u) => (m === 'GET' && u.startsWith('/rest/v1/pb_attribute_values?id=eq.') ? [{ name: 'Silk', pb_attributes: null }] : u === '/rest/v1/rpc/pb_value_delete' ? 1 : undefined));
  assert.deepEqual(await valueDelete({ id: uid(1) }, null), { ok: true, regated: 1, run_id: null });
  assert.equal(opened(calls).label, 'Deleted the tag value Silk');
  assert.ok(dropped(calls));
});

test('a value or an attribute that is gone already: refused before anything is opened', async () => {
  let calls = world();
  await assert.rejects(() => valueDelete({ id: uid(1) }, null), /no longer exists/);
  await assert.rejects(() => valueMerge({ from: uid(1), into: uid(2) }, null), /no longer exists/);
  await assert.rejects(() => attributeDelete({ id: uid(3) }, null), /no longer exists/);
  assert.equal(opened(calls), undefined);
  calls = world(recorded({ kind: 'value_merge', products: 2 }), (m, u) => {
    if (m === 'GET' && u.includes(`pb_attribute_values?id=eq.${uid(1)}`)) return [{ name: 'Rani Pink', pb_attributes: { name: 'Colour' } }];
    if (m === 'GET' && u.includes(`pb_attribute_values?id=eq.${uid(2)}`)) return [{ name: 'Pink', pb_attributes: { name: 'Colour' } }];
    if (u === '/rest/v1/rpc/pb_value_merge') return 2;
    return undefined;
  });
  assert.deepEqual(await valueMerge({ from: uid(1), into: uid(2) }, null), { ok: true, moved: 2, run_id: RUN });
  assert.equal(opened(calls).label, 'Merged Rani Pink into Pink (Colour)');
  assert.deepEqual(rpcCall(calls, 'pb_value_merge').body, { p_from: uid(1), p_into: uid(2) });
  assert.equal(rpcCall(calls, 'pb_value_merge').run, RUN);
});

test('deleting an attribute: the duplicate suggestions it removes first are part of the same change', async () => {
  const calls = world(recorded({ kind: 'attribute_delete', products: 5 }), (m, u) => {
    if (m === 'GET' && u.startsWith('/rest/v1/pb_attributes?id=eq.')) return [{ name: 'Fabric' }];
    if (m === 'GET' && u.startsWith('/rest/v1/pb_tag_suggestions?attribute_id=eq.')) return [{ id: uid(7), key: 'georgette' }, { id: uid(8), key: 'net' }];
    if (m === 'GET' && u.startsWith('/rest/v1/pb_tag_suggestions?attribute_id=is.null')) return [{ key: 'georgette' }];
    if (u === '/rest/v1/rpc/pb_attribute_delete') return 5;
    return undefined;
  });
  assert.deepEqual(await attributeDelete({ id: uid(3) }, 'u1'), { ok: true, regated: 5, run_id: RUN });
  assert.equal(opened(calls).label, 'Deleted the attribute Fabric');
  const twin = calls.find(c => c.method === 'DELETE' && c.u.startsWith('/rest/v1/pb_tag_suggestions'));
  assert.match(twin.u, new RegExp(`id=in\\.\\(${uid(7)}\\)`)); assert.equal(twin.run, RUN);
  assert.equal(rpcCall(calls, 'pb_attribute_delete').run, RUN);
});

test('the category list and a category\'s must-have tags: named by what changed, both writes carry the change', async () => {
  let calls = world(recorded({ kind: 'categories', products: 4 }), (m, u) => {
    if (m === 'GET' && u.startsWith('/rest/v1/pb_settings?key=eq.categories')) return [{ value: ['Lehenga', 'Saree', 'Gown'] }];
    if (u === '/rest/v1/rpc/pb_categories_prune') return 4;
    return undefined;
  });
  const r = await categoriesSave({ categories: ['lehenga', 'Kurti'] }, 'u1');
  assert.deepEqual(r, { ok: true, categories: ['Lehenga', 'Kurti'], regated: 4, run_id: RUN });
  assert.equal(opened(calls).label, 'Category list: removed Saree, Gown; added Kurti');
  const saved = calls.find(c => c.method === 'POST' && c.u.startsWith('/rest/v1/pb_settings'));
  assert.equal(saved.run, RUN);
  // pb_settings has no id column: asking for one made the database refuse every save (13 Nov 2026, "unable to remove categories")
  assert.match(saved.u, /[?&]select=key(&|$)/); assert.doesNotMatch(saved.u, /select=id/);
  assert.equal(rpcCall(calls, 'pb_categories_prune').run, RUN);

  calls = world(recorded({ kind: 'category_links', products: 9 }), (m, u) => {
    if (m === 'GET' && u.startsWith('/rest/v1/pb_attributes?id=in.')) return [{ id: uid(2), name: 'Fabric' }, { id: uid(1), name: 'Colour' }];
    if (u === '/rest/v1/rpc/pb_category_links_set') return [{ to_needs_info: 9, to_ready: 0 }];
    return undefined;
  });
  assert.deepEqual(await categoryLinkSave({ category: 'Lehenga', attribute_ids: [uid(1), uid(2)] }, null), { ok: true, to_needs_info: 9, to_ready: 0, run_id: RUN });
  assert.equal(opened(calls).label, 'Changed the tags Lehenga needs: Colour, Fabric'); // in the order chosen
  assert.equal(rpcCall(calls, 'pb_category_links_set').run, RUN);
});

test('saving the category list checks again every product left off it, also where the category had no must-have tags (13 Nov 2026)', async () => {
  const calls = world(recorded({ kind: 'categories', products: 3 }), (m, u) => {
    if (m === 'GET' && u.startsWith('/rest/v1/pb_settings?key=eq.categories')) return [{ value: ['Anarkali', 'Gown', 'Indo-Western'] }];
    if (m === 'GET' && u.startsWith('/rest/v1/pb_category_attributes?')) return [{ category: 'Anarkali' }, { category: 'Gown' }];
    if (u === '/rest/v1/rpc/pb_categories_prune') return 1;
    if (m === 'GET' && u.startsWith('/rest/v1/pb_products?')) return [{ id: uid(1), category: 'Anarkali' }, { id: uid(2), category: 'Gown' }, { id: uid(3), category: 'Indo-Western' }, { id: uid(4), category: 'indo-western' }];
    if (u === '/rest/v1/rpc/pb_products_refresh') return [];
    return undefined;
  });
  const r = await categoriesSave({ categories: ['Anarkali'] }, 'u1');
  const refresh = calls.filter(c => c.u === '/rest/v1/rpc/pb_products_refresh');
  assert.deepEqual(refresh.map(c => c.body.p_ids), [[uid(3), uid(4)]]); // Gown had must-have tags: the prune checked its product
  assert.ok(refresh.every(c => c.run === RUN)); // part of the change, so a revert puts them back
  assert.equal(r.regated, 3);
});

test('suggestions: one is an edit (no change opened); two or more at once are one bulk change', async () => {
  const sug = (n, phrase) => ({ id: uid(n), phrase, key: phrase.toLowerCase(), attribute_id: null, status: 'pending', uses: 1, examples: [], source: 'store', first_seen_at: '', last_seen_at: '' });
  let calls = world((m, u) => (m === 'GET' && u.startsWith('/rest/v1/pb_tag_suggestions?id=in.') ? [sug(1, 'Georgette')] : undefined));
  // The body as the app sends it: `action` names the request, `act` the choice. With the choice in `action` the
  // app's request helper used to overwrite the request's name, so every suggestion button got "Unknown action".
  assert.deepEqual(await suggestionAct({ action: 'suggestion_act', ids: [uid(1)], act: 'ignore' }, null), { ok: true, done: 1, conflicts: {}, retagged: 0, run_id: null });
  await assert.rejects(() => suggestionAct({ ids: [uid(1)], action: 'ignore' }, null), /Unknown suggestion action/);
  assert.equal(opened(calls), undefined);
  assert.ok(calls.filter(c => c.method === 'PATCH').every(c => c.run === null));

  calls = world(recorded({ kind: 'suggestions', rows: [row('pb_tag_suggestions', { id: uid(1) }, { status: 'pending' }, { status: 'ignored' }), row('pb_tag_suggestions', { id: uid(2) }, { status: 'pending' }, { status: 'ignored' })] }),
    (m, u) => (m === 'GET' && u.startsWith('/rest/v1/pb_tag_suggestions?id=in.') ? [sug(1, 'Georgette'), sug(2, 'Wine')] : m === 'PATCH' ? [{ id: uid(1) }, { id: uid(2) }] : undefined));
  const r = await suggestionAct({ ids: [uid(1), uid(2)], act: 'ignore' }, 'u1');
  assert.equal(r.done, 2); assert.equal(r.run_id, RUN);
  assert.equal(opened(calls).label, 'Ignored 2 suggestions (Georgette, Wine)');
  assert.equal(calls.find(c => c.method === 'PATCH' && c.u.startsWith('/rest/v1/pb_tag_suggestions')).run, RUN);
  await assert.rejects(() => suggestionAct({ ids: [uid(1), uid(2)], act: 'shred' }, null), /Unknown suggestion action/);
  const sugs4 = [sug(1, 'Georgette'), sug(2, 'Wine'), sug(3, 'Net'), sug(4, 'Rama')];
  calls = world((m, u) => (m === 'GET' && u.startsWith('/rest/v1/pb_tag_suggestions?id=in.') ? sugs4 : m === 'GET' && u.startsWith('/rest/v1/pb_attribute_values?id=eq.') ? [{ name: 'Pink' }]
    : m === 'GET' && u.startsWith('/rest/v1/pb_attributes?id=eq.') ? [{ name: 'Fabric' }] : undefined));
  await suggestionAct({ ids: sugs4.map(x => x.id), act: 'move', attribute_id: uid(9) }, null).catch(() => null);
  assert.equal(opened(calls).label, 'Moved 4 suggestions (Georgette, Wine, Net and 1 more) to Fabric');
  calls = world((m, u) => (m === 'GET' && u.startsWith('/rest/v1/pb_tag_suggestions?id=in.') ? sugs4 : m === 'GET' && u.startsWith('/rest/v1/pb_attribute_values?id=eq.') ? [{ name: 'Pink' }] : undefined));
  await suggestionAct({ ids: sugs4.map(x => x.id), act: 'alias', value_id: uid(8) }, null).catch(() => null);
  assert.equal(opened(calls).label, 'Made 4 suggestions (Georgette, Wine, Net and 1 more) also known as Pink');
});


test('taking back a tag change also says what goes back in the lists: links, the category list, suggestions that were there', async () => {
  const items = [
    row('pb_category_attributes', { category: 'Lehenga', attribute_id: 'a1' }, link('a1', 1), link('a1', 2)), // moved
    row('pb_category_attributes', { category: 'Lehenga', attribute_id: 'a2' }, link('a2', 2), null), // removed
    row('pb_category_attributes', { category: 'Lehenga', attribute_id: 'a3' }, link('a3', 3), null), row('pb_category_attributes', { category: 'Lehenga', attribute_id: 'a3' }, null, link('a3', 3)), // as it was
    row('pb_tag_suggestions', { id: 's1' }, { status: 'pending' }, { status: 'added' }),
    row('pb_tag_suggestions', { id: 's2' }, null, { status: 'pending' }), // a new one stays in the queue: not counted
    row('pb_settings', { key: 'categories' }, { value: ['A', 'B'] }, { value: ['A'] }),
  ];
  const calls = world(revertDb('category_links', { products: 4, kept: 0, values_back: 0, values_gone: 1, left: 0, tags_out: 1, tags_in: 6 }, items));
  assert.deepEqual(await bulkPreview({ run_id: RUN }), { ok: true, kind: 'category_links', products: 4, kept: 0, values_back: 0, values_gone: 1, left: 0, tags_out: 1, tags_in: 6, links: 2, suggestions: 1, list: 1 });
  assert.match(calls.find(c => c.method === 'GET' && c.u.startsWith('/rest/v1/pb_bulk_items?')).u, /done=is\.false/);
  world(revertDb('import', {})); // other kinds do not read the record for it
});
