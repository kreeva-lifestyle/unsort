// node --test --experimental-strip-types supabase/functions/pb-products/test/
// "Back in stock from a new broadcast" (restock.ts; pre-launch fix D17) and the second look at a later twin (D21).
// Owner, 2026-11-12: "after 7 days we got a broadcast of that product … then that product is back in stock".
// The order tests run the REAL stock-notice step and the REAL re-post step over one fake database, in both reading
// orders: the independent review of 2026-11-13 found that an older re-post read last put a sold-out product back.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { afterRead, backInStock, regateLater, restockTargets, sameColour } = await import('../restock.ts');
const { noticeLine, stockNotice } = await import('../stockNotice.ts');
const { NEWER, saidAt, setStock } = await import('../stock.ts');

const V = 'aaaaaaaa-0000-4000-8000-000000000001';
const id = (n) => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = (day, hour = 6) => `2026-11-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`;
/** One candidate as pb_stock_candidates returns it (oldest first; the re-post itself is among them). */
const cand = (n, sku, key, colours, o = {}) => ({ id: id(n), name: null, sku, in_stock: true, status: 'ready', code_key: key, colour_keys: colours, same_vendor: !o.other, notice_key: o.nk ?? key });
/** The re-post as the reader has just saved it: made by the vendor on day 10 at 09:00. */
const post = (n, sku, color, o = {}) => ({ id: id(n), vendor_id: V, source: 'telegram', sku, color, status: 'ready', created_at: at(10, 20), source_posted_at: at(10, 9), missing_attrs: [], ...o });
const names = (l) => l.map(c => c.sku);

test('which earlier products a re-post means: the same design at this vendor, in the same colour', () => {
  const me = cand(9, 'KA-5070', 'KA5070', ['wine']);
  const wine = cand(1, 'KA 5070 WINE XS', 'KA5070', ['wine']), teal = cand(2, 'KA 5070 TEAL XS', 'KA5070', ['tealblue']);
  assert.deepEqual(names(restockTargets(me, [wine, teal])), ['KA 5070 WINE XS'], 'another colour of the design is not meant');
  assert.deepEqual(restockTargets(cand(9, 'KA-5070', 'KA5070', ['pinkandwhite']), [cand(1, 'KA 5070 PINK', 'KA5070', ['pink'])]), [], 'a colour must match in full: "Pink and White" is not Pink');
  assert.deepEqual(restockTargets(me, [cand(1, 'KA 5070 WINE', 'KA5070', ['wine'], { other: true })]), [], 'never another vendor\'s product');
  assert.deepEqual(restockTargets(cand(9, 'Pink kurta', null, ['pink']), [wine]), [], 'no code, nothing to go by');
});

test('a trade name and its plain colour are one colour, whichever side says which', () => {
  assert.ok(sameColour('rama', 'tealblue') && sameColour('tealblue', 'rama') && sameColour('rani', 'ranipink') && sameColour('ranipink', 'rani'));
  assert.ok(!sameColour('pink', 'ranipink') && !sameColour('wine', 'maroon'));
  const find = (mine, theirs) => names(restockTargets(cand(9, 'KB 280', 'KB280', [mine]), [cand(1, `KB 280 ${theirs.toUpperCase()} XS`, 'KB280', [theirs]), cand(2, 'KB 280 BLACK XS', 'KB280', ['black'])]));
  assert.deepEqual(find('rama', 'tealblue'), ['KB 280 TEALBLUE XS']);
  assert.deepEqual(find('mehendigreen', 'mehendi'), ['KB 280 MEHENDI XS'], 'the re-post is read as "Mehendi Green", the product says MEHENDI');
  assert.deepEqual(find('ranipink', 'rani'), ['KB 280 RANI XS']);
  assert.deepEqual(find('navyblue', 'navy'), ['KB 280 NAVY XS']);
  assert.deepEqual(find('skyblue', 'firozi'), ['KB 280 FIROZI XS']);
});

test('a number-only code counts inside one vendor, however the number is labelled', () => {
  const me = cand(9, 'D no 5081', '#5081', ['pink']);
  assert.deepEqual(names(restockTargets(me, [cand(1, '5081', '#5081', ['pink']), cand(2, 'D-5081', 'D5081', ['pink']), cand(3, '5081 BLUE', '#5081', ['blue'])])), ['5081', 'D-5081']);
  assert.deepEqual(names(restockTargets(me, [cand(1, 'KB 5081 PINK', 'KB5081', ['pink'])])), ['KB 5081 PINK'], 'the one design with that number');
  assert.deepEqual(restockTargets(me, [cand(1, 'KB 5081 PINK', 'KB5081', ['pink']), cand(2, 'NKB 5081 PINK', 'NKB5081', ['pink'])]), [], 'two designs share the number: not guessed');
  assert.deepEqual(names(restockTargets(cand(9, 'KB 302', 'KB302', ['wine']), [cand(1, 'D no 302', '#302', ['wine']), cand(2, 'NKB 302 WINE', 'NKB302', ['wine'])])), ['D no 302'], 'a lettered code keeps its letters');
});

test('a colour that is unknown: only when the design has one earlier product', () => {
  const one = [cand(1, 'KA 5070', 'KA5070', [])], two = [cand(1, 'KA 5070 WINE', 'KA5070', ['wine']), cand(2, 'KA 5070 TEAL', 'KA5070', ['tealblue'])];
  assert.deepEqual(names(restockTargets(cand(9, 'KA-5070', 'KA5070', ['wine']), one)), ['KA 5070'], 'the earlier product has no colour and is the only one');
  assert.deepEqual(names(restockTargets(cand(9, 'KA-5070', 'KA5070', []), [two[0]])), ['KA 5070 WINE'], 'the re-post has no colour and there is one product');
  assert.deepEqual(restockTargets(cand(9, 'KA-5070', 'KA5070', []), two), [], 'the re-post has no colour and there are two: not guessed');
});

/** A fake database. w.rows: products (id, in_stock, temp_out_at, perm_out_at, status, stock_said_at, listings);
 *  w.cands: pb_stock_candidates' answer; w.held: pb_dup_held's. pb_stock_save keeps the rule of the real one
 *  (20261113130000_pb_stock_word.sql, checked against PostgreSQL in supabase/tests/sql/t_dups.sql part 7). */
function world(w) {
  Object.assign(w, { saved: [], logged: [], verdicts: [], patched: [], refreshed: [], calls: [], rows: w.rows || [] });
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)).replace('https://sb.example', ''), method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    const ok = (b, status = 200) => new Response(JSON.stringify(b), { status });
    w.calls.push(`${method} ${u.split('?')[0]}`);
    if (w.down && u.includes(w.down)) return ok({ message: 'down' }, 500);
    if (u.startsWith('/rest/v1/rpc/pb_dup_held')) return ok(w.held ?? null);
    if (u.startsWith('/rest/v1/rpc/pb_stock_candidates')) return ok(w.cands || []);
    if (u.startsWith('/rest/v1/rpc/pb_stock_save')) {
      const r = w.rows.find(x => x.id === body.p_product), ch = body.p_change;
      if (!r) return ok(-1);
      const said = ch.said_at ? Date.parse(ch.said_at) : null;
      if (said !== null && !ch.force && r.stock_said_at && Date.parse(r.stock_said_at) > said) return ok(NEWER);
      for (const k of ['in_stock', 'temp_out_at', 'perm_out_at']) if (k in ch) r[k] = ch[k];
      if (said !== null) r.stock_said_at = new Date(Math.max(said, r.stock_said_at ? Date.parse(r.stock_said_at) : said)).toISOString();
      w.saved.push({ id: body.p_product, ...ch });
      return ok('in_stock' in ch || 'perm_out_at' in ch ? (r.listings ?? 0) : 0);
    }
    if (u.startsWith('/rest/v1/rpc/pb_dup_verdict_set')) { w.verdicts.push(body); return new Response(null, { status: 204 }); } // a function that returns nothing
    if (u.startsWith('/rest/v1/rpc/pb_products_refresh')) { w.refreshed.push(...body.p_ids); return ok(body.p_ids.map(i => ({ id: i, status: 'needs_info', was: 'ready', missing: [] }))); }
    if (u.startsWith('/rest/v1/rpc/pb_dup_matches')) return ok(w.matches || []);
    if (u.startsWith('/rest/v1/pb_activity')) { w.logged.push(body[0]); return ok([{}], 201); }
    if (u.startsWith('/rest/v1/pb_listings')) return ok([]);
    if (u.startsWith('/rest/v1/pb_products?id=in.(') && method === 'GET') {
      const want = /id=in\.\(([^)]*)\)/.exec(u)[1].split(',');
      assert.match(u, /status=neq\.archived&perm_out_at=is\.null/, 'archived and permanently out products are never asked for');
      return ok(w.rows.filter(r => want.includes(r.id) && r.status !== 'archived' && !r.perm_out_at));
    }
    if (u.startsWith('/rest/v1/pb_products?id=eq.') && method === 'GET') return ok(u.includes('select=intake_notes') ? [{ intake_notes: w.notes || [] }] : w.rows.filter(r => u.includes(r.id)));
    if (u.startsWith('/rest/v1/pb_products?id=eq.') && method === 'PATCH') { w.patched.push({ id: /id=eq\.([\w-]+)/.exec(u)[1], body }); return ok([{ id: /id=eq\.([\w-]+)/.exec(u)[1] }]); }
    return ok([]);
  };
  return w;
}
const row = (n, sku, o = {}) => ({ id: id(n), name: null, sku, in_stock: true, temp_out_at: null, perm_out_at: null, status: 'ready', stock_said_at: null, created_at: at(1), ...o });
const stockOf = (w, n) => w.rows.find(r => r.id === id(n)).in_stock;
const C5081 = [cand(1, 'D no 5081', '#5081', ['pink']), cand(9, '5081', '#5081', ['pink'])];

test('a product that was plainly out of stock is on sale again, and the re-post waits as a copy', async () => {
  const w = world({ held: null, rows: [row(1, 'D no 5081', { in_stock: false, listings: 2 }), row(9, '5081')], cands: C5081, notes: ['Less ₹200 arrived later — check the cost price.'] });
  const out = await backInStock(post(9, '5081', 'Pink'), 'u1', true);
  assert.equal(stockOf(w, 1), true);
  assert.deepEqual(w.saved.at(-1), { id: id(1), in_stock: true, temp_out_at: null, said_at: at(10, 9) }, 'saved with the time the vendor made the post, not when it reached Playbook');
  assert.deepEqual(w.logged.at(-1), { product_id: id(1), website_id: null, listing_id: null, action: 'stock', details: { in_stock: true, temp_out_at: null, said_at: at(10, 9), posted_again: id(9), resent: 2 }, user_id: 'u1' });
  assert.deepEqual(w.verdicts, [{ p_a: id(9), p_b: id(1), p_verdict: 'same' }], 'remembered as the same product (a number alone never holds by itself)');
  assert.deepEqual(w.refreshed, [id(9)]);
  assert.equal(out.status, 'needs_info', 'so the reader does not send it to the websites as a second listing');
  const order = w.calls.filter(c => /pb_dup_verdict_set|pb_products_refresh|pb_stock_save/.test(c));
  assert.ok(order.indexOf('POST /rest/v1/rpc/pb_products_refresh') < order.lastIndexOf('POST /rest/v1/rpc/pb_stock_save'), 'held BEFORE the stock is touched');
  assert.deepEqual(w.patched.at(-1), { id: id(9), body: { intake_notes: ['Less ₹200 arrived later — check the cost price.', 'This post brought back in stock: D no 5081'] } }, 'the re-post says what it did; earlier notes stay');
});

test('a lettered code the gate already holds: nothing more is remembered', async () => {
  const w = world({ held: id(1), rows: [row(1, 'KA 5070 WINE XS', { in_stock: false }), row(9, 'KA-5070')], cands: [cand(1, 'KA 5070 WINE XS', 'KA5070', ['wine']), cand(9, 'KA-5070', 'KA5070', ['wine'])] });
  const p = post(9, 'KA-5070', 'Wine', { status: 'needs_info' });
  assert.equal(await backInStock(p, null, true), p);
  assert.equal(stockOf(w, 1), true);
  assert.deepEqual([w.verdicts, w.refreshed], [[], []]);
});

test('a "temporarily out" note goes; a product that is simply in stock is only confirmed, and nothing is held', async () => {
  let w = world({ held: null, rows: [row(1, 'D no 5081', { temp_out_at: at(5) }), row(9, '5081')], cands: C5081 });
  await backInStock(post(9, '5081', 'Pink'), 'u1', true);
  assert.equal(w.rows[0].temp_out_at, null);
  assert.deepEqual(w.saved.at(-1), { id: id(1), temp_out_at: null, said_at: at(10, 9) }, 'no stock is named, so the stores are sent nothing for a note');
  w = world({ held: null, rows: [row(1, 'D no 5081'), row(9, '5081')], cands: C5081 });
  const p = post(9, '5081', 'Pink');
  assert.equal(await backInStock(p, 'u1', true), p, 'a number-only re-post of a product in stock stays a suggestion, as before');
  assert.deepEqual(w.saved, [{ id: id(9), said_at: at(10, 9) }, { id: id(1), said_at: at(10, 9) }], 'only the time of this post is put on record: for itself and for the product it stands for');
  assert.deepEqual([w.logged, w.verdicts, w.patched, w.refreshed], [[], [], [], []]);
});

test('only the first read of a vendor\'s Telegram post that is a product does this; only earlier products are meant', async () => {
  const cands = [...C5081, cand(12, '5081', '#5081', ['pink'])];
  const rows = () => [row(1, 'D no 5081', { in_stock: false }), row(9, '5081'), row(12, '5081', { in_stock: false, created_at: at(11) })];
  for (const [why, p, first] of [
    ['read again later, by hand or by a re-read; or the reader saw a stock notice in the post', post(9, '5081', 'Pink'), false],
    ['a product copied from a store is not a broadcast', post(9, '5081', 'Pink', { source: 'import' }), true],
    ['a product typed in by a person is not the vendor speaking: they have the Stock switch', post(9, '5081', 'Pink', { source: 'manual' }), true],
    ['a stock notice (archived by its own step) never gets here', post(9, '5081', 'Pink', { status: 'archived' }), true],
    ['no vendor', post(9, '5081', 'Pink', { vendor_id: null }), true], ['no code', post(9, '', 'Pink'), true],
  ]) {
    const w = world({ rows: rows(), cands });
    assert.equal(await backInStock(p, null, first), p, why);
    assert.deepEqual(w.calls, [], why);
  }
  const w = world({ rows: rows(), cands });
  await backInStock(post(9, '5081', 'Pink'), null, true);
  assert.deepEqual([stockOf(w, 1), stockOf(w, 12)], [true, false], 'the product added AFTER this post is not touched');
});

test('archived and permanently out products are left alone: the new post is its own product', async () => {
  const w = world({ held: null, rows: [row(1, 'D no 5081', { in_stock: false, perm_out_at: at(5) }), row(2, '5081', { in_stock: false, status: 'archived' }), row(9, '5081')],
    cands: [cand(1, 'D no 5081', '#5081', ['pink']), cand(2, '5081', '#5081', ['pink']), cand(9, '5081', '#5081', ['pink'])] });
  const p = post(9, '5081', 'Pink');
  assert.equal(await backInStock(p, null, true), p);
  assert.deepEqual([stockOf(w, 1), stockOf(w, 2), w.verdicts], [false, false, []]);
});

test('a post without a colour never brings back one colour of several, even when the gate holds it as a copy of the first', async () => {
  const w = world({ held: id(1), rows: [row(1, 'KA 5070 WINE', { in_stock: false }), row(2, 'KA 5070 TEAL'), row(9, 'KA-5070')],
    cands: [cand(1, 'KA 5070 WINE', 'KA5070', ['wine']), cand(2, 'KA 5070 TEAL', 'KA5070', ['tealblue']), cand(9, 'KA-5070', 'KA5070', [])] });
  await backInStock(post(9, 'KA-5070', null, { status: 'needs_info' }), null, true);
  assert.equal(stockOf(w, 1), false, 'which colour is back is not known: a person answers the held copy');
});

// ── the later word wins, whichever post was read first ──
const NOTICE = (hour, o = {}) => ({ id: id(50), vendor_id: V, source: 'telegram', status: 'reading', ai_read_at: null, locked: [], created_at: at(10, 20), source_posted_at: at(10, hour), ...o });
const readNotice = (n, kind = 'unknown') => stockNotice(n, { kind, items: [{ code: '5081', colours: [], note: '' }] }, null, { model: 'm', usd: 0.001 }, null);

test('review finding: X is out already; a stock-out posted AFTER the re-post is on record, so the re-post read last does not bring X back', async () => {
  // the vendor: 09:00 posts 5081 again, 15:00 says "5081 stock out". The notice is read first (the re-post waited for its "Less").
  let w = world({ held: null, rows: [row(1, 'D no 5081', { in_stock: false, stock_said_at: at(3) }), row(9, '5081')], cands: [cand(1, 'D no 5081', '#5081', ['pink'], { nk: '#5081' })] });
  w.cands[0].in_stock = false;
  await readNotice(NOTICE(15));
  assert.equal(w.rows[0].stock_said_at, at(10, 15), 'a notice for a product that is out already still leaves its time');
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
  assert.ok(w.rows[0].temp_out_at, 'a newer one does');
  assert.deepEqual(Object.keys(w.saved.at(-1)).sort(), ['id', 'said_at', 'temp_out_at'], 'a note only: no stock is named, the stores are sent nothing');
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

test('a database failure never fails the read, and no stock is touched when the hold could not be made', async () => {
  for (const down of ['pb_stock_candidates', 'pb_stock_save', 'pb_dup_held', 'pb_dup_verdict_set', 'pb_products_refresh', 'pb_products?id=in.']) {
    const w = world({ down, held: null, rows: [row(1, 'D no 5081', { in_stock: false }), row(9, '5081')], cands: C5081 });
    const p = post(9, '5081', 'Pink', down === 'pb_dup_held' ? { status: 'needs_info' } : {});
    assert.equal((await backInStock(p, null, true)).id, p.id, down);
    assert.equal(stockOf(w, 1), false, `${down}: the sold-out product stays as it is`);
  }
});

test('two posts of one product read in the same minute: the later one, still Ready, is judged again', async () => {
  let w = world({ matches: [{ other_id: id(12), kind: 'original', other_status: 'ready' }, { other_id: id(13), kind: 'original', other_status: 'needs_info' }, { other_id: id(14), kind: 'colour', other_status: 'ready' }, { other_id: id(15), kind: 'maybe', other_status: 'ready' }] });
  await regateLater(post(9, 'KA-5070', 'Wine'));
  assert.deepEqual(w.refreshed, [id(12)], 'only a later copy that slipped through; one already waiting, another colour and a suggestion are left');
  w = world({ matches: [] });
  await regateLater(post(9, 'KA-5070', 'Wine'));
  assert.deepEqual(w.refreshed, []);
  w = world({ matches: [{ other_id: id(12), kind: 'original', other_status: 'ready' }] });
  await regateLater(post(9, '', 'Wine'));
  assert.deepEqual(w.calls, [], 'no code, nothing to compare');
  w = world({ down: 'pb_dup_matches' });
  await regateLater(post(9, 'KA-5070', 'Wine')); // never throws
  // after a read both steps run, the second on the product as the first left it
  w = world({ held: null, rows: [row(1, 'D no 5081', { in_stock: false }), row(9, '5081')], cands: C5081, matches: [{ other_id: id(12), kind: 'original', other_status: 'ready' }] });
  assert.equal((await afterRead(post(9, '5081', 'Pink'), null, true)).status, 'needs_info');
  assert.deepEqual(w.refreshed, [id(9), id(12)]);
});

test('the notice\'s line says what was left because a newer word stands', () => {
  const it = { code: '5081', colours: [], note: '' };
  const blue = cand(2, '5081 BLUE', '#5081', ['blue']), pink = cand(1, '5081 PINK', '#5081', ['pink']);
  assert.equal(noticeLine(it, { apply: [blue], left: '' }, 'unknown', [pink]), '5081 — out of stock: 5081 BLUE. left as it is, a newer post or change stands: 5081 PINK');
  assert.equal(noticeLine(it, { apply: [], left: '' }, 'permanent', [pink]), '5081 — left as it is, a newer post or change stands: 5081 PINK');
  assert.equal(noticeLine(it, { apply: [], left: '' }), '5081 — not in Playbook, nothing to do');
});
