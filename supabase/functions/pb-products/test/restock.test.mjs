// node --test --experimental-strip-types supabase/functions/pb-products/test/
// "Back in stock from a new broadcast" (restock.ts; pre-launch fix D17) and the second look at a later twin (D21).
// Owner, 2026-11-12: "after 7 days we got a broadcast of that product … then that product is back in stock".
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { afterRead, backInStock, regateLater, restockTargets } = await import('../restock.ts');
const { noticeLine, postedAgain, stockNotice } = await import('../stockNotice.ts');

const V = 'aaaaaaaa-0000-4000-8000-000000000001';
const id = (n) => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`;
const day = (n) => `2026-11-${String(n).padStart(2, '0')}T06:00:00+00:00`;
/** One candidate as pb_stock_candidates returns it (oldest first; the re-post itself is among them). */
const cand = (n, sku, key, colours, o = {}) => ({ id: id(n), name: null, sku, in_stock: true, status: 'ready', code_key: key, colour_keys: colours, same_vendor: !o.other, notice_key: o.nk ?? key });
/** The re-post as the reader has just saved it. */
const post = (n, sku, color, o = {}) => ({ id: id(n), vendor_id: V, source: 'telegram', sku, color, status: 'ready', created_at: day(10), missing_attrs: [], ...o });
const names = (l) => l.map(c => c.sku);

test('which earlier products a re-post means: the same design at this vendor, in the same colour', () => {
  const me = cand(9, 'KA-5070', 'KA5070', ['wine']);
  const wine = cand(1, 'KA 5070 WINE XS', 'KA5070', ['wine']), teal = cand(2, 'KA 5070 TEAL XS', 'KA5070', ['tealblue']);
  assert.deepEqual(names(restockTargets(me, [wine, teal])), ['KA 5070 WINE XS'], 'another colour of the design is not meant');
  assert.deepEqual(names(restockTargets(cand(9, 'KA-5070', 'KA5070', ['rama']), [wine, teal])), ['KA 5070 TEAL XS'], 'a trade name and the plain colour are one');
  assert.deepEqual(restockTargets(cand(9, 'KA-5070', 'KA5070', ['pinkandwhite']), [cand(1, 'KA 5070 PINK', 'KA5070', ['pink'])]), [], 'a colour must match in full: "Pink and White" is not Pink');
  assert.deepEqual(restockTargets(me, [cand(1, 'KA 5070 WINE', 'KA5070', ['wine'], { other: true })]), [], 'never another vendor\'s product');
  assert.deepEqual(restockTargets(cand(9, 'Pink kurta', null, ['pink']), [wine]), [], 'no code, nothing to go by');
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

/** A fake database. w.rows: the earlier products; w.cands: pb_stock_candidates' answer; w.held: pb_dup_held's;
 *  w.last: { [product id]: the newest stock line of its timeline }. Records what was written. */
function world(w) {
  Object.assign(w, { saved: [], logged: [], verdicts: [], patched: [], refreshed: [], calls: [] });
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)).replace('https://sb.example', ''), method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    const ok = (b, status = 200) => new Response(JSON.stringify(b), { status });
    w.calls.push(`${method} ${u.split('?')[0]}`);
    if (w.down && u.includes(w.down)) return ok({ message: 'down' }, 500);
    if (u.startsWith('/rest/v1/rpc/pb_dup_held')) return ok(w.held ?? null);
    if (u.startsWith('/rest/v1/rpc/pb_stock_candidates')) return ok(w.cands || []);
    if (u.startsWith('/rest/v1/rpc/pb_stock_save')) {
      const r = (w.rows || []).find(x => x.id === body.p_product);
      if (!r) return ok(-1);
      Object.assign(r, body.p_change); w.saved.push(body); return ok(r.listings ?? 0);
    }
    if (u.startsWith('/rest/v1/rpc/pb_dup_verdict_set')) { w.verdicts.push(body); return new Response(null, { status: 204 }); } // a function that returns nothing
    if (u.startsWith('/rest/v1/rpc/pb_products_refresh')) { w.refreshed.push(...body.p_ids); return ok(body.p_ids.map(i => ({ id: i, status: 'needs_info', was: 'ready', missing: [] }))); }
    if (u.startsWith('/rest/v1/rpc/pb_dup_matches')) return ok(w.matches || []);
    if (u.startsWith('/rest/v1/pb_activity') && method === 'GET') { const pid = /product_id=eq\.([\w-]+)/.exec(u)[1]; return ok(w.last?.[pid] ? [w.last[pid]] : []); }
    if (u.startsWith('/rest/v1/pb_activity')) { w.logged.push(body[0]); return ok([{}], 201); }
    if (u.startsWith('/rest/v1/pb_products?id=in.(') && method === 'GET') {
      const want = /id=in\.\(([^)]*)\)/.exec(u)[1].split(',');
      if (u.includes('created_at=gt.')) { // a notice asks which of its products were posted after it
        assert.match(u, /source=neq\.import/, 'a product copied from a store is not a vendor\'s later word');
        const since = Date.parse(/created_at=gt\.([^&]+)/.exec(u)[1]);
        return ok((w.rows || []).filter(r => want.includes(r.id) && r.source !== 'import' && Date.parse(r.created_at) > since).map(r => ({ id: r.id })));
      }
      assert.match(u, /status=neq\.archived&perm_out_at=is\.null/, 'archived and permanently out products are never asked for');
      return ok((w.rows || []).filter(r => want.includes(r.id) && r.status !== 'archived' && !r.perm_out_at));
    }
    if (u.startsWith('/rest/v1/pb_products?id=eq.') && method === 'GET') {
      const pid = /id=eq\.([\w-]+)/.exec(u)[1];
      if (u.includes('select=intake_notes')) return ok([{ intake_notes: w.notes || [] }]);
      const r = (w.rows || []).concat(w.notices || []).find(x => x.id === pid); return ok(r ? [{ created_at: r.created_at }] : []);
    }
    if (u.startsWith('/rest/v1/pb_products?id=eq.') && method === 'PATCH') {
      const pid = /id=eq\.([\w-]+)/.exec(u)[1], r = (w.rows || []).find(x => x.id === pid);
      w.patched.push({ id: pid, body });
      if (u.includes('temp_out_at=not.is.null')) { if (!r?.temp_out_at) return ok([]); Object.assign(r, body); }
      return ok([{ id: pid }]);
    }
    return ok([]);
  };
  return w;
}
const earlier = (n, sku, o = {}) => ({ id: id(n), name: null, sku, in_stock: true, temp_out_at: null, perm_out_at: null, status: 'ready', created_at: day(1), ...o });

test('a lettered code, held as a copy: the product that was plainly out of stock is on sale again', async () => {
  const w = world({ held: id(1), rows: [earlier(1, 'KA 5070 WINE XS', { in_stock: false, listings: 2 })], cands: [cand(1, 'KA 5070 WINE XS', 'KA5070', ['wine']), cand(9, 'KA-5070', 'KA5070', ['wine'])] });
  const p = post(9, 'KA-5070', 'Wine', { status: 'needs_info' });
  const out = await backInStock(p, 'u1', true);
  assert.deepEqual(w.saved, [{ p_product: id(1), p_change: { in_stock: true, temp_out_at: null } }], 'saved and its listings marked for the stores in one call');
  assert.equal(w.rows[0].in_stock, true);
  assert.deepEqual(w.logged[0], { product_id: id(1), website_id: null, listing_id: null, action: 'stock', details: { in_stock: true, temp_out_at: null, posted_again: id(9), resent: 2 }, user_id: 'u1' });
  assert.deepEqual(w.patched.at(-1), { id: id(9), body: { intake_notes: ['This post brought back in stock: KA 5070 WINE XS'] } }, 'the re-post says what it did');
  assert.deepEqual(w.verdicts, [], 'the gate holds it already: nothing more to remember');
  assert.equal(out.status, 'needs_info');
});

test('a number-only code: the product comes back, and the re-post waits as a copy instead of becoming a second listing', async () => {
  const w = world({ held: null, rows: [earlier(1, 'D no 5081', { in_stock: false })], cands: [cand(1, 'D no 5081', '#5081', ['pink']), cand(9, '5081', '#5081', ['pink'])], notes: ['Less ₹200 arrived later — check the cost price.'] });
  const out = await backInStock(post(9, '5081', 'Pink'), null, true);
  assert.equal(w.rows[0].in_stock, true);
  assert.deepEqual(w.verdicts, [{ p_a: id(9), p_b: id(1), p_verdict: 'same' }], 'remembered as the same product');
  assert.deepEqual(w.refreshed, [id(9)], 'the gate is asked again');
  assert.equal(out.status, 'needs_info', 'so the reader does not send it to the websites');
  assert.deepEqual(w.patched.at(-1).body.intake_notes, ['Less ₹200 arrived later — check the cost price.', 'This post brought back in stock: D no 5081'], 'earlier notes stay');
});

test('a "temporarily out" note goes; a product that is simply in stock is left alone and nothing is held', async () => {
  let w = world({ held: null, rows: [earlier(1, 'D no 5081', { temp_out_at: day(5) })], cands: [cand(1, 'D no 5081', '#5081', ['pink']), cand(9, '5081', '#5081', ['pink'])] });
  await backInStock(post(9, '5081', 'Pink'), 'u1', true);
  assert.equal(w.rows[0].temp_out_at, null); assert.deepEqual(w.saved, [], 'nothing changed on the stores for a note');
  assert.deepEqual(w.logged[0].details, { temporary: false, posted_again: id(9) });
  w = world({ held: null, rows: [earlier(1, 'D no 5081')], cands: [cand(1, 'D no 5081', '#5081', ['pink']), cand(9, '5081', '#5081', ['pink'])] });
  const p = post(9, '5081', 'Pink');
  assert.equal(await backInStock(p, 'u1', true), p);
  assert.deepEqual([w.saved, w.logged, w.verdicts, w.patched, w.refreshed], [[], [], [], [], []], 'a number-only re-post of a product in stock stays a suggestion, as before');
});

test('only a first read of a vendor\'s post does this; only earlier products are meant', async () => {
  const cands = [cand(1, 'D no 5081', '#5081', ['pink']), cand(9, '5081', '#5081', ['pink']), cand(12, '5081', '#5081', ['pink'])];
  const out = () => [earlier(1, 'D no 5081', { in_stock: false }), earlier(12, '5081', { in_stock: false, created_at: day(11) })];
  let w = world({ rows: out(), cands });
  await backInStock(post(9, '5081', 'Pink'), null, false);
  assert.deepEqual(w.calls, [], 'read again later (by hand, or a re-read): nothing');
  w = world({ rows: out(), cands });
  await backInStock(post(9, '5081', 'Pink', { source: 'import' }), null, true);
  assert.deepEqual(w.calls, [], 'a product copied from a store is not a broadcast');
  w = world({ rows: out(), cands });
  await backInStock(post(9, '5081', 'Pink', { status: 'archived' }), null, true);
  assert.deepEqual(w.calls, [], 'a stock notice (archived by its own step) never gets here');
  w = world({ rows: out(), cands });
  await backInStock(post(9, '5081', 'Pink'), null, true);
  assert.deepEqual(w.rows.map(r => r.in_stock), [true, false], 'the product added AFTER this post is not touched');
});

test('archived and permanently out products are left alone: the new post is its own product', async () => {
  const w = world({ held: null, rows: [earlier(1, 'D no 5081', { in_stock: false, perm_out_at: day(5) }), earlier(2, '5081', { in_stock: false, status: 'archived' })],
    cands: [cand(1, 'D no 5081', '#5081', ['pink']), cand(2, '5081', '#5081', ['pink']), cand(9, '5081', '#5081', ['pink'])] });
  const p = post(9, '5081', 'Pink');
  assert.equal(await backInStock(p, null, true), p);
  assert.deepEqual([w.saved, w.verdicts], [[], []]);
});

test('the later word wins: a stock-out that is newer than this post is not undone', async () => {
  const cands = [cand(1, 'D no 5081', '#5081', ['pink']), cand(9, '5081', '#5081', ['pink'])];
  const N = { id: id(50), created_at: day(12) }; // the notice arrived two days AFTER this post (this post's read failed and was tried again later)
  let w = world({ rows: [earlier(1, 'D no 5081', { in_stock: false })], cands, notices: [N], last: { [id(1)]: { created_at: day(12), details: { in_stock: false, notice: N.id } } } });
  await backInStock(post(9, '5081', 'Pink'), null, true);
  assert.equal(w.rows[0].in_stock, false, 'a notice posted after this post');
  // the usual order: the notice came first, both were read on the same morning — the notice was READ after this post was made, which must not matter
  w = world({ rows: [earlier(1, 'D no 5081', { in_stock: false })], cands, notices: [{ id: id(50), created_at: day(9) }], last: { [id(1)]: { created_at: day(11), details: { in_stock: false, notice: id(50) } } } });
  await backInStock(post(9, '5081', 'Pink'), null, true);
  assert.equal(w.rows[0].in_stock, true, 'a notice posted before this post');
  w = world({ rows: [earlier(1, 'D no 5081', { in_stock: false })], cands, last: { [id(1)]: { created_at: day(11), details: { in_stock: false, by: 'staff' } } } });
  await backInStock(post(9, '5081', 'Pink'), null, true);
  assert.equal(w.rows[0].in_stock, false, 'a person switched it off after this post arrived');
  w = world({ rows: [earlier(1, 'D no 5081', { in_stock: false })], cands, last: { [id(1)]: { created_at: day(8), details: { in_stock: false, by: 'staff' } } } });
  await backInStock(post(9, '5081', 'Pink'), null, true);
  assert.equal(w.rows[0].in_stock, true, 'a person switched it off before: the vendor\'s new post brings it back');
});

test('a database failure never fails the read', async () => {
  for (const down of ['pb_stock_candidates', 'pb_stock_save', 'pb_dup_verdict_set', 'pb_products_refresh']) {
    const w = world({ down, held: null, rows: [earlier(1, 'D no 5081', { in_stock: false })], cands: [cand(1, 'D no 5081', '#5081', ['pink']), cand(9, '5081', '#5081', ['pink'])] });
    const p = post(9, '5081', 'Pink');
    assert.equal(await backInStock(p, null, true), p, down);
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
  w = world({ held: null, rows: [earlier(1, 'D no 5081', { in_stock: false })], cands: [cand(1, 'D no 5081', '#5081', ['pink']), cand(9, '5081', '#5081', ['pink'])], matches: [{ other_id: id(12), kind: 'original', other_status: 'ready' }] });
  assert.equal((await afterRead(post(9, '5081', 'Pink'), null, true)).status, 'needs_info');
  assert.deepEqual(w.refreshed, [id(9), id(12)]);
});

test('a stock notice leaves alone what the vendor posted again after it', () => {
  const pink = cand(1, '5081 PINK', '#5081', ['pink']), blue = cand(2, '5081 BLUE', '#5081', ['blue']), plain = cand(3, '5081', '#5081', []), again = cand(9, 'D no 5081', '#5081', ['pink']);
  assert.deepEqual(postedAgain([pink, blue, plain], new Set()), [], 'nothing was posted after the notice');
  assert.deepEqual(names(postedAgain([pink, blue, again], new Set([again.id]))), ['5081 PINK', 'D no 5081'], 'the later post and the same colour; the other colour is still marked');
  assert.deepEqual(names(postedAgain([pink, blue, plain, again], new Set([again.id]))), ['5081 PINK', '5081', 'D no 5081'], 'an unknown colour counts as the same');
  assert.deepEqual(names(postedAgain([cand(4, '5081 RAMA', '#5081', ['rama']), cand(9, '5081', '#5081', ['tealblue'])], new Set([id(9)]))), ['5081 RAMA', '5081'], 'trade names too');
  const it = { code: '5081', colours: [], note: '' };
  assert.equal(noticeLine(it, { apply: [blue], left: '' }, 'unknown', [pink, again]), '5081 — out of stock: 5081 BLUE. posted again after this notice, left as it is: 5081 PINK, D no 5081');
  assert.equal(noticeLine(it, { apply: [], left: '' }, 'permanent', [pink]), '5081 — posted again after this notice, left as it is: 5081 PINK');
});

test('a notice read late: the design posted again after it stays on sale, the other colour is still marked', async () => {
  const w = world({
    rows: [earlier(1, '5081 PINK'), earlier(2, '5081 BLUE'), earlier(9, 'D no 5081', { created_at: day(11), source: 'telegram' }), earlier(3, '5081 PINK', { created_at: day(12), source: 'import' })],
    cands: [cand(1, '5081 PINK', '#5081', ['pink']), cand(2, '5081 BLUE', '#5081', ['blue']), cand(9, 'D no 5081', '#5081', ['pink']), cand(3, '5081 PINK', '#5081', ['pink'])],
  });
  const notice = { id: id(50), vendor_id: V, source: 'telegram', status: 'reading', ai_read_at: null, locked: [], created_at: day(10) };
  const saved = await stockNotice(notice, { kind: 'unknown', items: [{ code: '5081', colours: [], note: '' }] }, null, { model: 'm', usd: 0.001 }, null);
  assert.ok(saved, 'it is a notice, not a product');
  assert.deepEqual(w.saved.map(x => x.p_product), [id(2)], 'only the colour nobody posted again goes out of stock');
  assert.deepEqual(w.rows.map(r => r.in_stock), [true, false, true, true], 'the pink ones stay — also the one copied from a store, because the vendor\'s later post speaks for that colour');
  const note = w.patched.find(x => x.id === id(50)).body;
  assert.equal(note.status, 'archived', 'nothing is left for a person to check');
  assert.deepEqual(note.intake_notes, ['5081 — out of stock: 5081 BLUE. posted again after this notice, left as it is: 5081 PINK, D no 5081, 5081 PINK']);
});
