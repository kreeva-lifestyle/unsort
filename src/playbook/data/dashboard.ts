// Playbook dashboard counts — head-only count queries (no rows fetched). Listings are
// counted per website in four groups. A pb_ count RPC would do this in one
// round trip once there are many websites. Listings of archived products are
// not counted: the Products list these tiles open never shows archived products.
import { supabase } from '../../lib/supabase';
import type { PbListingStatus, PbProductStatus } from '../types';
import { DEFAULT_DAILY_LIMIT } from './settings';

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

/** Published listings that carry a note (a photo Shopify could not process, a field it refused, no stock on a Track-stock website). */
export const notedTotal = () => count(listings().eq('status', 'published').not('error', 'is', null));

/** When the listing that has waited longest for approval was written; null when none waits. */
export async function oldestReview(): Promise<string | null> {
  const { data, error } = await supabase.from('pb_listings').select('updated_at,pb_products!inner(status)').eq('status', 'review')
    .neq('pb_products.status', 'archived').order('updated_at').limit(1);
  if (error) throw error;
  return (data?.[0] as { updated_at: string } | undefined)?.updated_at ?? null;
}

/** Is automation paused, what is the day's AI limit (₹; 0 = none) and when did the worker last run (null = never recorded)? */
export async function automationState(): Promise<{ paused: boolean; limit: number; lastRun: string | null }> {
  const { data, error } = await supabase.from('pb_settings').select('key,value').in('key', ['automation', 'worker']);
  if (error) throw error;
  const v = (k: string) => data?.find(r => r.key === k)?.value as Record<string, unknown> | undefined;
  const auto = v('automation'), at = v('worker')?.at;
  return { paused: !!auto?.paused, limit: typeof auto?.daily_limit_inr === 'number' ? auto.daily_limit_inr : DEFAULT_DAILY_LIMIT, lastRun: typeof at === 'string' ? at : null };
}

