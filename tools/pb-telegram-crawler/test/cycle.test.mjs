import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCrawler } from '../lib/cycle.mjs';
import { MSG } from '../lib/errors.mjs';
import { m, svc, makeClock, makeFakePb, makeFakeTelegram, rpcError } from './fake.mjs';

const GROUP = -1001111111111;
const cfg = (channels, group = GROUP) => ({ group_chat_id: group, group_title: 'Admin', channels });
const kumari = { vendor_id: 'v1', vendor_name: 'Kumari Art', username: 'kumari_art', channel_id: null, last_id: null };

function setup(config, { backfill = 0 } = {}) {
  const tg = makeFakeTelegram();
  const pb = makeFakePb(config);
  const clock = makeClock();
  const lines = [];
  const crawler = makeCrawler({ tg, pb, version: '1.0.0', backfill, sleep: clock.sleep, now: clock.now, log: l => lines.push(l) });
  return { tg, pb, clock, crawler, lines };
}
const product = start => [   // 2 albums, 2 videos, description, "200 Less", separator
  ...Array.from({ length: 10 }, (_, i) => m(start + i, `a${start}`)),
  ...Array.from({ length: 10 }, (_, i) => m(start + 10 + i, `b${start}`)),
  m(start + 20), m(start + 21), m(start + 22), m(start + 23), m(start + 24),
];

test('no group linked: resolves channels, reports, forwards nothing, cursor stays unset', async () => {
  const { tg, pb, crawler } = setup(cfg([kumari], null));
  tg.addChannel('kumari_art', { id: -1002222222222, title: 'KUMARI_ART', messages: [m(1), m(2)] });
  await crawler.cycle();
  assert.equal(tg.forwards.length, 0);
  const r = pb.reports.at(-1);
  assert.equal(r.error, MSG.waitingGroup);
  assert.equal(r.version, '1.0.0');
  assert.deepEqual(r.channels, [{ username: 'kumari_art', channel_id: -1002222222222, title: 'KUMARI_ART', last_id: null, error: null }]);
});

test('first sight starts at the newest post, then forwards new posts in order with albums whole', async () => {
  const { tg, pb, crawler, clock } = setup(cfg([kumari]));
  tg.addChannel('kumari_art', { id: -1002222222222, messages: [m(1), m(2)] });
  await crawler.cycle();
  assert.equal(tg.forwards.length, 0);
  assert.equal(pb.reports.at(-1).channels[0].last_id, 2);
  assert.equal(pb.reports.at(-1).error, null);

  tg.post('kumari_art', ...product(10), svc(35), ...product(40));
  await crawler.cycle();
  const sizes = tg.forwards.map(f => f.ids.length);
  assert.deepEqual(sizes, [10, 10, 1, 1, 1, 1, 1, 10, 10, 1, 1, 1, 1, 1]);
  assert.deepEqual(tg.forwards.flatMap(f => f.ids), [...product(10), ...product(40)].map(x => x.id));
  assert.equal(pb.reports.at(-1).channels[0].last_id, 64);
  // paced: every forward after the first waited for the 1.2 s gap
  assert.ok(clock.waits.filter(w => w > 0).length >= sizes.length - 1);
  assert.ok(clock.waits.every(w => w <= 1200));

  await crawler.cycle();                         // nothing new: nothing sent twice
  assert.equal(tg.forwards.length, sizes.length);
});

test('restart: cursor comes back from Playbook, no repeat', async () => {
  const { tg, crawler } = setup(cfg([{ ...kumari, last_id: 5 }]));
  tg.addChannel('kumari_art', { id: -1002222222222, messages: [m(4), m(5), m(6, 'g'), m(7, 'g')] });
  await crawler.cycle();
  assert.deepEqual(tg.forwards.map(f => f.ids), [[6, 7]]);
});

test('backfill copies recent posts the first time', async () => {
  const { tg, crawler } = setup(cfg([kumari]), { backfill: 3 });
  tg.addChannel('kumari_art', { id: -1002222222222, messages: [m(1), m(2, 'g'), m(3, 'g'), m(4)] });
  await crawler.cycle();
  assert.deepEqual(tg.forwards.map(f => f.ids), [[2, 3], [4]]);
});

test('more than one page: an album on the page edge is sent whole', async () => {
  const { tg, crawler } = setup(cfg([{ ...kumari, last_id: 0 }]));
  const msgs = [...Array.from({ length: 98 }, (_, i) => m(i + 1)), m(99, 'e'), m(100, 'e'), m(101, 'e'), m(102)];
  tg.addChannel('kumari_art', { id: -1002222222222, messages: msgs });
  await crawler.cycle();
  assert.equal(tg.forwards.flatMap(f => f.ids).length, 102);
  assert.deepEqual(tg.forwards.find(f => f.ids.includes(99)).ids, [99, 100, 101]);
});

test('flood wait: sleeps the asked seconds and retries the same batch', async () => {
  const { tg, crawler, clock } = setup(cfg([{ ...kumari, last_id: 0 }]));
  tg.addChannel('kumari_art', { id: -1002222222222, messages: [m(1, 'g'), m(2, 'g'), m(3)] });
  tg.failNext.push(rpcError('FLOOD', { seconds: 42 }));
  await crawler.cycle();
  assert.ok(clock.waits.includes(43_000));
  assert.deepEqual(tg.forwards.map(f => f.ids), [[1, 2], [3]]);
});

test('channel that blocks forwarding: error shown, its posts skipped, others still flow', async () => {
  const other = { vendor_id: 'v2', username: 'shree', last_id: 0 };
  const { tg, pb, crawler } = setup(cfg([{ ...kumari, last_id: 0 }, other]));
  tg.addChannel('kumari_art', { id: -1002222222222, messages: [m(1), m(2), m(3)], blocked: true });
  tg.addChannel('shree', { id: -1003333333333, messages: [m(1)] });
  await crawler.cycle();
  const [k, s] = pb.reports.at(-1).channels;
  assert.equal(k.error, 'This channel blocks forwarding');
  assert.equal(k.last_id, 3);
  assert.equal(s.error, null);
  assert.deepEqual(tg.forwards, [{ from: 'shree', ids: [1] }]);
  // forwarding turned back on: the next post flows and the error clears
  tg.channels.get('kumari_art').blocked = false;
  tg.post('kumari_art', m(4));
  await crawler.cycle();
  assert.equal(pb.reports.at(-1).channels[0].error, null);
  assert.deepEqual(tg.forwards.at(-1), { from: 'kumari_art', ids: [4] });
});

test('private / unknown channel: plain error, looked up again only after a wait', async () => {
  const { tg, pb, crawler, clock } = setup(cfg([{ ...kumari }, { username: 'nobody', last_id: null }]));
  tg.addChannel('kumari_art', { id: -1002222222222, priv: true });
  await crawler.cycle();
  const [k, n] = pb.reports.at(-1).channels;
  assert.equal(k.error, 'Join this channel from the staff account');
  assert.match(n.error, /No Telegram channel called @nobody/);
  const before = tg.calls.resolve;
  await crawler.cycle();
  assert.equal(tg.calls.resolve, before);        // not hammering Telegram
  clock.advance(11 * 60_000);
  tg.channels.get('kumari_art').priv = false;
  await crawler.cycle();
  assert.equal(pb.reports.at(-1).channels[0].error, null);
});

test('staff account not in the group, or not allowed to post: global error, cursor kept', async () => {
  const { tg, pb, crawler } = setup(cfg([{ ...kumari, last_id: 0 }]));
  tg.addChannel('kumari_art', { id: -1002222222222, messages: [m(1)] });
  tg.setGroup(false);
  await crawler.cycle();
  assert.equal(pb.reports.at(-1).error, MSG.groupMissing);
  tg.setGroup(true);
  tg.failNext.push(rpcError('CHAT_WRITE_FORBIDDEN'));
  await crawler.cycle();
  assert.equal(pb.reports.at(-1).error, MSG.groupCantPost);
  assert.equal(pb.reports.at(-1).channels[0].last_id, 0);
  await crawler.cycle();
  assert.deepEqual(tg.forwards, [{ from: 'kumari_art', ids: [1] }]);
  assert.equal(pb.reports.at(-1).error, null);
});

test('network drop mid-cycle: reports what was done and throws for a reconnect', async () => {
  const { tg, pb, crawler } = setup(cfg([{ ...kumari, last_id: 0 }]));
  tg.addChannel('kumari_art', { id: -1002222222222, messages: [m(1), m(2)] });
  let n = 0;
  const orig = tg.forward;
  tg.forward = async (...a) => { if (++n === 2) throw new Error('Not connected'); return orig(...a); };
  await assert.rejects(crawler.cycle(), /Not connected/);
  assert.equal(pb.reports.at(-1).channels[0].last_id, 1);
  tg.forward = orig;
  await crawler.cycle();
  assert.deepEqual(tg.forwards.map(f => f.ids), [[1], [2]]);
});

test('a message that keeps failing is skipped after 10 cycles over 6 hours, with a note', async () => {
  const { tg, pb, crawler, clock } = setup(cfg([{ ...kumari, last_id: 0 }]));
  tg.addChannel('kumari_art', { id: -1002222222222, messages: [m(1), m(2)] });
  for (let i = 0; i < 11; i++) tg.failNext.push(rpcError('MEDIA_INVALID'));
  for (let i = 0; i < 10; i++) await crawler.cycle();
  assert.equal(pb.reports.at(-1).channels[0].last_id, 0, '10 quick failures are not enough');
  assert.match(pb.reports.at(-1).channels[0].error, /MEDIA_INVALID/);
  clock.advance(6 * 3600_000);
  await crawler.cycle();
  assert.match(pb.reports.at(-1).channels[0].error, /Skipped message 1/);
  assert.deepEqual(tg.forwards.map(f => f.ids), [[2]]);
});

test('channel known only by id, and channels removed in Playbook drop out', async () => {
  let channels = [{ vendor_id: 'v3', username: null, channel_id: -1004444444444, last_id: 7 }];
  const { tg, pb, crawler } = setup(() => cfg(channels));
  tg.addChannel('anon', { id: -1004444444444, title: 'Anon Vendor', messages: [m(7), m(8)] });
  await crawler.cycle();
  assert.deepEqual(tg.forwards.map(f => f.ids), [[8]]);
  assert.equal(pb.reports.at(-1).channels[0].title, 'Anon Vendor');
  channels = [];
  await crawler.cycle();
  assert.deepEqual(pb.reports.at(-1).channels, []);
});

test('a long flood wait while reading a channel pauses only that channel', async () => {
  const { tg, pb, crawler, clock } = setup(cfg([{ ...kumari, last_id: 0 }]));
  tg.addChannel('kumari_art', { id: -1002222222222, messages: [m(1)] });
  const orig = tg.after;
  tg.after = async () => { throw rpcError('FLOOD', { seconds: 300 }); };
  await crawler.cycle();
  assert.match(pb.reports.at(-1).channels[0].error, /slow down for 5 min/);
  tg.after = orig;
  await crawler.cycle();                        // still inside the wait: not read
  assert.equal(tg.forwards.length, 0);
  clock.advance(301_000);
  await crawler.cycle();
  assert.deepEqual(tg.forwards.map(f => f.ids), [[1]]);
  assert.equal(pb.reports.at(-1).channels[0].error, null);
});
