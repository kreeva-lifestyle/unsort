// The once-a-day crawl, problem cases: a failing channel waits (others go
// ahead), a message that keeps failing, blocked forwarding, private / unknown
// channels, the admin group, id-only channels, a long flood wait while reading.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECK_RETRY_MS, makeCrawler } from '../lib/cycle.mjs';
import { MSG } from '../lib/errors.mjs';
import { m, makeClock, makeFakePlaybook, makeFakeTelegram, rpcError } from './fake.mjs';

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

test('a channel whose check fails waits a few minutes: the next due channel goes ahead', async () => {
  const { tg, pb, crawler, clock, row } = setup([ready('kumari_art'), ready('shree_art')]);
  tg.post('kumari_art', m(1)); tg.post('shree_art', m(1));
  pb.dueNow('kumari_art', clock.now() - 60_000);
  pb.dueNow('shree_art', clock.now());
  tg.failNext.push(rpcError('MEDIA_INVALID'));
  await crawler.cycle();
  assert.match(row('kumari_art').error, /MEDIA_INVALID/);
  await crawler.cycle();
  assert.deepEqual(tg.forwards, [{ from: 'shree_art', ids: [1] }]);
  clock.advance(CHECK_RETRY_MS);
  await crawler.cycle();
  assert.deepEqual(pb.checks, ['shree_art', 'kumari_art']);
  assert.equal(row('kumari_art').error, null);
});

test('a message that keeps failing is skipped after 10 tries over 6 hours, with a note', async () => {
  const { tg, pb, crawler, clock, row } = setup([ready('kumari_art')]);
  tg.post('kumari_art', m(1), m(2));
  pb.dueNow('kumari_art', clock.now());
  for (let i = 0; i < 11; i++) tg.failNext.push(rpcError('MEDIA_INVALID'));
  for (let i = 0; i < 10; i++) { await crawler.cycle(); clock.advance(CHECK_RETRY_MS); }
  assert.equal(row('kumari_art').last_id, 0, '10 quick failures are not enough');
  clock.advance(6 * 3600_000);
  await crawler.cycle();
  assert.match(row('kumari_art').error, /Skipped message 1/);
  assert.deepEqual(tg.forwards.map(f => f.ids), [[2]]);
  assert.deepEqual(pb.checks, ['kumari_art']);
});

test('channel that blocks forwarding: its posts are skipped with a note, the check still counts', async () => {
  const { tg, pb, crawler, clock, row } = setup([ready('kumari_art')]);
  tg.channels.get('kumari_art').blocked = true;
  tg.post('kumari_art', m(1), m(2), m(3));
  pb.dueNow('kumari_art', clock.now());
  await crawler.cycle();
  assert.equal(row('kumari_art').error, 'This channel blocks forwarding');
  assert.equal(row('kumari_art').last_id, 3);
  assert.deepEqual(pb.checks, ['kumari_art']);
  tg.channels.get('kumari_art').blocked = false;   // turned back on: tomorrow's post flows
  tg.post('kumari_art', m(4));
  pb.dueNow('kumari_art', clock.now());
  await crawler.cycle();
  assert.equal(row('kumari_art').error, null);
  assert.deepEqual(tg.forwards.at(-1), { from: 'kumari_art', ids: [4] });
});

test('private / unknown channel: plain error, looked up again only after a wait', async () => {
  const { tg, pb, crawler, clock, row } = setup([{ username: 'kumari_art' }, { username: 'nobody_here' }]);
  tg.channels.get('kumari_art').priv = true;
  tg.channels.delete('nobody_here');
  await crawler.cycle();
  await crawler.cycle();
  assert.equal(row('kumari_art').error, 'Join this channel from the staff account');
  assert.match(row('nobody_here').error, /No Telegram channel called @nobody_here/);
  const before = tg.calls.resolve;
  await crawler.cycle();
  assert.equal(tg.calls.resolve, before);        // not hammering Telegram
  clock.advance(11 * 60_000);
  tg.channels.get('kumari_art').priv = false;
  await crawler.cycle();
  assert.equal(row('kumari_art').error, null);
  assert.equal(pb.rows[0].cursor_ready, true);
});

test('staff account not in the group, or not allowed to post: global error, cursor kept', async () => {
  const { tg, pb, crawler, clock, row } = setup([ready('kumari_art')]);
  tg.post('kumari_art', m(1));
  pb.dueNow('kumari_art', clock.now());
  tg.setGroup(false);
  await crawler.cycle();
  assert.equal(pb.reports.at(-1).error, MSG.groupMissing);
  tg.setGroup(true);
  tg.failNext.push(rpcError('CHAT_WRITE_FORBIDDEN'));
  await crawler.cycle();
  assert.equal(pb.reports.at(-1).error, MSG.groupCantPost);
  assert.equal(row('kumari_art').last_id, 0);
  await crawler.cycle();
  assert.deepEqual(tg.forwards, [{ from: 'kumari_art', ids: [1] }]);
  assert.equal(pb.reports.at(-1).error, null);
});

test('channel known only by id, and channels removed in Playbook drop out', async () => {
  const tg = makeFakeTelegram(), clock = makeClock();
  const pb = makeFakePlaybook({ channels: [{ username: null, channel_id: -1005555555555, last_id: 7, cursor_ready: true, due: true }] });
  tg.addChannel('anon', { id: -1005555555555, title: 'Anon Vendor', messages: [m(7), m(8)] });
  const crawler = makeCrawler({ tg, pb, version: '1.1.0', sleep: clock.sleep, now: clock.now, log: () => {} });
  await crawler.cycle();
  assert.deepEqual(tg.forwards.map(f => f.ids), [[8]]);
  assert.equal(pb.reports.at(-1).channels[0].title, 'Anon Vendor');
  pb.rows.length = 0;
  await crawler.cycle();
  assert.deepEqual(pb.reports.at(-1).channels, []);
});

test('a long flood wait while reading a channel pauses only that channel', async () => {
  const { tg, pb, crawler, clock, row } = setup([ready('kumari_art')]);
  tg.post('kumari_art', m(1));
  pb.dueNow('kumari_art', clock.now());
  const orig = tg.after;
  tg.after = async () => { throw rpcError('FLOOD', { seconds: 300 }); };
  await crawler.cycle();
  assert.match(row('kumari_art').error, /slow down for 5 min/);
  tg.after = orig;
  await crawler.cycle();                        // still inside the wait: not read
  assert.equal(tg.forwards.length, 0);
  clock.advance(301_000);
  await crawler.cycle();
  assert.deepEqual(tg.forwards.map(f => f.ids), [[1]]);
  assert.equal(row('kumari_art').error, null);
});
