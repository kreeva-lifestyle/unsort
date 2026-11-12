// Which listings the worker publishes next, and the claim that makes one run the only sender of a listing
// (split out of publish.ts, which re-exports both).
import { ago, enc, nowIso, patch, sel } from './db.ts';
import { LISTING_COLS, MAX_ATTEMPTS, RETRY_MS, STALE_MS, type ListingRow } from './types.ts';

const due = () => {
  const t = ago(STALE_MS);
  return `or=(and(status.eq.publishing,or(claimed_at.is.null,claimed_at.lt.${t})),and(status.eq.failed,attempts.lt.${MAX_ATTEMPTS},updated_at.lt.${ago(RETRY_MS)}))`;
};
export const pubCandidates = (limit: number) =>
  sel<{ id: string; website_id: string }>(`pb_listings?${due()}&select=id,website_id,pb_websites!inner(active)&pb_websites.active=eq.true&order=updated_at.asc&limit=${limit}`);

export async function claimPublish(id: string, manual: boolean): Promise<ListingRow | null> {
  const t = ago(STALE_MS);
  const filter = manual
    ? `generated_at=not.is.null&or=(status.in.(review,failed,published,skipped),and(status.eq.publishing,or(claimed_at.is.null,claimed_at.lt.${t})))`
    : due();
  return (await patch<ListingRow>('pb_listings', `id=eq.${enc(id)}&${filter}`, { status: 'publishing', claimed_at: nowIso() }, LISTING_COLS))[0] ?? null;
}
