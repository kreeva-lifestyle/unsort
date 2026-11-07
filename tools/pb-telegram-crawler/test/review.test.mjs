// Review cases: the group lost mid-forward, long flood waits, the
// {group message → channel post} mapping, "restrict saving content" channels,
// and lib/telegram.mjs (timeouts, a connect that never settles, normalize).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Api } from 'telegram';
import bigInt from 'big-integer';
import { makeCrawler } from '../lib/cycle.mjs';
import { MSG } from '../lib/errors.mjs';
import { makeTelegram, normalize, within } from '../lib/telegram.mjs';
import { m, makeClock, makeFakePb, makeFakeTelegram, rpcError } from './fake.mjs';

const cfg = channels => ({ group_chat_id: -1001111111111, group_title: 'Admin', channels });
const kumari = { vendor_id: 'v1', vendor_name: 'Kumari Art', username: 'kumari_art', channel_id: null, last_id: 0 };
function setup(config) {
  const tg = makeFakeTelegram(), pb = makeFakePb(config), clock = makeClock();
  const crawler = makeCrawler({ tg, pb, version: '1.0.0', sleep: clock.sleep, now: clock.now, log: () => {} });
  return { tg, pb, clock, crawler };
}

test('staff account removed from the group mid-forward: the post is kept, not skipped', async () => {
  const { tg, pb, crawler } = setup(cfg([kumari]));
  tg.addChannel('kumari_art', { id: -1002222222222, messages: [m(11), m(12)] });
  for (let i = 0; i < 8; i++) tg.failNext.push(rpcError('CHANNEL_PRIVATE'));
  for (let i = 0; i < 8; i++) await crawler.cycle();
  const r = pb.reports.at(-1);
  assert.equal(r.channels[0].last_id, 0, 'cursor stays before message 11');
  assert.equal(r.error, MSG.groupOrChannel);
  await crawler.cycle();
  assert.deepEqual(tg.forwards.map(f => f.ids), [[11], [12]]);
  assert.equal(pb.reports.at(-1).error, null);
});

test('a long flood wait while forwarding pauses every channel without skipping', async () => {
  const { tg, pb, crawler, clock } = setup(cfg([kumari, { ...kumari, vendor_id: 'v2', username: 'sita_art' }]));
  tg.addChannel('kumari_art', { id: -1002222222222, messages: [m(1)] });
  tg.addChannel('sita_art', { id: -1003333333333, messages: [m(5)] });
  tg.failNext.push(rpcError('FLOOD', { seconds: 3600 }));
  const t0 = clock.now();
  await crawler.cycle();
  assert.ok(clock.now() - t0 < 60_000, 'the cycle does not sleep the hour');
  assert.equal(tg.forwards.length, 0, 'the other channel waits too');
  assert.match(pb.reports.at(-1).error, /slow down for 60 min/);
  clock.advance(3601_000);
  await crawler.cycle();
  assert.deepEqual(tg.forwards.map(f => f.ids), [[1], [5]]);
});

test('each forward reports which channel post the new group message is', async () => {
  const { tg, pb, crawler } = setup(cfg([kumari]));
  tg.addChannel('kumari_art', { id: -1002222222222, messages: [m(1, 'g'), m(2, 'g'), m(3)] });
  await crawler.cycle();
  const sent = pb.reports.flatMap(r => r.forwarded || []);
  assert.deepEqual(sent, [
    { group_message_id: 9001, channel_id: -1002222222222, message_id: 1 },
    { group_message_id: 9002, channel_id: -1002222222222, message_id: 2 },
    { group_message_id: 9003, channel_id: -1002222222222, message_id: 3 },
  ]);
});

test('mappings survive a failed report and go with the next one', async () => {
  const { tg, pb, crawler } = setup(cfg([kumari]));
  tg.addChannel('kumari_art', { id: -1002222222222, messages: [m(1)] });
  const ok = pb.progress;
  pb.progress = async () => { throw new Error('offline'); };
  await crawler.cycle();
  pb.progress = ok;
  await crawler.report();
  assert.deepEqual(pb.reports.at(-1).forwarded, [{ group_message_id: 9001, channel_id: -1002222222222, message_id: 1 }]);
});

test('a channel that restricts saving content is not forwarded; the error says so', async () => {
  const { tg, pb, crawler } = setup(cfg([kumari]));
  tg.addChannel('kumari_art', { id: -1002222222222, messages: [m(1), m(2)], noforwards: true });
  await crawler.cycle();
  assert.equal(tg.forwards.length, 0);
  assert.equal(pb.reports.at(-1).channels[0].error, 'This channel blocks forwarding');
  assert.equal(pb.reports.at(-1).channels[0].last_id, 2);
});

test('within(): a call that never settles becomes a TIMEOUT error', async () => {
  await assert.rejects(within(new Promise(() => {}), 20, 'x'), e => e.errorMessage === 'TIMEOUT');
  assert.equal(await within(Promise.resolve(7), 20), 7);
});

test('connect(): a client whose connect never settles, or comes back unconnected, rejects', async () => {
  const stuck = { connect: () => new Promise(() => {}), connected: false };
  const tg1 = makeTelegram({ makeClient: () => stuck });
  const t = Date.now();
  const orig = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...a) => orig(fn, Math.min(ms, 30), ...a); // no 90 s wait in tests
  try {
    await assert.rejects(tg1.connect(), e => e.errorMessage === 'TIMEOUT');
    const tg2 = makeTelegram({ makeClient: () => ({ connect: async () => false, connected: false }) });
    await assert.rejects(tg2.connect(), e => e.errorMessage === 'TIMEOUT');
  } finally { globalThis.setTimeout = orig; }
  assert.ok(Date.now() - t < 5000);
});

test('normalize(): real GramJS messages → id, album id, service flag, oldest first', () => {
  const list = [
    new Api.Message({ id: 12, peerId: new Api.PeerChannel({ channelId: bigInt(1) }), message: 'x', date: 1, groupedId: bigInt('13579') }),
    new Api.MessageService({ id: 11, peerId: new Api.PeerChannel({ channelId: bigInt(1) }), date: 1, action: new Api.MessageActionChatJoinedByLink({ inviterId: bigInt(2) }) }),
    new Api.Message({ id: 10, peerId: new Api.PeerChannel({ channelId: bigInt(1) }), message: 'y', date: 1 }),
  ];
  assert.deepEqual(normalize(list), [
    { id: 10, groupedId: null, service: false },
    { id: 11, groupedId: null, service: true },
    { id: 12, groupedId: '13579', service: false },
  ]);
});
