// node --test --experimental-strip-types supabase/functions/pb-products/test/
// "Back in stock from a new broadcast" (restock.ts; pre-launch fix D17) and the second look at a later twin (D21).
// Owner, 2026-11-12: "after 7 days we got a broadcast of that product … then that product is back in stock".
// Which products a re-post means, and what the step does for them. What happens when posts are read out of
// order is in stockOrder.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { at, C5081, cand, id, post, row, stockOf, world } from './stockWorld.mjs';

const { afterRead, backInStock, regateLater, restockTargets, sameColour } = await import('../restock.ts');
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
  assert.deepEqual(w.saved.at(-1), { id: id(1), in_stock: true, temp_out_at: null, said_at: at(10, 9) }, 'said in full, whatever the look-up a moment ago showed');
  // the vendor: 09:00 posts it again, 15:00 "temporary stock out" — read the other way round, the later note stays
  w = world({ held: null, rows: [row(1, 'D no 5081', { temp_out_at: at(10, 15) }), row(9, '5081')], cands: C5081 });
  const again = post(9, '5081', 'Pink');
  assert.equal(await backInStock(again, 'u1', true), again, 'nothing to bring back: it is not held by this step');
  assert.equal(w.rows[0].temp_out_at, at(10, 15), 'a note the vendor left AFTER this post is not cleared by it');
  assert.deepEqual(w.saved.at(-1), { id: id(1), said_at: at(10, 9) });
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
    ['no vendor time on the post (an old crawler): its place in the order is not known, so it brings nothing back and stamps nothing', post(9, '5081', 'Pink', { source_posted_at: null }), true],
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
