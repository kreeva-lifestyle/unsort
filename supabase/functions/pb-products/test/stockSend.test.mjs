// node --test --experimental-strip-types supabase/functions/pb-products/test/
// Pre-launch check, 2026-11-13 (D5, D6, D7): the pure parts of the stock send
// (stockSend.ts), the photo check (mediaCheck.ts) and the two brakes (brake.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.Deno ??= { env: { get: () => '' } }; // db.ts reads Deno.env
const { stockVariants, PERM_NOTE, offSale } = await import('../stockSend.ts');
const stock = await import('../stock.ts');
const { mediaVerdict, photoNote } = await import('../mediaCheck.ts');
const { istDayStart, USD_INR } = await import('../brake.ts');
const { dailyLimit, DEFAULT_DAILY_LIMIT } = await import('../db.ts');
const { HttpError, usdOf } = await import('../http.ts');

test('stock send: every size is counted; it can be ordered at a count of zero only while in stock', () => {
  assert.deepEqual(stockVariants(['v1', 'v2'], true), [
    { id: 'v1', inventoryPolicy: 'CONTINUE', inventoryItem: { tracked: true } },
    { id: 'v2', inventoryPolicy: 'CONTINUE', inventoryItem: { tracked: true } }]);
  assert.deepEqual(stockVariants(['v1'], false), [{ id: 'v1', inventoryPolicy: 'DENY', inventoryItem: { tracked: true } }]);
  assert.deepEqual(stockVariants([], true), []);
  assert.equal(stock.PERM_NOTE, PERM_NOTE, 'stock.ts still hands out the note and retire (publish.ts imports them)');
  assert.equal(typeof stock.retire, 'function');
});

test('on sale on Shopify: a Shopify product that was not hidden or archived there, whatever the Playbook status', () => {
  const l = (status, shopify_product_id, shopify_status) => ({ status, shopify_product_id, shopify_status });
  assert.equal(offSale(l('published', 'gid://1', 'ACTIVE')), false);
  assert.equal(offSale(l('queued', 'gid://1', 'ACTIVE')), false, 'waiting to be written again, still on the store');
  assert.equal(offSale(l('failed', 'gid://1', 'ACTIVE')), false);
  assert.equal(offSale(l('skipped', 'gid://1', 'ACTIVE')), false, 'set aside while its product was archived: still on the store');
  assert.equal(offSale(l('skipped', 'gid://1', null)), false, 'not known to be off: treated as on sale');
  assert.equal(offSale(l('skipped', 'gid://1', 'DRAFT')), true, 'Remove from site');
  assert.equal(offSale(l('skipped', 'gid://1', 'ARCHIVED')), true, 'a permanent stock-out that was already archived there');
  assert.equal(offSale(l('published', null, null)), true, 'never sent to Shopify');
  assert.equal(offSale(l('skipped', null, 'DRAFT')), true);
});

test('photo check: ready → ok; still processing early → wait; failed, or not ready after 30 minutes → how many', () => {
  const at = '2026-11-13T10:00:00Z', min = (n) => Date.parse(at) + n * 60_000;
  const m = (...s) => s.map(status => ({ status }));
  assert.equal(mediaVerdict(m('READY', 'READY'), at, min(5)), 'ok');
  assert.equal(mediaVerdict([], at, min(5)), 'ok', 'a product with no media has nothing to fail');
  assert.equal(mediaVerdict(m('READY', 'PROCESSING'), at, min(5)), 'wait');
  assert.equal(mediaVerdict(m('UPLOADED'), at, min(29)), 'wait');
  assert.equal(mediaVerdict(m('READY', 'FAILED', 'FAILED'), at, min(5)), 2);
  assert.equal(mediaVerdict(m('FAILED', 'PROCESSING'), at, min(5)), 1, 'what failed is said now; the one still processing may yet arrive');
  assert.equal(mediaVerdict(m('READY', 'PROCESSING', 'UPLOADED'), at, min(31)), 2, 'not ready after half an hour counts as failed');
  assert.equal(mediaVerdict(m('FAILED', 'PROCESSING'), at, min(31)), 2);
  assert.match(photoNote(1, 5), /could not process 1 of this product's 5 photos, so the store shows it without it\./);
  assert.match(photoNote(2, 2), /2 of this product's 2 photos, so the store shows it without them\./);
  assert.match(photoNote(1, 1), /1 of this product's 1 photo,/);
});

test('daily AI limit: never saved → 500; 0 or less → none; a typed amount is kept', () => {
  assert.equal(DEFAULT_DAILY_LIMIT, 500);
  assert.deepEqual([undefined, null, '', 'abc'].map(dailyLimit), [500, 500, 500, 500]);
  assert.deepEqual([0, -5, 250, 1200.4, '750'].map(dailyLimit), [0, 0, 250, 1200, 750]);
  assert.equal(USD_INR, 95, 'the same rate the app shows AI cost with (src/playbook/format.ts)');
});

test('the AI day starts at midnight in India', () => {
  assert.equal(istDayStart(Date.parse('2026-11-13T02:15:00+05:30')), '2026-11-12T18:30:00.000Z');
  assert.equal(istDayStart(Date.parse('2026-11-12T23:59:59+05:30')), '2026-11-11T18:30:00.000Z');
  assert.equal(istDayStart(Date.parse('2026-11-13T00:00:00+05:30')), '2026-11-12T18:30:00.000Z');
  assert.equal(istDayStart(Date.parse('2026-11-12T20:54:00Z')), '2026-11-12T18:30:00.000Z', '20:54 UTC is already the 13th in India');
});

test('a failure after the model answered carries its cost; any other failure carries none', () => {
  assert.equal(usdOf(Object.assign(new HttpError(502, 'cut off'), { usd: 0.0042 })), 0.0042);
  assert.equal(usdOf(new HttpError(503, 'busy')), 0);
  assert.equal(usdOf(Object.assign(new HttpError(502, 'x'), { usd: 0 })), 0);
  assert.equal(usdOf(new Error('boom')), 0);
});
