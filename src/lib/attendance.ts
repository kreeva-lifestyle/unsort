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
};

export type AttEntry = {
  id: string; employee_id: string; date: string; day: string | null;
  shift_id: string | null; in_time: string | null; out_time: string | null;
  location_in: string | null; location_out: string | null;
  status: string | null; remarks: string | null; manager_remarks: string | null;
};

export type AttPenalty = { id: string; employee_id: string; month: string; amount: number; reason: string | null };

// One flag row per employee per month = "salary paid". month is first-of-month.
export type AttSalaryPayment = { id: string; employee_id: string; month: string; paid_at: string; paid_by: string | null };

export type DayBreakdown = {
  date: string; day: string; in_time: string | null; out_time: string | null;
  workedMin: number; diffMin: number; // worked − fixed (negative = short)
  dayPay: number; isSunday: boolean; status: string;
};

export type MonthlySalary = {
  employeeId: string; name: string; salary: number; fixTimeMinutes: number;
  daysInMonth: number; workDays: number; sundays: number; leaveDays: number;
  totalWorkedMinutes: number; perDaySalary: number; perHourSalary: number;
  // extraMinutes / shortMinutes: month totals of time worked beyond / below
  // the fixed day, summed separately (a +2h day and a −2h day are both
  // visible instead of cancelling out). Pay is hourly, so these are already
  // reflected in `earned` — they exist so extra time can be shown everywhere.
  extraMinutes: number; shortMinutes: number;
  earned: number; sundayPay: number; gross: number; penaltyTotal: number;
  finalSalary: number; days: DayBreakdown[];
};

// ── Time helpers ─────────────────────────────────────────────────────────────
// "9:52", "09:52:00", "18:26" → minutes since midnight; null on garbage.
export const timeToMinutes = (t: string | null | undefined): number | null => {
  if (!t) return null;
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
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
  entries: AttEntry[], // this employee's entries for the month
  monthISO: string,
  penalties: AttPenalty[], // this employee's penalties for the month
): MonthlySalary => {
  const dim = daysInMonth(monthISO);
  const sundays = sundaysInMonth(monthISO);
  const fixMin = emp.fix_time_minutes > 0 ? emp.fix_time_minutes : 510;
  const perDay = emp.salary / dim;
  const perHour = perDay / (fixMin / 60);

  const byDate = new Map(entries.map(e => [e.date, e]));
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
    let status = e?.status || (isSunday ? 'WO' : (inMin !== null && outMin !== null ? 'P' : 'A'));

    if (isSunday) {
      // Paid weekly off — hours on a Sunday are not paid on top (matches the
      // original script, which skipped Sunday rows after counting them).
      dayPay = perDay;
      status = e?.status || 'WO';
    } else if (inMin !== null && outMin !== null && outMin > inMin) {
      workedMin = outMin - inMin;
      dayPay = perHour * (workedMin / 60);
      workDays++;
      totalWorkedMinutes += workedMin;
      earned += dayPay;
      const diff = workedMin - fixMin;
      if (diff > 0) extraMinutes += diff; else shortMinutes += -diff;
    }
    days.push({
      date: dateISO,
      day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][jsDay],
      in_time: e?.in_time || null, out_time: e?.out_time || null,
      workedMin, diffMin: isSunday ? 0 : (workedMin > 0 ? workedMin - fixMin : 0),
      dayPay, isSunday, status,
    });
  }

  // Weekly-offs (Sundays) are paid only if the employee actually worked at
  // least one day that month. Otherwise a fully-absent (or newly-added,
  // no-attendance) employee would be paid for every Sunday despite doing no
  // work. When unpaid, zero the per-day Sunday amounts too so the payslip
  // breakdown stays consistent with the total.
  let sundayPay = sundays * perDay;
  if (workDays === 0) {
    sundayPay = 0;
    for (const d of days) if (d.isSunday) d.dayPay = 0;
  }
  const gross = earned + sundayPay;
  const penaltyTotal = penalties.reduce((s, p) => s + Number(p.amount), 0);
  const finalSalary = Math.round(gross - penaltyTotal); // rounded to the rupee
  const leaveDays = dim - sundays - workDays;

  return {
    employeeId: emp.id, name: emp.name, salary: emp.salary, fixTimeMinutes: fixMin,
    daysInMonth: dim, workDays, sundays, leaveDays, totalWorkedMinutes, extraMinutes, shortMinutes,
    perDaySalary: Math.round(perDay * 100) / 100, perHourSalary: Math.round(perHour * 100) / 100,
    earned: Math.round(earned * 100) / 100, sundayPay: Math.round(sundayPay * 100) / 100,
    gross: Math.round(gross * 100) / 100, penaltyTotal: Math.round(penaltyTotal * 100) / 100,
    finalSalary, days,
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
    const min = Math.round((v % 1) * 24 * 60);
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  }
  const min = timeToMinutes(String(v));
  return min === null ? null : `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
};
