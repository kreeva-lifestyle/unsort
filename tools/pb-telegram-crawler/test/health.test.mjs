// What the crawler does when Playbook says its bot is not reading the admin group (nothing is forwarded,
// no cursor moves), when it is told to go back for posts that never arrived, and that each forward is
// reported with the time the vendor posted it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCrawler } from '../lib/cycle.mjs';
import { planBatches } from '../lib/batch.mjs';
import { m, makeClock, makeFakePlaybook, makeFakeTelegram } from './fake.mjs';

const ID = -1002222222222;
const at = (id, date, g = null) => ({ ...m(id, g), date });
function setup(lastId = 3) {
  const tg = makeFakeTelegram();
  const pb = makeFakePlaybook({ channels: [{ username: 'kumari_art', last_id: lastId, cursor_ready: true }] });
  const clock = makeClock();
  const logs = [];
  const crawler = makeCrawler({ tg, pb, version: '1.2.0', sleep: clock.sleep, now: clock.now, log: t => logs.push(t) });
  tg.addChannel('kumari_art', { id: ID, title: 'KUMARI_ART' });
  let problem = null;
  const base = pb.config;
  pb.config = async () => ({ ...(await base()), group_problem: problem });
  return { tg, pb, clock, crawler, logs, say: p => { problem = p; }, row: () => pb.reports.at(-1).channels[0] };
}

test('the bot is not reading the group: nothing is forwarded and the cursor stays; it carries on when the bot is back', async () => {
  const { tg, pb, clock, crawler, logs, say, row } = setup();
  tg.post('kumari_art', m(1), m(2), m(3), m(4), m(5));
  pb.dueNow('kumari_art', clock.now() - 1000);
  say('The bot is not in the admin group any more. Add it back as an admin: until then no vendor post is copied.');
  const r = await crawler.cycle();
  assert.equal(r.held, true); assert.equal(r.sent, 0);
  assert.equal(tg.forwards.length, 0, 'nothing goes into a group nobody is reading');
  assert.equal(row().last_id, 3, 'the cursor did not move past a post');
  assert.match(pb.reports.at(-1).error, /not in the admin group/);
  await crawler.cycle(); await crawler.cycle();
  assert.equal(logs.filter(l => l.startsWith('Waiting:')).length, 1, 'said once, not every minute');
  assert.equal(pb.checks.length, 0, 'the check is not marked done');
  say(null);
  const back = await crawler.cycle();
  assert.equal(back.sent, 2); assert.deepEqual(tg.forwards.map(f => f.ids), [[4], [5]]);
  assert.equal(pb.reports.at(-1).error, null);
  assert.deepEqual(pb.checks, ['kumari_art']);
});

test('told to go back: the cursor returns to that post, says so once, and the next check sends the posts again', async () => {
  const { tg, pb, clock, crawler, row } = setup(8);
  tg.post('kumari_art', ...[1, 2, 3, 4, 5, 6, 7, 8].map(i => m(i)));
  pb.rows[0].rewind_to = 5;                       // forwards of 6, 7, 8 never reached Playbook
  await crawler.cycle();
  assert.equal(row().last_id, 5); assert.equal(row().rewound, 5);
  assert.equal(tg.forwards.length, 0, 'not due yet: they go with the next daily check');
  delete pb.rows[0].rewind_to;                    // Playbook has noted it
  await crawler.cycle();
  assert.equal(row().rewound, undefined, 'reported once');
  assert.equal(row().last_id, 5, 'and not undone by the number Playbook holds');
  pb.dueNow('kumari_art', clock.now() - 1000);
  await crawler.cycle();
  assert.deepEqual(tg.forwards.map(f => f.ids), [[6], [7], [8]]);
  // Never forward of where it is, and junk is ignored.
  pb.rows[0].rewind_to = 99; await crawler.cycle(); assert.equal(row().last_id, 8);
  pb.rows[0].rewind_to = 'soon'; await crawler.cycle(); assert.equal(row().last_id, 8);
});

test('each forward is reported with when the vendor posted it', async () => {
  const { tg, pb, clock, crawler } = setup(0);
  tg.post('kumari_art', at(1, 1794304800, 'a'), at(2, 1794304801, 'a'), at(3, 1794308400), m(4));
  pb.dueNow('kumari_art', clock.now() - 1000);
  await crawler.cycle();
  const fwd = pb.reports.flatMap(r => r.forwarded || []);
  assert.deepEqual(fwd.map(f => [f.message_id, f.posted_at]), [[1, 1794304800], [2, 1794304801], [3, 1794308400], [4, undefined]]);
  assert.ok(fwd.every(f => f.channel_id === ID && f.group_message_id > 0));
  assert.deepEqual(planBatches([at(1, 10, 'a'), at(2, 11, 'a'), at(3, 12)], 100).units.map(u => u.dates), [[10, 11], [12]]);
});
