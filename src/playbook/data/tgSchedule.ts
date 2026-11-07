// The once-a-day Telegram check, for display only. Each vendor channel has
// its own daily time (pb_vendors.tg_slot_minute, IST minute of day, given by a
// database trigger so no two channels clash) inside the overnight window
// (pb_tg_config.crawl_window_start/end). The crawler is told what is due by
// the server (pb-telegram crawler_config); these helpers mirror that rule so
// Settings and Vendors can say when a channel is next checked.
// IST = UTC+05:30 all year (no daylight saving).
const IST_MIN = 330;
const DAY = 1440;
const MIN_MS = 60_000;
/** An occurrence older than this is skipped (a crawler that was off for days catches up once). */
export const DUE_FOR_HOURS = 20;
/** The shortest window staff can save (the server checks the same). */
export const WINDOW_MIN_MINUTES = 60;

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** 0–1439 → "1:12 AM" · 0 → "12:00 AM" · 780 → "1:00 PM". */
export function minuteLabel(m: number): string {
  const v = mod(Math.round(m), DAY);
  const h = Math.floor(v / 60), mm = v % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "23:00" (an <input type="time"> value) ↔ 1380. */
export const minuteToHHMM = (m: number) => {
  const v = mod(Math.round(m), DAY);
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};
export function hhmmToMinute(s: string): number | null {
  const r = /^(\d{1,2}):(\d{2})/.exec(s.trim());
  if (!r) return null;
  const h = Number(r[1]), mm = Number(r[2]);
  return h < 24 && mm < 60 ? h * 60 + mm : null;
}

/** Minutes from start to end, crossing midnight (23:00 → 07:00 = 480). 0 when they are equal. */
export const windowLength = (start: number, end: number) => mod(end - start, DAY);
/** Where a time sits in the window, counted from its start (for sorting by time, 11 PM before 1 AM). */
export const windowOffset = (m: number, start: number) => mod(m - start, DAY);

/** Why a window cannot be saved, or null. */
export function windowProblem(start: number | null, end: number | null): string | null {
  if (start === null || end === null) return 'Pick both a start and an end time.';
  if (windowLength(start, end) < WINDOW_MIN_MINUTES) return 'Make the window at least 1 hour long.';
  return null;
}

/** The latest instant ≤ now whose IST minute of day is `slot` (the start of that minute). */
export function lastOccurrence(slot: number, now = Date.now()): number {
  const minuteStart = Math.floor(now / MIN_MS) * MIN_MS;
  const nowIst = mod(Math.floor(now / MIN_MS) + IST_MIN, DAY);
  return minuteStart - mod(nowIst - slot, DAY) * MIN_MS;
}

/** Same rule as the server: the latest occurrence is after the last check, and under 20 hours old. */
export function isDue(slot: number, checkedAt: string | null, now = Date.now()): boolean {
  const occ = lastOccurrence(slot, now);
  if (now - occ >= DUE_FOR_HOURS * 3600_000) return false;
  return checkedAt === null || occ > new Date(checkedAt).getTime();
}

/** When the channel is checked next: its latest occurrence while that is still due, else the next one. */
export function nextCheck(slot: number, checkedAt: string | null, now = Date.now()): { at: number; due: boolean } {
  const occ = lastOccurrence(slot, now);
  return isDue(slot, checkedAt, now) ? { at: occ, due: true } : { at: occ + DAY * MIN_MS, due: false };
}

/** "Tonight, 1:12 AM" style words for a time ahead: "Today, …", "Tomorrow, …" (IST days). */
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
export function upcomingLabel(at: number, slot: number, now = Date.now()): string {
  const t = minuteLabel(slot);
  if (dayKey.format(at) === dayKey.format(now)) return `Today, ${t}`;
  if (dayKey.format(at) === dayKey.format(now + DAY * MIN_MS)) return `Tomorrow, ${t}`;
  return t;
}
