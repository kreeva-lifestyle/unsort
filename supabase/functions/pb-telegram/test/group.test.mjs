// node --test --experimental-strip-types supabase/functions/pb-telegram/test/
// Fixtures follow the KUMARI_ART post shape: albums of photos, 1–2 videos, one
// long text, sometimes "200 Less", then a pointing-hand separator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDescription, lessOf, plan, DESC_WAIT_MS, QUIET_MS, NO_DESC_MS, SETTLE_MS } from '../group.ts';

const T0 = Date.parse('2026-11-07T06:00:00Z');
const DESC = 'LEHENGA CHOLI COLLECTIONS\nCODE :- KA-5070\nLEHENGA :- Georgette\nSIZE :- 42\nCOLOUR :- 2\nWEIGHT :- 1.2 kg\nRATE :- 1600/-INR';
let seq = 0;
function feed(chat, startMid, items, t = T0) {
  let mid = startMid;
  return items.map(([kind, text = '', album = null]) => ({ id: ++seq, chat, mid: mid++, kind, text, album, at: t + (mid - startMid) * 1000 }));
}
const photos = (n, album, caption = '') => Array.from({ length: n }, (_, i) => ['photo', i === 0 ? caption : '', album]);
const ids = (msgs, from, to) => msgs.slice(from, to).map(m => m.id);

test('classifiers', () => {
  assert.equal(lessOf('200 Less'), 200);
  assert.equal(lessOf('200/- less'), 200);
  assert.equal(lessOf('Less Rs. 1,200'), 1200);
  assert.equal(lessOf('less ₹150'), 150);
  assert.equal(lessOf('👉'), null);
  assert.equal(lessOf('Less is more, rate 1600 for everyone in the shop'), null); // long text is not a Less
  assert.ok(isDescription(DESC));
  assert.ok(isDescription('Rate 999'));
  assert.ok(isDescription('Rs1600'));
  assert.ok(!isDescription('New colours'));
  assert.ok(!isDescription('👉👉'));
});

test('KUMARI_ART: 2 albums + 2 videos + description + Less + separator, then the next product', () => {
  const a = feed(-1001, 100, [...photos(10, 'g1'), ...photos(10, 'g2'), ['video'], ['video'], ['text', DESC], ['text', '200 Less'], ['other'], ...photos(3, 'g3'), ['text', 'CODE :- KA-5071 RATE :- 1800/-INR']]);
  const last = a[a.length - 1].at;
  const p1 = plan(a, last + 60_000);
  assert.equal(p1.products.length, 1, 'second product waits for its quiet time');
  const [p] = p1.products;
  assert.deepEqual(p.media, ids(a, 0, 22));
  assert.deepEqual(p.desc, [a[22].id]);
  assert.equal(p.description, DESC);
  assert.equal(p.less, 200);
  assert.deepEqual(p.lessIds, [a[23].id]);
  assert.deepEqual(p.extra, [a[24].id]);
  assert.equal(p.first, 100);
  assert.equal(p.noDescription, false);
  const p2 = plan(a.slice(25), last + QUIET_MS);
  assert.equal(p2.products.length, 1);
  assert.deepEqual(p2.products[0].media, ids(a, 25, 28));
  assert.equal(p2.products[0].less, null);
  assert.equal(p2.products[0].first, 125);
});

test('description not yet 3 minutes old → nothing yet', () => {
  const a = feed(-1001, 1, [...photos(4, 'g'), ['text', DESC]]);
  assert.equal(plan(a, a[4].at + QUIET_MS - 1).products.length, 0);
  assert.equal(plan(a, a[4].at + QUIET_MS).products.length, 1);
});

test('caption on the first photo: each captioned album starts a product', () => {
  const a = feed(-1002, 50, [...photos(3, 'x1', 'Code KA-1 Rate 1200/-'), ...photos(2, 'x2'), ...photos(4, 'y1', 'Code KA-2 Rate 1400/-'), ['text', '100 less']]);
  const r = plan(a, a[a.length - 1].at + QUIET_MS);
  assert.equal(r.products.length, 2);
  assert.deepEqual(r.products[0].media, ids(a, 0, 5), 'second album without caption stays with the first');
  assert.equal(r.products[0].description, 'Code KA-1 Rate 1200/-');
  assert.equal(r.products[0].less, null);
  assert.deepEqual(r.products[1].media, ids(a, 5, 9));
  assert.equal(r.products[1].less, 100);
});

test('same caption repeated on every album stays one product', () => {
  const a = feed(-1002, 1, [...photos(2, 'a', 'KA-9 rate 900'), ...photos(2, 'b', 'KA-9 rate 900')]);
  const r = plan(a, a[3].at + QUIET_MS);
  assert.equal(r.products.length, 1);
  assert.equal(r.products[0].media.length, 4);
  assert.equal(r.products[0].desc.length, 1);
});

test('photos with no description: product only after 60 minutes', () => {
  const a = feed(-1003, 7, [...photos(5, 'z')]);
  assert.equal(plan(a, a[4].at + NO_DESC_MS - 1).products.length, 0);
  const r = plan(a, a[4].at + NO_DESC_MS);
  assert.equal(r.products.length, 1);
  assert.equal(r.products[0].noDescription, true);
  assert.equal(r.products[0].description, '');
});

test('late Less after the product was created', () => {
  const a = feed(-1001, 300, [['other'], ['text', '200 Less']]);
  const r = plan(a, a[1].at + 1000);
  assert.deepEqual(r.lateLess, [{ chat: -1001, id: a[1].id, mid: 301, amount: 200 }]);
  assert.deepEqual(r.ignore, [a[0].id]);
  assert.equal(r.products.length, 0);
});

test('two channels interleaved are grouped apart', () => {
  const k = feed(-1001, 10, [...photos(2, 'k'), ['text', DESC]]);
  const s = feed(-1009, 500, [...photos(3, 's'), ['text', 'Rate 750 only']]);
  const mixed = [k[0], s[0], k[1], s[1], s[2], k[2], s[3]];
  const r = plan(mixed, Math.max(...mixed.map(m => m.at)) + QUIET_MS);
  assert.equal(r.products.length, 2);
  const byChat = Object.fromEntries(r.products.map(p => [p.chat, p]));
  assert.deepEqual(byChat[-1001].media, [k[0].id, k[1].id]);
  assert.deepEqual(byChat[-1009].media, [s[0].id, s[1].id, s[2].id]);
  assert.equal(byChat[-1009].first, 500);
});

test('text with no photos: first in the batch → late description; later → product only when priced', () => {
  const chat = feed(-1004, 1, [['text', 'Soft georgette anarkali with net dupatta, all sizes, ready stock']]);
  assert.equal(plan(chat, chat[0].at + QUIET_MS).lateDesc.length, 0, 'a lone description waits for photos first');
  const r1 = plan(chat, chat[0].at + DESC_WAIT_MS);
  assert.equal(r1.products.length, 0);
  assert.equal(r1.lateDesc.length, 1, 'assemble decides: a late description, or dropped (no rate)');
  // A greeting is never a late description: it would replace the text of the product before it.
  const hello = feed(-1004, 1, [['text', 'Good morning to all our dear customers, new stock tomorrow']]);
  const r0 = plan(hello, hello[0].at + DESC_WAIT_MS);
  assert.equal(r0.lateDesc.length, 0); assert.deepEqual(r0.ignore, [hello[0].id]); assert.equal(r0.why[hello[0].id], 'chatter');
  const later = feed(-1004, 20, [...photos(2, 'm'), ['text', DESC], ['other'], ['text', 'Good morning to all our dear customers, new stock tomorrow'], ['other'], ['text', 'Code KA-77 rate 1100/-']]);
  const r2 = plan(later, later[later.length - 1].at + DESC_WAIT_MS);
  assert.equal(r2.products.length, 2, 'the photo product, then the priced text');
  assert.deepEqual(r2.products[1].desc, [later[6].id]);
  assert.ok(r2.products[0].extra.includes(later[4].id) && r2.why[later[4].id] === 'chatter', 'a greeting between products is set aside, with why');
});

test('separator closes a description; a Less after it still belongs to it', () => {
  const a = feed(-1005, 1, [...photos(2, 'q'), ['text', DESC], ['other'], ['text', '300 less'], ...photos(1, 'r')]);
  assert.equal(plan(a, a[a.length - 1].at + 1000).products.length, 0, 'closed by the next photos: waits until they are a minute old');
  const r = plan(a, a[a.length - 1].at + SETTLE_MS);
  assert.equal(r.products.length, 1);
  assert.equal(r.products[0].less, 300);
  assert.deepEqual(r.products[0].extra, [a[3].id]);
});
