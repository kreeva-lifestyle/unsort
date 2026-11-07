// node --test --experimental-strip-types supabase/functions/pb-telegram/test/
// Review fixtures: description before the photos, caption on album 2 only,
// Less wording, a post forwarded twice, a batch cut short, emoji rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inlineLess, isDescription, lessOf, plan, stripLess, DESC_WAIT_MS, QUIET_MS, NO_DESC_MS, SETTLE_MS } from '../group.ts';

const T0 = Date.parse('2026-11-07T06:00:00Z');
const DESC = 'LEHENGA CHOLI COLLECTIONS\nCODE :- KA-5070\nLEHENGA :- Georgette\nSIZE :- 42\nCOLOUR :- 2\nWEIGHT :- 1.2 kg\nRATE :- 1600/-INR';
let seq = 1000;
function feed(chat, startMid, items, t = T0) {
  let mid = startMid;
  return items.map(([kind, text = '', album = null]) => ({ id: ++seq, chat, mid: mid++, kind, text, album, at: t + (mid - startMid) * 1000 }));
}
const photos = (n, album, caption = '') => Array.from({ length: n }, (_, i) => ['photo', i === 0 ? caption : '', album]);
const late = (a) => a[a.length - 1].at + QUIET_MS + SETTLE_MS;

test('Less wording', () => {
  const want = { '200 Less': 200, '200rs less': 200, 'Rs 200 less': 200, '₹200 less': 200, 'Less - 200': 200, 'Less: 200': 200,
    'less-200': 200, 'LESS 200/-': 200, '200.50 less': 200.5, '1,200/- less': 1200, 'Rate 1600 less 200': null, '1600/- less 200': null,
    '10% less': null, 'less 10%': null, '👉': null };
  for (const [s, n] of Object.entries(want)) assert.equal(lessOf(s), n, s);
  assert.equal(inlineLess('KA-1\nRATE 1600 LESS 200'), 200);
  assert.equal(inlineLess(DESC), null);
  assert.equal(stripLess('CODE KA-1\nRATE 1600 LESS 200\n200 Less\nLess: 200'), 'CODE KA-1\nRATE 1600');
});

test('a row of pointing hands is a separator, not a description', () => {
  assert.equal(isDescription('👇'.repeat(25)), false);
  assert.equal(isDescription('👉👉 ' + DESC), true);
});

test('description BEFORE its album: each text goes with the photos after it', () => {
  const a = feed(-1, 1, [['text', DESC], ...photos(10, 'a'), ['other'], ['text', DESC.replace('5070', '5071')], ...photos(4, 'b')]);
  const r = plan(a, a[a.length - 1].at + QUIET_MS);
  assert.equal(r.products.length, 2);
  assert.deepEqual(r.products.map(p => [p.media.length, p.desc.length, p.noDescription]), [[10, 1, false], [4, 1, false]]);
  assert.ok(r.products[1].description.includes('KA-5071'));
  assert.equal(r.lateDesc.length, 0, 'a description followed by its photos is not late');
});

test('KUMARI with a caption on album 2 only stays one product', () => {
  const a = feed(-2, 1, [...photos(10, 'a'), ...photos(10, 'b', 'KA-5070 Rate 1600'), ['video'], ['text', DESC], ['other']]);
  const r = plan(a, a[a.length - 1].at + QUIET_MS);
  assert.equal(r.products.length, 1);
  assert.equal(r.products[0].media.length, 21);
});

test('a description with the less inside sets the less', () => {
  const a = feed(-9, 1, [...photos(2, 'a'), ['text', 'KA-1 Rate 1600 less 200']]);
  const [p] = plan(a, a[a.length - 1].at + QUIET_MS).products;
  assert.equal(p.less, 200); assert.equal(p.noDescription, false);
});

test('a post forwarded twice counts once', () => {
  const a = feed(-3, 100, [...photos(3, 'a'), ['text', DESC]]);
  const dup = a.map(m => ({ ...m, id: ++seq, album: m.album ? 'a2' : null, at: m.at + 5000 }));
  const r = plan([...a, ...dup], dup[dup.length - 1].at + QUIET_MS);
  assert.equal(r.products.length, 1);
  assert.equal(r.products[0].media.length, 3);
  assert.equal(r.products[0].description, DESC);
  assert.deepEqual(r.ignore.sort(), dup.map(m => m.id).sort());
});

test('a batch cut short leaves that channel’s last group for the next run', () => {
  const a = feed(-6, 1, [...photos(10, 'a'), ...photos(10, 'b'), ['text', DESC]]);
  const now = a[a.length - 1].at + NO_DESC_MS + 1;
  assert.equal(plan(a.slice(0, 15), now).products.length, 1, 'without held: the cut tail would become a product');
  assert.equal(plan(a.slice(0, 15), now, new Set([-6])).products.length, 0);
});

test('a description 61 minutes after its photos comes back as a late description', () => {
  const d = feed(-5, 7, [['text', DESC], ['text', '200 Less']]);
  assert.equal(plan(d, late(d)).lateDesc.length, 0, 'still waiting: its photos may come after a pause');
  const r = plan(d, d[d.length - 1].at + DESC_WAIT_MS);
  assert.equal(r.products.length, 0);
  assert.equal(r.lateDesc.length, 1);
  assert.equal(r.lateDesc[0].less, 200);
});

test('products come oldest first across channels', () => {
  const k = feed(-9001, 1, [...photos(1, 'k'), ['text', DESC]], T0 + 60_000);
  const s = feed(-1, 1, [...photos(1, 's'), ['text', DESC]], T0 + 120_000);
  const old = feed(-500, 1, [...photos(1, 'o'), ['text', DESC]], T0);
  const r = plan([...s, ...k, ...old], T0 + 10 * QUIET_MS);
  assert.deepEqual(r.products.map(p => p.chat), [-500, -9001, -1]);
});

test('description first, its photos 10 minutes later (a daily check paused in between): one product', () => {
  const d = feed(-6, 1, [['text', 'Code KA-90 rate 1250/- pure cotton, 3 colours']]);
  const p = feed(-6, 2, photos(3, 'z'), d[0].at + 10 * 60_000);
  const mid = plan(d, d[0].at + 9 * 60_000);
  assert.equal(mid.products.length + mid.lateDesc.length + mid.ignore.length, 0, 'nothing decided while it waits');
  const r = plan([...d, ...p], p[p.length - 1].at + QUIET_MS);
  assert.equal(r.products.length, 1);
  assert.equal(r.products[0].media.length, 3);
  assert.equal(r.products[0].noDescription, false);
});
