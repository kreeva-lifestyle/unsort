// The Urgent flag's shared logic: the chip's text, the sort, the line a
// shared message carries, and the one write (set_urgent RPC — flags or
// clears, checks the role and that the record is still live, writes the
// audit row). Pure except setUrgent.
import { supabase } from './supabase';
import { fileDate } from './exportName';
import type { Urgent, UrgentModule } from '../types/urgency';

const DAY = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' });
/** "02 Nov" from a yyyy-mm-dd date. */
export const dayText = (d: string) => DAY.format(new Date(`${d.slice(0, 10)}T00:00:00`));
/** Whole days from today (IST) to a date; negative when it has passed. */
export const daysTo = (d: string, today = fileDate()) => Math.round((Date.parse(`${d.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);

/** What the chip says — "URGENT", "URGENT · by 02 Nov", "URGENT · today", "URGENT · 3 d past" — or null when the row is not urgent. */
export function urgentLabel(row: Urgent, today = fileDate()): { text: string; past: boolean } | null {
  if (!row.is_urgent) return null;
  if (!row.urgent_by) return { text: 'URGENT', past: false };
  const n = daysTo(row.urgent_by, today);
  if (n > 0) return { text: `URGENT · by ${dayText(row.urgent_by)}`, past: false };
  if (n === 0) return { text: 'URGENT · today', past: false };
  return { text: `URGENT · ${-n} d past`, past: true };
}

/** Urgent rows first, everything else in the order it came (stable). */
export const urgentFirst = <R extends Urgent>(rows: R[]): R[] => rows.slice().sort((a, b) => Number(b.is_urgent) - Number(a.is_urgent));

/** The line a WhatsApp message / statement carries: the flag and the date go out, the reason stays in-house. */
export const urgentLine = (row: { is_urgent?: boolean | null; urgent_by?: string | null }): string | null =>
  row.is_urgent ? `*URGENT*${row.urgent_by ? ` — needed by ${dayText(row.urgent_by)}` : ''}` : null;

/** Flag (on = true, with an optional reason ≤ 120 chars and needed-by date) or clear (on = false). Returns the Supabase result for the caller to toast. */
export const setUrgent = (module: UrgentModule, id: string, on: boolean, reason?: string | null, by?: string | null) =>
  supabase.rpc('set_urgent', { p_module: module, p_id: id, p_on: on, p_reason: (on && reason?.trim()) || null, p_by: (on && by) || null });
