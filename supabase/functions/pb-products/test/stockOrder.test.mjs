// node --test --experimental-strip-types supabase/functions/pb-products/test/
// The later word about a product's stock wins, whichever post was read first (pre-launch fix D17).
// These run the REAL stock-notice step, the REAL re-post step and the REAL Stock switch over one fake database
// (stockWorld.mjs), in both reading orders: the independent review of 2026-11-13 found that an older re-post read
// last put a sold-out product back, and its second look found the corners marked "second review" below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { at, C5081, cand, id, NOTICE, post, row, stockOf, world } from './stockWorld.mjs';

const { backInStock } = await import('../restock.ts');
const { noticeLine, stockNotice } = await import('../stockNotice.ts');
const { saidAt, setStock } = await import('../stock.ts');
const readNotice = (n, kind = 'unknown') => stockNotice(n, { kind, items: [{ code: '5081', colours: [], note: '' }] }, null, { model: 'm', usd: 0.001 }, null);

test('review finding: X is out already; a stock-out posted AFTER the re-post is on record, so the re-post read last does not bring X back', async () => {
  // the vendor: 09:00 posts 5081 again, 15:00 says "5081 stock out". The notice is read first (the re-post waited for its "Less").
  let w = world({ held: null, rows: [row(1, 'D no 5081', { in_stock: false, stock_said_at: at(3) }), row(9, '5081')], cands: [cand(1, 'D no 5081', '#5081', ['pink'], { nk: '#5081' })] });
  w.cands[0].in_stock = false;
  await readNotice(NOTICE(15));
  assert.equal(w.rows[0].stock_said_at, at(10, 15), 'a notice for a product that is out already still leaves its time');
  assert.deepEqual(w.saved.at(-1), { id: id(1), in_stock: false, temp_out_at: null, said_at: at(10, 15) }, '"out" is said in full, whatever the look-up showed');
  assert.ok(w.logged.some(l => l.action === 'stock' && l.product_id === id(1) && l.details.notice === id(50)), '… and a line on its timeline');
  w.cands = C5081;
  const out = await backInStock(post(9, '5081', 'Pink'), null, true);
  assert.equal(stockOf(w, 1), false, 'the vendor\'s last word was "stock out"');
  assert.equal(out.status, 'needs_info', 'and the re-post does not go live as a new listing of a design that is out');
  assert.deepEqual(w.patched.at(-1).body.intake_notes, ['Not brought back, a newer stock-out stands: D no 5081']);
  // the same two posts read in the order they were made end the same way: back at 09:00, out at 15:00
  w = world({ held: null, rows: [row(1, 'D no 5081', { in_stock: false, stock_said_at: at(3) }), row(9, '5081')], cands: C5081 });
  await backInStock(post(9, '5081', 'Pink'), null, true);
  assert.equal(stockOf(w, 1), true);
  await readNotice(NOTICE(15));
  assert.equal(stockOf(w, 1), false);
});

test('a notice that is OLDER than the re-post never switches off what the re-post stands for, in either reading order', async () => {
  // the vendor: 08:00 "5081 stock out", 09:00 posts 5081 again
  let w = world({ held: null, rows: [row(1, 'D no 5081'), row(9, '5081'), row(3, '5081 BLUE')], cands: [cand(1, 'D no 5081', '#5081', ['pink'], { nk: '#5081' }), cand(3, '5081 BLUE', '#5081', ['blue'], { nk: '#5081' })] });
  await readNotice(NOTICE(8));
  assert.equal(stockOf(w, 1), false);
  w.cands = [cand(1, 'D no 5081', '#5081', ['pink']), cand(3, '5081 BLUE', '#5081', ['blue']), cand(9, '5081', '#5081', ['pink'])];
  await backInStock(post(9, '5081', 'Pink'), null, true);
  assert.deepEqual([stockOf(w, 1), stockOf(w, 3)], [true, false], 'read in order: out, then back; the other colour stays out');
  // read the other way round: the re-post first (X is in stock: only its time is put on record), the notice late
  w = world({ held: null, rows: [row(1, 'D no 5081'), row(9, '5081'), row(3, '5081 BLUE')], cands: [cand(1, 'D no 5081', '#5081', ['pink']), cand(3, '5081 BLUE', '#5081', ['blue']), cand(9, '5081', '#5081', ['pink'])] });
  await backInStock(post(9, '5081', 'Pink'), null, true);
  const saved = await readNotice(NOTICE(8));
  assert.deepEqual([stockOf(w, 1), stockOf(w, 9), stockOf(w, 3)], [true, true, false], 'the pink ones stay on sale, the colour nobody posted again goes out');
  const note = w.patched.find(x => x.id === id(50)).body;
  assert.equal(note.status, 'archived', 'nothing is left for a person to check');
  assert.deepEqual(note.intake_notes, ['5081 — out of stock: 5081 BLUE. left as it is, a newer post or change stands: D no 5081, 5081']);
  assert.ok(saved);
});

test('review finding: X is in stock; the notice is newer than the re-post and is read first — the re-post must not go live', async () => {
  const w = world({ held: null, rows: [row(1, 'D no 5081'), row(9, '5081')], cands: [cand(1, 'D no 5081', '#5081', ['pink'], { nk: '#5081' })] });
  await readNotice(NOTICE(15));
  w.cands = C5081;
  const out = await backInStock(post(9, '5081', 'Pink'), null, true);
  assert.equal(stockOf(w, 1), false);
  assert.equal(out.status, 'needs_info', 'held as a copy of the product the notice switched off');
  assert.deepEqual(w.verdicts, [{ p_a: id(9), p_b: id(1), p_verdict: 'same' }]);
});

test('the time that counts is when the vendor posted, not when Playbook made the row; a temporary notice works the same way', async () => {
  // an old notice forwarded by hand today: its row is new, its word is old
  let w = world({ held: null, rows: [row(1, 'D no 5081', { stock_said_at: at(9) }), row(9, '5081')], cands: [cand(1, 'D no 5081', '#5081', ['pink'], { nk: '#5081' })] });
  await readNotice(NOTICE(0, { created_at: at(12), source_posted_at: at(2) }));
  assert.equal(stockOf(w, 1), true, 'a word from day 2 does not undo one from day 9');
  assert.equal(saidAt({ source_posted_at: null, created_at: at(4) }), at(4), 'no vendor time on the post: when it reached Playbook');
  w = world({ held: null, rows: [row(1, 'D no 5081', { stock_said_at: at(10, 9) })], cands: [cand(1, 'D no 5081', '#5081', ['pink'], { nk: '#5081' })] });
  await readNotice(NOTICE(8), 'temporary');
  assert.equal(w.rows[0].temp_out_at, null, 'an older temporary notice leaves no note on a product posted again since');
  await readNotice(NOTICE(15), 'temporary');
  assert.equal(w.rows[0].temp_out_at, at(10, 15), 'a newer one does, dated when the vendor said it');
  assert.deepEqual(w.saved.at(-1), { id: id(1), temp_out_at: at(10, 15), as_of: at(10, 15) }, 'a note only: no stock is named, the stores are sent nothing');
  assert.equal(w.rows[0].stock_said_at, at(10, 9), 'and it does not become the latest word about the stock');
});

test('second review: a look-up that is out of date cannot leave a product on sale after a newer stock-out', async () => {
  // two runs at once: the notice (15:00) looked X up while it was out; an older re-post (09:00) put it back before the notice wrote
  const w = world({ held: null, rows: [row(1, 'D no 5081', { stock_said_at: at(10, 9) })], cands: [cand(1, 'D no 5081', '#5081', ['pink'], { nk: '#5081' })] });
  w.cands[0].in_stock = false; // what the notice saw
  await readNotice(NOTICE(15));
  assert.equal(stockOf(w, 1), false);
});

test('second review: a temporary notice never outranks a real stock-out, whichever of them is read first', async () => {
  const C = [cand(1, 'D no 5081', '#5081', ['pink'], { nk: '#5081' })];
  // the vendor: 10:00 "5081 stock out", 15:00 "5081 temporary stock out"
  for (const order of [['unknown', 10, 'temporary', 15], ['temporary', 15, 'unknown', 10]]) {
    const w = world({ held: null, rows: [row(1, 'D no 5081')], cands: C });
    await readNotice(NOTICE(order[1]), order[0]);
    await readNotice(NOTICE(order[3]), order[2]);
    assert.deepEqual([stockOf(w, 1), w.rows[0].temp_out_at, w.rows[0].stock_said_at], [false, at(10, 15), at(10, 10)], `read ${order[0]} first`);
  }
  // … and an older PERMANENT notice read after the temporary one still takes the product off sale
  const w = world({ held: null, rows: [row(1, 'D no 5081')], cands: C });
  await readNotice(NOTICE(15), 'temporary');
  await readNotice(NOTICE(10), 'permanent');
  assert.ok(!stockOf(w, 1) && w.rows[0].perm_out_at, 'permanently out');
});

test('second review: a notice and a new post made at the very same time — the stock-out stands, in either reading order', async () => {
  const N = [cand(1, 'D no 5081', '#5081', ['pink'], { nk: '#5081' })];
  let w = world({ held: null, rows: [row(1, 'D no 5081'), row(9, '5081')], cands: N });
  await readNotice(NOTICE(9));
  w.cands = C5081;
  await backInStock(post(9, '5081', 'Pink'), null, true);
  assert.equal(stockOf(w, 1), false, 'notice first');
  w = world({ held: null, rows: [row(1, 'D no 5081'), row(9, '5081')], cands: C5081 });
  await backInStock(post(9, '5081', 'Pink'), null, true);
  w.cands = N;
  await readNotice(NOTICE(9));
  assert.equal(stockOf(w, 1), false, 'new post first');
});

test('a person\'s Stock switch is the latest word as of that moment', async () => {
  const w = world({ held: null, rows: [row(1, 'D no 5081', { stock_said_at: at(11) }), row(9, '5081')], cands: C5081 });
  const r = await setStock({ product_id: id(1), in_stock: false }, 'u1');
  assert.equal(r.ok, true);
  assert.equal(w.saved[0].force, true, 'it always applies, whatever is on record');
  assert.ok(Date.parse(w.rows[0].stock_said_at) >= Date.parse(at(11)), 'and its time is put on record');
  await backInStock(post(9, '5081', 'Pink'), null, true);
  assert.equal(stockOf(w, 1), false, 'a post the vendor made before the switch does not undo it');
  assert.ok(!w.logged.some(l => 'force' in (l.details || {})), 'the timeline says what changed, not how');
});

test('second review: switching Stock ON claims no time, so a notice posted before the tap that arrives after it still applies', async () => {
  // the vendor said "5081 stock out" at 11:00 on day 10; it has not reached Playbook. A person flips the switch off and on again (a mis-tap).
  const w = world({ held: null, rows: [row(1, 'D no 5081', { stock_said_at: at(9) })], cands: [cand(1, 'D no 5081', '#5081', ['pink'], { nk: '#5081' })] });
  await setStock({ product_id: id(1), in_stock: false }, 'u1');
  await setStock({ product_id: id(1), in_stock: true }, 'u1');
  assert.deepEqual(w.saved.at(-1), { id: id(1), in_stock: true, perm_out_at: null, said_at: null });
  assert.deepEqual([stockOf(w, 1), w.rows[0].stock_said_at], [true, null], 'on sale, and no time is claimed for it');
  await readNotice(NOTICE(11));
  assert.equal(stockOf(w, 1), false, 'the vendor\'s notice is not silenced by the tap');
  assert.equal(w.patched.find(x => x.id === id(50)).body.intake_notes[0], '5081 — out of stock: D no 5081');
});

test('the notice\'s line says what was left because a newer word stands', () => {
  const it = { code: '5081', colours: [], note: '' };
  const blue = cand(2, '5081 BLUE', '#5081', ['blue']), pink = cand(1, '5081 PINK', '#5081', ['pink']);
  assert.equal(noticeLine(it, { apply: [blue], left: '' }, 'unknown', [pink]), '5081 — out of stock: 5081 BLUE. left as it is, a newer post or change stands: 5081 PINK');
  assert.equal(noticeLine(it, { apply: [], left: '' }, 'permanent', [pink]), '5081 — left as it is, a newer post or change stands: 5081 PINK');
  assert.equal(noticeLine(it, { apply: [], left: '' }), '5081 — not in Playbook, nothing to do');
});
