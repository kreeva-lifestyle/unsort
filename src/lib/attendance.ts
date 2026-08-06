// Attendance salary engine — a faithful port of the owner's Google Apps
// Script, with the additions they asked for:
//   • days-in-month is auto-computed from the calendar (was a manual column)
//   • Sundays are counted from the calendar, not from timesheet rows, so a
//     missing Sunday row can no longer silently drop a paid holiday
//   • manual penalties subtract from the gross
//   • the final salary is rounded to the rupee
//   • extra/short time vs the fixed day is totalled per month (extraMinutes /
//     shortMinutes) so overtime is visible on the timesheet, salary cards,
//     payslips and the pay screen — the hourly dayPay already pays for it
// Core math unchanged: perDay = salary / daysInMonth,
// perHour = perDay / fixedHours, each worked day pays perHour × workedHours,
// every Sunday pays perDay, leaves (absent non-Sundays) pay nothing.

export type AttEmployee = {
  id: string; employee_code: string | null; name: string;
  salary: number; fix_time_minutes: number; is_active: boolean;
  qr_image_url: string | null;
  // Last day of service (ISO date) — salary accrues up to and INCLUDING this
  // day and nothing after it. null = still employed.
  left_on: string | null;
};

export type AttEntry = {
  id: string; employee_id: string; date: string; day: string | null;
  shift_id: string | null; in_time: string | null; out_time: string | null;
  location_in: string | null; location_out: string | null;
  status: string | null; remarks: string | null; manager_remarks: string | null;
};

export type AttPenalty = { id: string; employee_id: string; month: string; amount: number; reason: string | null };

// Advance: money given ahead of payday, deducted from the SAME month's final
// salary (owner's rule) — the exact mirror of a penalty.
export type AttAdvance = { id: string; employee_id: string; month: string; amount: number; note: string | null };

// One flag row per employee per month = "salary paid". month is first-of-month.
export type AttSalaryPayment = { id: string; employee_id: string; month: string; paid_at: string; paid_by: string | null };

export type DayBreakdown = {
  date: string; day: string; in_time: string | null; out_time: string | null;
  workedMin: number; diffMin: number; // worked − fixed (negative = short)
  dayPay: number; isSunday: boolean; status: string;
};

export type MonthlySalary = {
  employeeId: string; name: string; salary: number; fixTimeMinutes: number;
  daysInMonth: number; workDays: number; sundays: number; paidSundays: number; leaveDays: number;
  totalWorkedMinutes: number; perDaySalary: number; perHourSalary: number;
  // extraMinutes / shortMinutes: month totals of time worked beyond / below
  // the fixed day, summed separately (a +2h day and a −2h day are both
  // visible instead of cancelling out). Pay is hourly, so these are already
  // reflected in `earned` — they exist so extra time can be shown everywhere.
  extraMinutes: number; shortMinutes: number;
  earned: number; sundayPay: number; gross: number; penaltyTotal: number;
  advanceTotal: number; finalSalary: number; days: DayBreakdown[];
  // Echoed back so payslips, cards and the pay kiosk can say WHY a month is
  // short (or empty) without re-reading the employee row.
  leftOn: string | null;
};

// ── Time helpers ─────────────────────────────────────────────────────────────
// "9:52", "09:52:00", "18:26", "9:52 AM", "6:26pm" → minutes since midnight;
// null on garbage. 12-hour support matters: a biometric export in AM/PM used
// to parse every punch to null, importing a whole month as unpaid absences.
export const timeToMinutes = (t: string | null | undefined): number | null => {
  if (!t) return null;
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]?\.?$|^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const ampm = m[4] ? m[4].toLowerCase() : null;
  let h = Number(ampm ? m[1] : m[5]);
  const min = Number(ampm ? m[2] : m[6]);
  if (ampm) {
    if (h < 1 || h > 12) return null;
    if (ampm === 'a') h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
  }
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
};

export const minutesToHM = (min: number): string => {
  const neg = min < 0; const v = Math.abs(Math.round(min));
  return `${neg ? '−' : ''}${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};

// Signed H:MM for worked-vs-fix diffs: "+1:30", "−0:45", "0:00".
export const fmtDiffHM = (min: number): string => (min > 0 ? '+' : '') + minutesToHM(min);

// "8:30" / "8:30:00" (the FIX TIME column) → minutes; also accepts plain hours ("8.5").
export const fixTimeToMinutes = (v: string): number | null => {
  const asTime = timeToMinutes(v);
  if (asTime !== null) return asTime;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 24 ? Math.round(n * 60) : null;
};

export const daysInMonth = (monthISO: string): number => {
  // monthISO = 'YYYY-MM'; the Indian civil calendar is Gregorian.
  const [y, m] = monthISO.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

export const sundaysInMonth = (monthISO: string): number => {
  const [y, m] = monthISO.split('-').map(Number);
  const n = daysInMonth(monthISO);
  let count = 0;
  for (let d = 1; d <= n; d++) if (new Date(y, m - 1, d).getDay() === 0) count++;
  return count;
};

export const monthFirstDay = (monthISO: string): string => `${monthISO}-01`;

// ── The engine ───────────────────────────────────────────────────────────────
export const computeMonthlySalary = (
  emp: AttEmployee,
  entries: AttEntry[], // this employee's entries for the month (MAY include a
  // few tail days of the previous month — they feed only the Sunday rule,
  // never pay: the day loop below iterates this month's calendar only)
  monthISO: string,
  penalties: AttPenalty[], // this employee's penalties for the month
  advances: AttAdvance[] = [], // this employee's advances for the month
): MonthlySalary => {
  const dim = daysInMonth(monthISO);
  const sundays = sundaysInMonth(monthISO);
  const fixMin = emp.fix_time_minutes > 0 ? emp.fix_time_minutes : 510;
  const perDay = emp.salary / dim;
  const perHour = perDay / (fixMin / 60);

  // Last day of service. Everything after it earns nothing: no hours, no
  // weekly-off pay, and it is not an unpaid "leave" either — the person simply
  // wasn't employed. A stale punch dated after the exit can't resurrect pay.
  const leftOn = emp.left_on || null;
  const served = (dateISO: string) => !leftOn || dateISO <= leftOn;

  const byDate = new Map(entries.map(e => [e.date, e]));
  // Worked DATES (ISO), including the previous month's tail: the paid-Sunday
  // rule looks 6 calendar days back, and judging a straddling week "on this
  // month only" made the FIRST Sunday of most months mathematically unpayable
  // — ₹1 perDay silently withheld from perfect-attendance employees.
  const workedDates = new Set<string>();
  for (const e of entries) {
    const i = timeToMinutes(e.in_time), o = timeToMinutes(e.out_time);
    if (i !== null && o !== null && o > i && served(e.date)) workedDates.add(e.date);
  }
  const [y, m] = monthISO.split('-').map(Number);
  const days: DayBreakdown[] = [];
  let workDays = 0, totalWorkedMinutes = 0, earned = 0, extraMinutes = 0, shortMinutes = 0;

  for (let d = 1; d <= dim; d++) {
    const dateISO = `${monthISO}-${String(d).padStart(2, '0')}`;
    const jsDay = new Date(y, m - 1, d).getDay();
    const isSunday = jsDay === 0;
    const e = byDate.get(dateISO);
    const inMin = timeToMinutes(e?.in_time);
    const outMin = timeToMinutes(e?.out_time);
    let workedMin = 0, dayPay = 0;
    // Default status must match what actually PAYS: out ≤ in (an overnight
    // punch, or garbage) earns nothing below, so labelling it 'P' showed a
    // Present day with zero pay — a silent wage discrepancy on the payslip.
    // A STORED 'P' on a non-paying weekday (cleared times, bad punch) is
    // downgraded to 'A' for the same reason.
    const inService = served(dateISO);
    const paidPunch = inService && inMin !== null && outMin !== null && outMin > inMin;
    let status = e?.status || (isSunday ? 'WO' : (paidPunch ? 'P' : 'A'));
    if (!isSunday && !paidPunch && status === 'P') status = 'A';

    if (isSunday) {
      // Weekly off. Whether the off-day PAY applies is decided in a second
      // pass below. A Sunday actually WORKED additionally pays its hours like
      // any day (owner's rule: worked hours + Sunday pay) — those hours count
      // in the month totals, but not in workDays (leave math) or extra/short.
      if (paidPunch) {
        workedMin = outMin! - inMin!;
        dayPay = perHour * (workedMin / 60);
        totalWorkedMinutes += workedMin;
        earned += dayPay;
        status = e?.status || 'POW'; // Present on Weekly Off
      } else {
        status = e?.status || 'WO';
      }
    } else if (paidPunch) {
      workedMin = outMin! - inMin!;
      dayPay = perHour * (workedMin / 60);
      workDays++;
      totalWorkedMinutes += workedMin;
      earned += dayPay;
      const diff = workedMin - fixMin;
      if (diff > 0) extraMinutes += diff; else shortMinutes += -diff;
    }
    // Past the leaving date the day is neither present nor absent — the person
    // wasn't employed. LFT keeps the payslip honest instead of printing a
    // month of fake absences (or a weekly off) after someone left.
    if (!inService) status = 'LFT';
    days.push({
      date: dateISO,
      day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][jsDay],
      in_time: e?.in_time || null, out_time: e?.out_time || null,
      workedMin, diffMin: isSunday ? 0 : (workedMin > 0 ? workedMin - fixMin : 0),
      dayPay, isSunday, status,
    });
  }

  // Paid weekly-off rule (6-day work week): a Sunday is paid only if the
  // employee worked MORE THAN 3 of that week's 6 working days — the six
  // calendar days (Mon–Sat) immediately preceding the Sunday, ACROSS the
  // month boundary (the caller fetches the previous month's tail entries).
  // On a worked Sunday the off-day pay ADDS to the hours earned above.
  const SUNDAY_MIN_ATTENDANCE = 3; // must work strictly more than this (>= 4)
  let paidSundays = 0;
  for (const day of days) {
    if (!day.isSunday || !served(day.date)) continue;
    const dNum = Number(day.date.slice(8, 10));
    let workedInWeek = 0;
    for (let k = 1; k <= 6; k++) {
      const prev = new Date(y, m - 1, dNum - k);
      const prevISO = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
      if (workedDates.has(prevISO)) workedInWeek++;
    }
    if (workedInWeek > SUNDAY_MIN_ATTENDANCE) { day.dayPay += perDay; paidSundays++; }
  }

  const sundayPay = paidSundays * perDay;
  const gross = earned + sundayPay;
  const penaltyTotal = penalties.reduce((s, p) => s + Number(p.amount), 0);
  const advanceTotal = advances.reduce((s, a) => s + Number(a.amount), 0);
  const finalSalary = Math.round(gross - penaltyTotal - advanceTotal); // rounded to the rupee
  // Leaves are counted only over days that have HAPPENED. The old
  // dim − sundays − workDays counted every remaining day of the current month
  // as a leave — opening August on the 1st showed 26 "leaves", and a payslip
  // printed mid-month carried the same fiction. Past months are unchanged
  // (every day has elapsed); a fully future month shows 0, not a full sheet
  // of absences.
  // Strict < on BOTH sides: today has begun but not finished — an employee
  // mid-shift with no out-punch yet must not read as a leave on a payslip
  // printed today, and a completed today must not cancel out a real leave.
  const now = new Date();
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  let elapsedWorkable = 0, workedBeforeToday = 0;
  for (const d of days) if (!d.isSunday && d.date < todayISO && served(d.date)) { elapsedWorkable++; if (d.workedMin > 0) workedBeforeToday++; }
  const leaveDays = Math.max(0, elapsedWorkable - workedBeforeToday);

  return {
    employeeId: emp.id, name: emp.name, salary: emp.salary, fixTimeMinutes: fixMin,
    daysInMonth: dim, workDays, sundays, paidSundays, leaveDays, totalWorkedMinutes, extraMinutes, shortMinutes,
    perDaySalary: Math.round(perDay * 100) / 100, perHourSalary: Math.round(perHour * 100) / 100,
    earned: Math.round(earned * 100) / 100, sundayPay: Math.round(sundayPay * 100) / 100,
    gross: Math.round(gross * 100) / 100, penaltyTotal: Math.round(penaltyTotal * 100) / 100,
    advanceTotal: Math.round(advanceTotal * 100) / 100, finalSalary, days, leftOn,
  };
};

// ── Excel import parsing ─────────────────────────────────────────────────────
// Handles both raw Excel cell types (date serials, time fractions) and the
// display strings from the owner's sheet ("01/06/2026", "9:52").
// Build a validated ISO date — rejects out-of-range (month>12, day>31) and
// impossible (Feb 30) dates by round-tripping, so a bad cell becomes a
// skipped row with a reason instead of poisoning the whole upsert batch.
const toISO = (y: number, mo: number, d: number): string | null => {
  if (!Number.isInteger(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

export const excelCellToDateISO = (v: unknown): string | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v > 20000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return toISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // dd/mm/yyyy (Indian sheets)
  if (m) return toISO(Number(m[3]), Number(m[2]), Number(m[1]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return toISO(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
};

export const excelCellToTime = (v: unknown): string | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v >= 0 && v < 2) { // Excel time = fraction of a day
    // % 1440: a fraction like 0.9999999 rounds to 1440 minutes — "24:00" —
    // which timeToMinutes later rejects, silently turning that punch into an
    // unpaid absence. Midnight wraps to 00:00 instead.
    const min = Math.round((v % 1) * 24 * 60) % 1440;
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  }
  const min = timeToMinutes(String(v));
  return min === null ? null : `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
};
