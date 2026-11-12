// A revert took back a bulk send while some of its listings were already on
// their store (pb_bulk_revert_send marks them pb_listings.unpublish_due).
// Hiding a product on Shopify is one call per listing, so the worker does it,
// about ten a minute, as its second step: for every website, on or off, and
// also while automation is paused (a person asked for it). Each one goes
// through unpublish.ts — the same "Remove from site": the listing is set
// aside, the Shopify product becomes a draft, nothing is deleted — and then
// carries the REVERTED note; "Put back on site" on its page lists it again.
// A store that cannot be reached is tried once a run and again 5 minutes
// later, for as long as it takes; the listing stays live, and marked, till then.
import { REVERTED } from './bulkLog.ts';
import { ago, enc, nowIso, patch, sel } from './db.ts';
import { HttpError, plain } from './http.ts';
import { unpublish } from './unpublish.ts';

const RETRY_MS = 5 * 60_000;

export async function takeOffDue(limit: number, inTime: () => boolean, userId: string | null): Promise<number> {
  let n = 0;
  const down = new Set<string>(); // a store that just failed: its other listings wait for the next run
  for (let pass = 0; pass < 3 && n < limit && inTime(); pass++) {
    const failedBefore = down.size;
    const rows = await sel<{ id: string; website_id: string }>(`pb_listings?unpublish_due=eq.true&or=(unpublish_tried_at.is.null,unpublish_tried_at.lt.${ago(RETRY_MS)})`
      + `${down.size ? `&website_id=not.in.(${[...down].map(enc).join(',')})` : ''}&select=id,website_id&order=unpublish_tried_at.asc.nullsfirst&limit=${limit - n}`);
    for (const l of rows) {
      if (!inTime()) break;
      if (down.has(l.website_id)) continue;
      try {
        await unpublish(l.id, userId);
        await patch('pb_listings', `id=eq.${enc(l.id)}`, { unpublish_due: false, unpublish_tried_at: null, error: REVERTED });
        n++;
      } catch (e) {
        // 409 = a run holds the listing right now (not the store's fault): it is simply tried again next time.
        if (!(e instanceof HttpError && e.status === 409)) down.add(l.website_id);
        console.error(`pb-products take off ${l.id}: ${plain(e)}`);
        await patch('pb_listings', `id=eq.${enc(l.id)}&unpublish_due=eq.true`, { unpublish_tried_at: nowIso() }).catch(w => console.error(`pb-products take off mark ${l.id}: ${plain(w)}`));
      }
    }
    if (down.size === failedBefore) break; // no store failed in this pass: nothing was skipped
  }
  return n;
}
