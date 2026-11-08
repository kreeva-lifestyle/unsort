// Cursor ownership between the crawler and Playbook (review regressions):
// a report before the first cycle, a cursor Playbook lost, a vendor Playbook
// reset while the crawler still held its cursor, a setup whose report failed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCrawler } from '../lib/cycle.mjs';
import { m, makeClock, makeFakePlaybook, makeFakeTelegram } from './fake.mjs';

function setup(channels) {
  const tg = makeFakeTelegram();
  const pb = makeFakePlaybook({ channels });
  const clock = makeClock();
  const make = () => makeCrawler({ tg, pb, version: '1.1.0', sleep: clock.sleep, now: clock.now, log: () => {} });
  let id = -1002000000000;
  for (const c of channels) tg.addChannel(c.username, { id: id-- });
  return { tg, pb, clock, make, crawler: make() };
}
const history = n => Array.from({ length: n }, (_, i) => m(i + 1));

test('a report before the first cycle (signed out, stopped early) sends no channel list and keeps the cursors', async () => {
  const { pb, crawler } = setup([{ username: 'kumari_art', last_id: 50, cursor_ready: true }]);
  await crawler.report('signed out');
  assert.equal(pb.reports[0].channels, undefined);
  assert.equal(pb.reports[0].error, 'signed out');
  assert.equal(pb.rows[0].last_id, 50);
  assert.equal(pb.rows[0].cursor_ready, true);
});

test('signed out, then a fresh copy: no channel is set up again and no old history is forwarded', async () => {
  const { tg, pb, clock, make, crawler } = setup([
    { username: 'aaaa_one', last_id: 900, cursor_ready: true }, { username: 'bbbb_two', last_id: 900, cursor_ready: true }]);
  tg.post('aaaa_one', ...history(905)); tg.post('bbbb_two', ...history(905));
  await crawler.report('signed out');
  const fresh = make();
  await fresh.cycle();
  assert.equal(tg.calls.resolve, 0, 'both cursors came from Playbook: nothing to set up');
  assert.deepEqual(pb.rows.map(r => r.last_id), [900, 900]);
  pb.dueNow('bbbb_two', clock.now());
  await fresh.cycle();
  assert.deepEqual(tg.forwards.flatMap(f => f.ids), [901, 902, 903, 904, 905]);
  assert.deepEqual(pb.checks, ['bbbb_two']);
});

test('Playbook lost a cursor the crawler still holds: it is reported again, not set up again', async () => {
  const { tg, pb, crawler } = setup([{ username: 'kumari_art' }]);
  tg.post('kumari_art', m(1), m(2));
  await crawler.cycle();                          // setup at 2
  pb.rows[0].last_id = null;                      // crawler_channels lost (vendor still ready)
  tg.post('kumari_art', m(3));
  const resolves = tg.calls.resolve;
  await crawler.cycle();
  assert.equal(pb.rows[0].last_id, 2, 'the posts after 2 still come at the next check');
  assert.equal(tg.calls.resolve, resolves);
});

test('Playbook reset the vendor (off and on, another channel): the held cursor is dropped and set up afresh', async () => {
  const { tg, pb, clock, crawler } = setup([{ username: 'kumari_art' }]);
  tg.post('kumari_art', m(1), m(2));
  await crawler.cycle();                          // setup at 2
  assert.equal(pb.rows[0].cursor_ready, true);
  pb.resetVendor('kumari_art');
  tg.post('kumari_art', m(3), m(4));              // posted while the vendor was off
  await crawler.cycle();
  assert.equal(pb.reports.at(-1).channels[0].cursor_ready, true);
  assert.equal(pb.rows[0].last_id, 4, 'set up again at the newest post');
  assert.equal(pb.rows[0].cursor_ready, true);
  tg.post('kumari_art', m(5));
  pb.dueNow('kumari_art', clock.now());
  await crawler.cycle();
  assert.deepEqual(tg.forwards.flatMap(f => f.ids), [5], 'posts from before the reset are never copied');
});

test('a setup whose report failed is reported again, not dropped as a reset', async () => {
  const { tg, pb, crawler } = setup([{ username: 'kumari_art' }]);
  tg.post('kumari_art', m(1), m(2));
  const real = pb.progress;
  let fail = 1;
  pb.progress = async b => { if (fail-- > 0) throw new Error('Playbook could not be reached (crawler_progress): fetch failed'); return real(b); };
  await crawler.cycle();                          // setup at 2, report lost
  assert.equal(pb.rows[0].cursor_ready, false);
  tg.post('kumari_art', m(3));
  await crawler.cycle();
  assert.equal(pb.rows[0].cursor_ready, true);
  assert.equal(pb.rows[0].last_id, 2, 'the first setup stands: post 3 comes at the first check');
});
