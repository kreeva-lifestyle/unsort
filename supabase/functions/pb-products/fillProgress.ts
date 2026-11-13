// "Let AI decide" progress for the Tags page (owner, 13 Nov 2026: "should get better clarity — do not know whether its
// completed or how much is completed, or when it will get completed. How many are remaining of the total"). The page
// showed only the newest request: "AI is filling 2 products · 0 done" while those 2 waited behind 78 of an earlier one.
// Requests started close together are one queue for the worker (oldest first), so they are shown as one batch: done of
// total, left, the pace of the last 5 minutes and the minutes that leaves; once nothing waits, done — with how many got
// their tags and how many still need a person — and when it finished.
import { overLimit } from './brake.ts';
import { countRows as count, enc, getSettings, nowIso, patch, sel } from './db.ts';

export interface FillRunRow { id: string; total: number; filled: number; left_empty: number; created_at: string; finished_at: string | null }
export interface FillProgress {
  id: string; total: number; done: number; waiting: number; filled: number; left_empty: number; created_at: string; finished_at: string | null;
  /** Requests in the batch. */ runs: number;
  /** Products done per minute over the last 5 minutes (null when nothing is waiting). */ per_min: number | null;
  /** Minutes left at that pace (null: not started yet, or done). */ eta_min: number | null;
  /** Why nothing moves while products wait: automation paused, or the day's AI limit used up. */ blocked: 'paused' | 'limit' | null;
}

/** Requests started within this of the newest one are one batch. */
export const BATCH_MS = 30 * 60_000;
const PACE_MIN = 5;

/** Pure: the newest batch of runs (and any run still open), summed. `waiting`: products still queued in the batch's open
 *  runs; `recent`: products the worker filled in the last PACE_MIN minutes. */
export function sumFill(all: FillRunRow[], waiting: number, recent: number, blocked: FillProgress['blocked'] = null): FillProgress | null {
  if (!all.length) return null;
  const newest = Math.max(...all.map(r => Date.parse(r.created_at)));
  const runs = all.filter(r => !r.finished_at || Date.parse(r.created_at) >= newest - BATCH_MS);
  const open = runs.some(r => !r.finished_at);
  const total = runs.reduce((n, r) => n + (r.total || 0), 0);
  const first = runs.reduce((a, r) => (Date.parse(r.created_at) < Date.parse(a.created_at) ? r : a));
  const last = runs.reduce((a, r) => (Date.parse(r.created_at) > Date.parse(a.created_at) ? r : a));
  const finished = open ? null : runs.map(r => r.finished_at as string).sort().slice(-1)[0] ?? null;
  const left = open ? Math.max(0, waiting) : 0;
  const perMin = open ? Math.round((recent / PACE_MIN) * 10) / 10 : null;
  return {
    id: last.id, total, done: Math.max(0, total - left), waiting: left,
    filled: runs.reduce((n, r) => n + (r.filled || 0), 0), left_empty: runs.reduce((n, r) => n + (r.left_empty || 0), 0),
    created_at: first.created_at, finished_at: finished, runs: runs.length,
    per_min: perMin, eta_min: open && left > 0 && perMin ? Math.max(1, Math.ceil(left / perMin)) : null,
    blocked: open && left > 0 ? blocked : null,
  };
}

/** The batch from the database. A run whose products are all gone from the queue (archived meanwhile) but that no tick
 *  closed is closed here — not in its first minutes: a run is created before its products are marked. */
export async function fillStatus(): Promise<FillProgress | null> {
  const rows = await sel<FillRunRow>('pb_tag_fill_runs?select=id,total,filled,left_empty,created_at,finished_at&order=created_at.desc&limit=30');
  const open = rows.filter(r => !r.finished_at);
  const queued = (ids: string[]) => (ids.length ? count(`pb_products?select=id&tag_fill_run=in.(${ids.map(enc).join(',')})&status=in.(ready,needs_info)`) : Promise.resolve(0));
  for (const r of open) {
    if (Date.parse(r.created_at) > Date.now() - 2 * 60_000 || await queued([r.id])) continue;
    r.finished_at = nowIso();
    await patch('pb_tag_fill_runs', `id=eq.${enc(r.id)}&finished_at=is.null`, { finished_at: r.finished_at });
  }
  const still = rows.filter(r => !r.finished_at).map(r => r.id);
  if (!still.length) return sumFill(rows, 0, 0);
  const [waiting, recent, auto] = await Promise.all([queued(still),
    count(`pb_activity?select=id&action=eq.tags_filled&details->>manual=eq.false&created_at=gte.${enc(new Date(Date.now() - PACE_MIN * 60_000).toISOString())}`),
    getSettings().then(s => s.automation).catch(() => null)]);
  const blocked = auto?.paused ? 'paused' : auto && await overLimit(auto.daily_limit_inr) ? 'limit' : null;
  return sumFill(rows, waiting, recent, blocked);
}
