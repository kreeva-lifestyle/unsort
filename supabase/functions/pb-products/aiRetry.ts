// A busy AI is not a failed try (pre-launch check, 2026-11-13, D4).
// The AI service answering "too many requests" or "overloaded", being too slow
// or being unreachable (ai.ts: HttpError 503 / 504) says nothing about the
// product. Such a failure used to count as one of the three tries, so one slow
// hour could leave a whole run Failed (listings) or in Needs info (products)
// with nothing trying them again, under a message that said "it will be tried
// again shortly". Now it is tried again (the worker's usual 5 minutes later)
// without using up a try, up to FREE_RETRIES times in a row for that item;
// after that it counts like any other failure, so nothing is retried for ever.
// The count is kept where publishing keeps Shopify's (publishParts.ts): in the
// activity log, as `temporary: true` on the 'failed' entry.
import { sel } from './db.ts';
import { HttpError } from './http.ts';
import { FREE_RETRIES } from './publishParts.ts';

/** The AI (or the network to it) was busy, slow or down: the same request can pass a little later. */
export const aiBusy = (e: unknown) => e instanceof HttpError && (e.status === 503 || e.status === 504);

export interface Tried { action: string; details: { step?: string; temporary?: boolean } | null }

/** How many times in a row, newest first, this step failed only because the AI was busy. */
export function busyRun(log: Tried[], step: string): number {
  let n = 0;
  for (const a of log) { if (a.action !== 'failed' || a.details?.step !== step || !a.details?.temporary) break; n++; }
  return n;
}

/** Is this failure free? `where` picks the item's own activity (listing_id=eq.… or product_id=eq.…&listing_id=is.null);
 *  `done` is the action logged when the step works, which ends a run of busy failures. Call it BEFORE logging this failure. */
export async function freeTry(e: unknown, where: string, step: 'generate' | 'read', done: 'generated' | 'read'): Promise<boolean> {
  if (!aiBusy(e)) return false;
  const log = await sel<Tried>(`pb_activity?${where}&action=in.(failed,${done})&select=action,details&order=created_at.desc&limit=${FREE_RETRIES + 1}`).catch(() => null);
  return !!log && busyRun(log, step) < FREE_RETRIES; // the log could not be read: count it, never retry blind
}
