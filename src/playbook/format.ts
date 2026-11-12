// Playbook number and IST date formatting (design/data-and-charts.md §7–§8).
// Always en-IN and Asia/Kolkata, whatever the device's own time zone is.
const TZ = 'Asia/Kolkata';
const int = new Intl.NumberFormat('en-IN');
const time = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** 1,00,000 */
export const count = (n: number) => int.format(n);

/** "5 Nov, 2:30 PM" (year added when it is not this year). */
export function istDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const thisYear = dayKey.format(d).slice(0, 4) === dayKey.format(new Date()).slice(0, 4);
  const date = d.toLocaleDateString('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', ...(thisYear ? null : { year: 'numeric' }) });
  return `${date}, ${time.format(d).toUpperCase()}`;
}

/** "3:40 PM" (IST). */
export const istTime = (iso: string) => time.format(new Date(iso)).toUpperCase();

/** "just now" (it sits mid-sentence: "Last seen just now") · "12 min ago" · "3 h ago" · "Yesterday, 4:10 PM" · "5 Nov, 2:30 PM". */
export function istRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const min = Math.floor((now - d.getTime()) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`;
  const yesterday = dayKey.format(new Date(now - 24 * 3600_000));
  if (dayKey.format(d) === yesterday) return `Yesterday, ${time.format(d).toUpperCase()}`;
  return istDate(iso);
}

/** Bytes → "12.4 MB" (one decimal under 100 MB). */
export const megabytes = (bytes: number | null | undefined) => {
  if (bytes == null) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb < 100 ? mb.toFixed(1) : Math.round(mb)} MB`;
};

/** Rupees for one US dollar, fixed by the owner (2026-11-12: "Set dollar rate at 95, no setting needed"). */
export const USD_INR = 95;

/** What the AI cost, in rupees: "₹0.42" · "₹12.50" · "under ₹0.01" · "—" when nothing was recorded. */
export function aiRupees(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(Number(usd))) return '—';
  const r = Number(usd) * USD_INR;
  if (r <= 0) return '₹0';
  if (r < 0.01) return 'under ₹0.01';
  return `₹${r.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The first moment of the current month in India, as an ISO time ("this month" is an IST month). */
export function istMonthStart(now = new Date()): string {
  const [y, m] = dayKey.format(now).split('-');
  return `${y}-${m}-01T00:00:00+05:30`;
}

/** The first moment of today in India, as an ISO time (the daily AI limit counts an IST day). */
export const istDayStart = (now = new Date()) => `${dayKey.format(now)}T00:00:00+05:30`;

/** "November" — the current IST month, for "AI cost in November". */
export const istMonthName = (now = new Date()) => now.toLocaleDateString('en-IN', { timeZone: TZ, month: 'long' });
