// node --test --experimental-strip-types supabase/functions/pb-telegram/test/
// The once-a-day checks: slot picking (twin of pb_tg_pick_slot), even spreading
// (twin of pb_tg_respread_slots) and the due rule crawler_config sends.
// The SQL itself is compared on the same fixtures in schedule.sql.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, dueInfo, lastOccurrence, pickSlot, spread, windowLen, windowProblem } from '../schedule.ts';

export const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** Channels added one by one: each takes pickSlot of the ones before. */
export function addOneByOne(start, end, n) {
  const taken = [];
  for (let i = 0; i < n; i++) taken.push(pickSlot(start, end, taken));
  return taken;
}
// IST wall time → UTC ms (IST = UTC+05:30).
const ist = s => Date.parse(`${s}:00+05:30`);

test('ten channels added one by one never share a time and fill the largest gap first', () => {
  const t = addOneByOne(1380, 420, 10).map(hm);
  assert.deepEqual(t, ['03:00', '01:00', '05:00', '00:00', '02:00', '04:00', '06:00', '23:30', '00:30', '01:30']);
});

test('pickSlot: edges count, ties take the earliest gap, times outside the window are ignored', () => {
  assert.equal(pickSlot(1380, 420, []), 120 + 60);            // middle of 23:00–07:00 = 03:00
  assert.equal(pickSlot(1380, 420, [180]), 60);               // tie (4 h each side) → earlier: 01:00
  assert.equal(pickSlot(1380, 420, [1390]), 185);             // 23:10 taken → middle of 23:10–07:00 = 03:05
  assert.equal(pickSlot(1380, 420, [720]), 180);              // noon is outside the window: ignored
  assert.equal(pickSlot(60, 300, [60, 300]), 180);            // both edges taken → the middle
  assert.equal(pickSlot(1380, 420, [180, 180]), 60);          // a duplicate is harmless
  assert.equal(pickSlot(0, 0, []), 720);                      // start = end: a whole day
});

test('spread: even, centred shares in order, crossing midnight', () => {
  assert.deepEqual(spread(1380, 420, 10).map(hm), ['23:24', '00:12', '01:00', '01:48', '02:36', '03:24', '04:12', '05:00', '05:48', '06:36']);
  assert.deepEqual(spread(1380, 420, 1).map(hm), ['03:00']);
  assert.deepEqual(spread(1320, 360, 3).map(hm), ['23:20', '02:00', '04:40']);
  assert.deepEqual(spread(1380, 420, 0), []);
});

test('window rules', () => {
  assert.equal(windowLen(1380, 420), 480);
  assert.equal(windowLen(60, 120), 60);
  assert.equal(windowProblem(1380, 420), null);
  assert.equal(windowProblem(1380, 0), null);                 // 23:00 → midnight: exactly 1 hour
  assert.match(windowProblem(1380, 1439), /at least 1 hour/);
  assert.match(windowProblem(100, 130), /at least 1 hour/);
  assert.match(windowProblem(600, 600), /at least 1 hour/);
  assert.match(windowProblem(-1, 420), /between 00:00 and 23:59/);
  assert.match(windowProblem(1380, 1440), /between/);
  assert.match(windowProblem(1380.5, 420), /between/);
  assert.match(windowProblem('a', 420), /between/);
});

test('lastOccurrence: latest instant <= now at that IST minute, across midnight', () => {
  assert.equal(lastOccurrence(72, ist('2026-11-08T01:12')), ist('2026-11-08T01:12'));   // this very minute
  assert.equal(lastOccurrence(72, ist('2026-11-08T01:11')), ist('2026-11-07T01:12'));   // a minute early → yesterday
  assert.equal(lastOccurrence(1410, ist('2026-11-08T00:05')), ist('2026-11-07T23:30')); // 23:30 slot, just after midnight
  assert.equal(lastOccurrence(0, ist('2026-11-08T23:59')), ist('2026-11-08T00:00'));
  assert.equal(lastOccurrence(72, ist('2026-11-08T01:12') + 59_000), ist('2026-11-08T01:12'));
});

const st = (o = {}) => ({ slot: 72, checkedAt: null, slotSetAt: '2026-11-01T00:00:00Z', cursorReady: true, ...o });

test('due: at its time, once; not again after the check; next night after that', () => {
  const at = ist('2026-11-08T01:12');
  assert.equal(dueInfo(st(), ist('2026-11-07T05:00')).due, true, 'never checked: due at its first time (under 20 h ago)');
  assert.equal(dueInfo(st(), at - 60_000).due, false, 'yesterday 01:12 is 23 h 59 m ago: over 20 h');
  const yesterdayCheck = new Date(ist('2026-11-07T01:13')).toISOString();
  const before = dueInfo(st({ checkedAt: yesterdayCheck }), at - 60_000);
  assert.equal(before.due, false);
  assert.equal(before.next_check_at, new Date(at).toISOString());
  const d = dueInfo(st({ checkedAt: yesterdayCheck }), at + 5_000);
  assert.equal(d.due, true);
  assert.equal(d.next_check_at, new Date(at).toISOString(), 'while due, next_check_at is the overdue occurrence');
  const checked = new Date(at + 90_000).toISOString();
  const after = dueInfo(st({ checkedAt: checked }), at + 120_000);
  assert.equal(after.due, false);
  assert.equal(after.next_check_at, new Date(at + DAY_MS).toISOString());
});

test('due: an interrupted check stays due (not marked checked) until it finishes', () => {
  const at = ist('2026-11-08T01:12');
  const yesterdayCheck = new Date(ist('2026-11-07T01:20')).toISOString();
  for (const later of [60_000, 30 * 60_000, 5 * 3600_000]) assert.equal(dueInfo(st({ checkedAt: yesterdayCheck }), at + later).due, true);
});

test('due: a crawler off for days catches up once, and not when the time is over 20 h ago', () => {
  const old = '2026-11-01T00:00:00Z';
  assert.equal(dueInfo(st({ checkedAt: old }), ist('2026-11-08T09:00')).due, true);     // 01:12 was 7 h 48 m ago
  assert.equal(dueInfo(st({ checkedAt: old }), ist('2026-11-08T21:11')).due, true);     // 19 h 59 m
  const late = dueInfo(st({ checkedAt: old }), ist('2026-11-08T21:13'));                // 20 h 1 m: wait for tonight
  assert.equal(late.due, false);
  assert.equal(late.next_check_at, new Date(ist('2026-11-09T01:12')).toISOString());
});

test('due: never before the cursor is ready, nor before the first night after the time was given', () => {
  const now = ist('2026-11-08T10:00');
  assert.equal(dueInfo(st({ cursorReady: false }), now).due, false);
  // added (or respread) at 10:00 with a 01:12 time: first check tonight, not now
  const added = dueInfo(st({ slotSetAt: new Date(now - 60_000).toISOString() }), now);
  assert.equal(added.due, false);
  assert.equal(added.next_check_at, new Date(ist('2026-11-09T01:12')).toISOString());
  assert.equal(dueInfo(st({ slotSetAt: new Date(now - 60_000).toISOString() }), ist('2026-11-09T01:12')).due, true);
  assert.deepEqual(dueInfo(st({ slot: null }), now), { due: false, next_check_at: null, occurrence: null });
});
