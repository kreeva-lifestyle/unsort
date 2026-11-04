// Playbook dashboard counts — head-only count queries (no rows fetched). Listings are
// counted per website in four groups. A pb_ count RPC would do this in one
// round trip once there are many websites. Listings of archived products are
// not counted: the Products list these tiles open never shows archived products.
import { supabase } from '../../lib/supabase';
import type { PbListingStatus, PbProductStatus } from '../types';

export const PRODUCT_STATUSES: PbProductStatus[] = ['new', 'reading', 'needs_info', 'ready', 'archived'];
export const LISTING_GROUPS: { id: string; label: string; statuses: PbListingStatus[]; filter: string }[] = [
  { id: 'working', label: 'In progress', statuses: ['queued', 'generating', 'publishing'], filter: 'l:queued,generating,publishing' },
  { id: 'review', label: 'Needs review', statuses: ['review'], filter: 'l:review' },
  { id: 'published', label: 'Published', statuses: ['published'], filter: 'l:published' },
  { id: 'failed', label: 'Failed', statuses: ['failed'], filter: 'l:failed' },
];

/** Head-only count of listings whose product is not archived. */
const listings = () => supabase.from('pb_listings')
  .select('id,pb_products!inner(status)', { count: 'exact', head: true }).neq('pb_products.status', 'archived');

const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
  const { count: n, error } = await q;
  if (error) throw error;
  return n ?? 0;
};

export async function productCounts(): Promise<Record<PbProductStatus, number>> {
  const ns = await Promise.all(PRODUCT_STATUSES.map(s =>
    count(supabase.from('pb_products').select('id', { count: 'exact', head: true }).eq('status', s))));
  return Object.fromEntries(PRODUCT_STATUSES.map((s, i) => [s, ns[i]])) as Record<PbProductStatus, number>;
}

/** { [website_id]: { working, review, published, failed } } */
export async function listingCounts(siteIds: string[]): Promise<Record<string, Record<string, number>>> {
  const jobs = siteIds.flatMap(w => LISTING_GROUPS.map(g => ({ w, g: g.id,
    q: count(listings().eq('website_id', w).in('status', g.statuses)) })));
  const ns = await Promise.all(jobs.map(j => j.q));
  const out: Record<string, Record<string, number>> = {};
  jobs.forEach((j, i) => { (out[j.w] ??= {})[j.g] = ns[i]; });
  return out;
}

export const listingTotal = (status: PbListingStatus) => count(listings().eq('status', status));
