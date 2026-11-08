// The once-a-day crawl against a fake Telegram and a fake Playbook: cursor
// setup without forwarding, only due channels touched, one per cycle, a
// check cut short carries on, Telegram's speed limits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCrawler } from '../lib/cycle.mjs';
import { MSG } from '../lib/errors.mjs';
import { m, svc, makeClock, makeFakePlaybook, makeFakeTelegram, rpcError } from './fake.mjs';

const ID = { kumari_art: -1002222222222, shree_art: -1003333333333, sita_art: -1004444444444 };
const ready = (username, last_id = 0, extra = {}) => ({ username, last_id, cursor_ready: true, ...extra });

function setup(channels, { backfill = 0, group } = {}) {
  const tg = makeFakeTelegram();
  const pb = makeFakePlaybook({ channels, ...(group !== undefined ? { group } : {}) });
  const clock = makeClock();
  const crawler = makeCrawler({ tg, pb, version: '1.1.0', backfill, sleep: clock.sleep, now: clock.now, log: () => {} });
  for (const c of channels) tg.addChannel(c.username, { id: ID[c.username] ?? -1009999999999, title: c.username.toUpperCase() });
  const row = u => pb.reports.at(-1).channels.find(c => c.username === u);
  return { tg, pb, clock, crawler, row };
}
const product = start => [   // 2 albums, 2 videos, description, "200 Less", separator
  ...Array.from({ length: 10 }, (_, i) => m(start + i, `a${start}`)),
  ...Array.from({ length: 10 }, (_, i) => m(start + 10 + i, `b${start}`)),
  m(start + 20), m(start + 21), m(start + 22), m(start + 23), m(start + 24),
];

test('no group linked: no Telegram call at all, the cursor stays unset', async () => {
  const { tg, pb, crawler } = setup([{ username: 'kumari_art' }], { group: null });
  tg.post('kumari_art', m(1), m(2));
  await crawler.cycle();
  assert.equal(tg.calls.resolve + tg.calls.after, 0);
  assert.equal(tg.forwards.length, 0);
  assert.equal(pb.reports.at(-1).error, MSG.waitingGroup);
  assert.equal(pb.reports.at(-1).version, '1.1.0');
  assert.equal(pb.reports.at(-1).channels[0].last_id, null);
});

test('cursor setup: notes the newest post, forwards nothing, one channel per cycle', async () => {
  const { tg, pb, crawler, row } = setup([{ username: 'kumari_art' }, { username: 'shree_art' }]);
  tg.post('kumari_art', m(1), m(2), m(3));
  tg.post('shree_art', m(7));
  await crawler.cycle();
  assert.deepEqual(row('kumari_art'), { username: 'kumari_art', channel_id: ID.kumari_art, title: 'KUMARI_ART', last_id: 3, error: null, cursor_ready: true });
  assert.equal(row('shree_art').cursor_ready, undefined, 'the second channel waits for the next cycle');
  assert.equal(pb.rows[1].cursor_ready, false);
  await crawler.cycle();
  assert.equal(row('shree_art').last_id, 7);
  assert.equal(tg.forwards.length, 0, 'old history is never copied');
  assert.equal(tg.calls.after, 0);
  assert.equal(pb.rows.every(r => r.cursor_ready), true);
  const calls = tg.calls.resolve;
  await crawler.cycle();                         // nothing due: Playbook only, no Telegram traffic
  assert.equal(tg.calls.resolve + tg.calls.after, calls);
});

test('backfill: setup starts that many messages back; they come at the first check', async () => {
  const { tg, pb, crawler, clock } = setup([{ username: 'kumari_art' }], { backfill: 3 });
  tg.post('kumari_art', m(1), m(2, 'g'), m(3, 'g'), m(4));
  await crawler.cycle();
  assert.equal(tg.forwards.length, 0);
  pb.dueNow('kumari_art', clock.now());
  await crawler.cycle();
  assert.deepEqual(tg.forwards.map(f => f.ids), [[2, 3], [4]]);
});

test('daily check: only the due channel is read; posts after the cursor in order, albums whole, paced 1.5 s', async () => {
  const { tg, pb, crawler, clock, row } = setup([ready('kumari_art', 2), ready('shree_art', 0), ready('sita_art', 0)]);
  tg.post('kumari_art', m(1), m(2), ...product(10), svc(35), ...product(40));
  tg.post('shree_art', m(1)); tg.post('sita_art', m(1));
  pb.dueNow('kumari_art', clock.now() - 60_000);
  const r = await crawler.cycle();
  assert.equal(r.checked, 'kumari_art');
  assert.deepEqual(new Set(tg.forwards.map(f => f.from)), new Set(['kumari_art']));
  assert.equal(tg.calls.resolve, 1, 'the other channels are not even looked up');
  const sizes = tg.forwards.map(f => f.ids.length);
  assert.deepEqual(sizes, [10, 10, 1, 1, 1, 1, 1, 10, 10, 1, 1, 1, 1, 1]);
  assert.deepEqual(tg.forwards.flatMap(f => f.ids), [...product(10), ...product(40)].map(x => x.id));
  assert.ok(clock.waits.filter(w => w > 0).length >= sizes.length - 1);
  assert.ok(clock.waits.every(w => w <= 1500));
  assert.equal(row('kumari_art').last_id, 64);
  assert.equal(row('kumari_art').checked, true);
  assert.equal(row('kumari_art').sent, 50);
  assert.deepEqual(pb.checks, ['kumari_art']);
  tg.post('kumari_art', m(70));                  // posted after tonight's check: waits for tomorrow
  await crawler.cycle();
  assert.equal(tg.forwards.length, sizes.length);
  assert.equal(row('kumari_art').checked, undefined);
});

test('several due: one per cycle, the one overdue longest first', async () => {
  const { tg, pb, crawler, clock } = setup([ready('kumari_art'), ready('shree_art'), ready('sita_art')]);
  for (const u of ['kumari_art', 'shree_art', 'sita_art']) tg.post(u, m(1));
  pb.dueNow('kumari_art', clock.now() - 10 * 60_000);
  pb.dueNow('shree_art', clock.now() - 30 * 60_000);
  pb.dueNow('sita_art', clock.now() - 20 * 60_000);
  for (let i = 0; i < 3; i++) { await crawler.cycle(); assert.equal(tg.forwards.length, i + 1); }
  assert.deepEqual(tg.forwards.map(f => f.from), ['shree_art', 'sita_art', 'kumari_art']);
  assert.deepEqual(pb.checks, ['shree_art', 'sita_art', 'kumari_art']);
});

test('a check cut short (dropped line) is not marked checked and carries on from the cursor', async () => {
  const { tg, pb, crawler, clock, row } = setup([ready('kumari_art')]);
  tg.post('kumari_art', m(1), m(2), m(3));
  pb.dueNow('kumari_art', clock.now());
  let n = 0;
  const orig = tg.forward;
  tg.forward = async (...a) => { if (++n === 2) throw new Error('Not connected'); return orig(...a); };
  await assert.rejects(crawler.cycle(), /Not connected/);
  assert.equal(row('kumari_art').last_id, 1);
  assert.equal(row('kumari_art').checked, undefined);
  assert.deepEqual(pb.checks, []);
  tg.forward = orig;
  await crawler.cycle();
  assert.deepEqual(tg.forwards.map(f => f.ids), [[1], [2], [3]]);
  assert.deepEqual(pb.checks, ['kumari_art']);
});

test('a restart mid-check: a new crawler resumes from the cursor Playbook kept', async () => {
  const first = setup([ready('kumari_art', 5)]);
  first.tg.post('kumari_art', m(6), m(7), m(8));
  first.pb.dueNow('kumari_art', first.clock.now());
  first.pb.rows[0].last_id = 7;                  // reported before the restart
  await first.crawler.cycle();
  assert.deepEqual(first.tg.forwards.map(f => f.ids), [[8]]);
});

test('more than 500 posts: the check runs over several cycles and is marked checked at the end', async () => {
  const { tg, pb, crawler, clock } = setup([ready('kumari_art')]);
  tg.post('kumari_art', ...Array.from({ length: 620 }, (_, i) => m(i + 1)));
  pb.dueNow('kumari_art', clock.now());
  await crawler.cycle();
  assert.equal(tg.forwards.length, 500);
  assert.deepEqual(pb.checks, []);
  await crawler.cycle();
  assert.equal(tg.forwards.length, 620);
  assert.deepEqual(pb.checks, ['kumari_art']);
  assert.equal(pb.reports.at(-1).channels[0].sent, 620);
});

test('flood wait: a short one is slept and the same album retried; a long one pauses, then resumes', async () => {
  const { tg, pb, crawler, clock } = setup([ready('kumari_art'), ready('shree_art')]);
  tg.post('kumari_art', m(1, 'g'), m(2, 'g'), m(3), m(4));
  tg.post('shree_art', m(1));
  pb.dueNow('kumari_art', clock.now() - 60_000);
  pb.dueNow('shree_art', clock.now());
  tg.failNext.push(rpcError('FLOOD', { seconds: 42 }));
  let fwd = 0;
  const orig = tg.forward;
  tg.forward = async (...a) => { if (++fwd === 3) throw rpcError('FLOOD', { seconds: 3600 }); return orig(...a); };
  await crawler.cycle();
  assert.ok(clock.waits.includes(43_000));
  assert.deepEqual(tg.forwards.map(f => f.ids), [[1, 2]], 'after the long wait nothing more is sent');
  assert.match(pb.reports.at(-1).error, /slow down for 60 min/);
  assert.deepEqual(pb.checks, []);
  await crawler.cycle();                         // still paused: no channel is touched
  assert.equal(tg.forwards.length, 1);
  tg.forward = orig;
  clock.advance(3601_000);
  await crawler.cycle();
  await crawler.cycle();
  assert.deepEqual(tg.forwards.map(f => f.ids), [[1, 2], [3], [4], [1]]);
  assert.deepEqual(pb.checks, ['kumari_art', 'shree_art']);
});

test('a "checked" that Playbook did not get is sent again, without checking the channel twice', async () => {
  const { tg, pb, crawler, clock } = setup([ready('kumari_art')]);
  tg.post('kumari_art', m(1));
  pb.dueNow('kumari_art', clock.now());
  pb.failNextReports(1);
  await crawler.cycle();
  assert.deepEqual(pb.checks, []);
  const after = tg.calls.after;
  await crawler.cycle();
  assert.deepEqual(pb.checks, ['kumari_art']);
  assert.equal(tg.calls.after, after, 'not read again');
});

