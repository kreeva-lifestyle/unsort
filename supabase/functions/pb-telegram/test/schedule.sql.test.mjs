// The SQL slot functions against their TypeScript twins (schedule.ts), on the
// same fixtures. Needs a PostgreSQL with the pb_telegram_intake migration
// applied; skipped unless PB_TEST_PSQL holds psql connection arguments, e.g.
//   PB_TEST_PSQL="-h /tmp -p 55432 -U postgres -d tg" node --test --experimental-strip-types supabase/functions/pb-telegram/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pickSlot, spread } from '../schedule.ts';

const args = (process.env.PB_TEST_PSQL || '').split(/\s+/).filter(Boolean);
const psql = sql => execFileSync('psql', [...args, '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', sql], { encoding: 'utf8' }).trim();
const skip = args.length ? false : 'set PB_TEST_PSQL to compare with the database';

// A fixed pseudo-random sequence, so a failure can be replayed.
let seed = 7;
const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };

test('pb_tg_pick_slot = pickSlot on 300 windows and taken lists', { skip }, () => {
  const cases = Array.from({ length: 300 }, (_, i) => {
    const start = i < 100 ? 1380 : rnd(1440), end = i < 100 ? 420 : (start + 60 + rnd(1380)) % 1440;
    const taken = Array.from({ length: rnd(12) }, () => rnd(1440));
    return { start, end, taken };
  });
  const values = cases.map((c, i) => `(${i}, ${c.start}, ${c.end}, array[${c.taken.join(',')}]::integer[])`).join(',');
  const out = psql(`select string_agg(public.pb_tg_pick_slot(s, e, t)::text, ',' order by i) from (values ${values}) v(i, s, e, t)`).split(',').map(Number);
  assert.deepEqual(out, cases.map(c => pickSlot(c.start, c.end, c.taken)));
});

test('the trigger hands out the same times as adding one by one with pickSlot, and respread = spread', { skip }, () => {
  const sql = `begin;
    delete from public.pb_vendors;
    update public.pb_tg_config set crawl_window_start = 1380, crawl_window_end = 420 where id = 1;
    insert into public.pb_vendors (name, tg_username) select 'T' || g, 'tst_vendor_' || g from generate_series(1, 12) g;
    select string_agg(tg_slot_minute::text, ',' order by created_at, name) from public.pb_vendors;
    select public.pb_tg_respread_slots();
    select string_agg(tg_slot_minute::text, ',' order by ((tg_slot_minute - 1380) % 1440 + 1440) % 1440) from public.pb_vendors;
    select public.pb_tg_set_window(1320, 360);
    select string_agg(tg_slot_minute::text, ',' order by ((tg_slot_minute - 1320) % 1440 + 1440) % 1440) from public.pb_vendors;
    rollback;`;
  const lines = execFileSync('psql', [...args, '-v', 'ON_ERROR_STOP=1', '-Atq'], { input: sql, encoding: 'utf8' }).trim().split('\n');
  const [added, n, spreadOut, n2, moved] = lines;
  const taken = [];
  for (let i = 0; i < 12; i++) taken.push(pickSlot(1380, 420, taken));
  // generate_series inserts in order; created_at ties are broken by name, so sort the twin the same way
  const names = Array.from({ length: 12 }, (_, i) => `T${i + 1}`);
  const byName = names.map((nm, i) => [nm, taken[i]]).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(x => x[1]);
  assert.deepEqual(added.split(',').map(Number), byName);
  assert.equal(Number(n), 12);
  assert.deepEqual(spreadOut.split(',').map(Number), spread(1380, 420, 12));
  assert.equal(Number(n2), 12);
  assert.deepEqual(moved.split(',').map(Number), spread(1320, 360, 12));
});
