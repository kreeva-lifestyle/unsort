// Pure: the once-a-day channel checks (unit-tested in test/schedule.test.mjs).
// No I/O, no Deno APIs. IST = UTC+05:30 all year (no daylight saving).
//
// Each vendor channel has a daily time, pb_vendors.tg_slot_minute (IST minute
// of day), inside the overnight window pb_tg_config.crawl_window_start/end
// (23:00 → 07:00 by default; it may cross midnight). The times are given by
// the database (pb_vendors_tg_slot trigger → pb_tg_pick_slot, and
// pb_tg_respread_slots); pickSlot() / spread() below are their tested twins,
// kept equal to the SQL on shared fixtures.
//
// DUE (dueInfo, the single source of truth — crawler_config sends it):
//   occurrence = the latest instant <= now whose IST minute of day is the slot
//                (the start of that minute);
//   due        = the cursor is ready (the channel's newest post id is noted)
//                AND occurrence is after the last check AND after the time was
//                given (tg_slot_set_at: a vendor added or a respread in the
//                daytime waits for its next night) AND occurrence is under
//                20 hours old (a crawler that was off for days catches up
//                once, not once per missed night).
export const IST_MIN = 330;
export const DAY_MIN = 1440;
export const MIN_MS = 60_000;
export const DAY_MS = DAY_MIN * MIN_MS;
export const DUE_FOR_MS = 20 * 3600_000;
export const WINDOW_MIN = 60;
export const WINDOW_DEFAULT = { start: 1380, end: 420 };

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** Window length in minutes, crossing midnight; start = end counts as a whole day (same as pb_tg_window_len). */
export const windowLen = (start: number, end: number) => mod(end - start, DAY_MIN) || DAY_MIN;
/** Minutes from the window start (11 PM sorts before 1 AM). */
export const offsetOf = (m: number, start: number) => mod(m - start, DAY_MIN);

/** Why a window cannot be saved (same checks as pb_tg_set_window), or null. */
export function windowProblem(start: unknown, end: unknown): string | null {
  const ok = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1439;
  if (!ok(start) || !ok(end)) return 'The window times must be between 00:00 and 23:59.';
  if (mod((end as number) - (start as number), DAY_MIN) < WINDOW_MIN) return 'Make the window at least 1 hour long.';
  return null;
}

/** Twin of pb_tg_pick_slot: the middle of the largest gap between the taken times (edges = window start / end; ties → earliest). */
export function pickSlot(start: number, end: number, taken: (number | null)[]): number {
  const w = windowLen(start, end);
  const offs = taken.filter((t): t is number => t !== null).map(t => offsetOf(t, start)).filter(x => x <= w).sort((a, b) => a - b);
  let prev = 0, bestAt = 0, bestLen = -1;
  for (const o of [...offs, w]) {
    if (o - prev > bestLen) { bestLen = o - prev; bestAt = prev; }
    prev = o;
  }
  return mod(start + bestAt + Math.floor(bestLen / 2), DAY_MIN);
}

/** Twin of pb_tg_respread_slots: n channels evenly over the window, each in the middle of its equal share. */
export function spread(start: number, end: number, n: number): number[] {
  const w = windowLen(start, end);
  return Array.from({ length: n }, (_, i) => mod(start + Math.floor((w * (2 * i + 1)) / (2 * n)), DAY_MIN));
}

/** The latest instant <= now whose IST minute of day is `slot` (the start of that minute), in ms. */
export function lastOccurrence(slot: number, now: number): number {
  const minute = Math.floor(now / MIN_MS);
  return (minute - mod(minute + IST_MIN - slot, DAY_MIN)) * MIN_MS;
}

export interface SlotState { slot: number | null; checkedAt: string | null; slotSetAt: string | null; cursorReady: boolean }
export interface DueInfo { due: boolean; next_check_at: string | null; occurrence: number | null }

const ms = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

/** Whether a channel is due now, and when it is checked next (its overdue occurrence while due). */
export function dueInfo(s: SlotState, now: number): DueInfo {
  if (s.slot === null || !Number.isInteger(s.slot)) return { due: false, next_check_at: null, occurrence: null };
  const occ = lastOccurrence(s.slot, now);
  const after = Math.max(...[ms(s.checkedAt), ms(s.slotSetAt)].filter(Number.isFinite), -Infinity);
  const due = s.cursorReady && occ > after && now - occ < DUE_FOR_MS;
  return { due, next_check_at: new Date(due ? occ : occ + DAY_MS).toISOString(), occurrence: occ };
}
