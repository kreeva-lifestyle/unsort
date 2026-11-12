// Product Directory listings (one product on one website) + the pb_activity
// helper the product data shares. Explicit columns; errors thrown as-is —
// callers show them with friendlyError(). Contract: docs/playbook/product-directory-spec.md.
import { supabase } from '../../lib/supabase';
import { logSwallowed } from '../../lib/errorLogger';
import type { PbListing } from '../types';
import { plainError } from './plainError';
import { pbCall } from './pbFunctions';

export type ListingFull = Pick<PbListing, 'id' | 'product_id' | 'website_id' | 'status' | 'price' | 'compare_at_price' | 'title'
  | 'description_html' | 'seo_title' | 'seo_description' | 'handle' | 'tags' | 'locked' | 'error' | 'shopify_product_id'
  | 'shopify_status' | 'published_at' | 'generated_at' | 'ai_model' | 'ai_cost_usd' | 'attempts' | 'claimed_at' | 'updated_at'>;
export const LISTING_COLS = 'id,product_id,website_id,status,price,compare_at_price,title,description_html,seo_title,seo_description,handle,tags,locked,error,shopify_product_id,shopify_status,published_at,generated_at,ai_model,ai_cost_usd,attempts,claimed_at,updated_at';

/** A claim older than this is a crashed run (same as STALE_MS in the pb-products edge function). */
const STALE_MS = 5 * 60_000;
const staleIso = () => new Date(Date.now() - STALE_MS).toISOString();

/** Best-effort timeline row; a failure is logged, never shown. */
export const logPbActivity = (row: { product_id: string; action: string; listing_id?: string; website_id?: string; details?: Record<string, unknown> }) => {
  supabase.from('pb_activity').insert(row).then(({ error }) => { if (error) logSwallowed('pb_activity insert', error); });
};

/** While a run holds a listing it works from what it read at claim time — edits then would be lost or published stale.
 *  'publishing' that no run has claimed yet (waiting for the worker, or held while the site is off / automation paused) is free. */
export const listingBusy = (l: Pick<ListingFull, 'status' | 'claimed_at'>) =>
  l.status === 'generating' || (l.status === 'publishing' && !!l.claimed_at && Date.parse(l.claimed_at) > Date.now() - STALE_MS);

const emptyValue = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);

/** Save hand edits. A field given a value joins `locked` so Regenerate keeps it; a field emptied leaves `locked`,
 *  which hands it back to the AI (Regenerate fills it again, and keeps doing so). Refused while a run holds the listing. */
export async function updateListing(l: Pick<ListingFull, 'id' | 'locked' | 'product_id' | 'website_id'>, patch: Partial<ListingFull>): Promise<ListingFull> {
  const changed = Object.keys(patch).filter(k => k !== 'compare_at_price');
  const cleared = changed.filter(k => emptyValue(patch[k as keyof ListingFull]));
  const locked = Array.from(new Set([...l.locked, ...changed])).filter(k => !cleared.includes(k));
  const { data, error } = await supabase.from('pb_listings').update({ ...patch, locked })
    .eq('id', l.id).or(`status.not.in.(generating,publishing),and(status.eq.publishing,or(claimed_at.is.null,claimed_at.lt.${staleIso()}))`)
    .select(LISTING_COLS).maybeSingle();
  if (error) throw error;
  if (!data) throw plainError('This listing is being written or published right now — wait a minute, reload it and edit again.');
  logPbActivity({ product_id: l.product_id, listing_id: l.id, website_id: l.website_id, action: 'edited', details: { fields: changed } });
  return data as unknown as ListingFull;
}

export async function getListing(id: string): Promise<ListingFull> {
  const { data, error } = await supabase.from('pb_listings').select(LISTING_COLS).eq('id', id).single();
  if (error) throw error;
  return data as unknown as ListingFull;
}

/** Review → publishing (the worker publishes it within a minute, unless automation is paused).
 *  Refused for a switched-off website, as "Publish now" is. Returns whether automation is paused. */
export async function approveListing(l: Pick<ListingFull, 'id' | 'product_id' | 'website_id'>): Promise<{ paused: boolean }> {
  const [site, auto] = await Promise.all([
    supabase.from('pb_websites').select('name,active').eq('id', l.website_id).single(),
    supabase.from('pb_settings').select('value').eq('key', 'automation').maybeSingle(),
  ]);
  if (site.error) throw site.error;
  if (auto.error) throw auto.error;
  if (!site.data.active) throw plainError(`${site.data.name} is switched off — turn it on in Websites first.`);
  const { data, error } = await supabase.from('pb_listings').update({ status: 'publishing', error: null })
    .eq('id', l.id).eq('status', 'review').select('id');
  if (error) throw error;
  if (!data?.length) throw plainError('This listing is no longer waiting for review — reload and check it again.');
  logPbActivity({ product_id: l.product_id, listing_id: l.id, website_id: l.website_id, action: 'approved' });
  return { paused: (auto.data?.value as { paused?: boolean } | null)?.paused === true };
}

/** Failed listings of products that are not archived, on one website or on all (head-only count). */
export async function failedCount(websiteId = ''): Promise<number> {
  let q = supabase.from('pb_listings').select('id,pb_products!inner(status)', { count: 'exact', head: true }).eq('status', 'failed').neq('pb_products.status', 'archived');
  if (websiteId) q = q.eq('website_id', websiteId);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}
/** Every failed listing (of one website, or all) gets its tries again; the automation sends them. */
export const retryFailed = (websiteId = '') => pbCall<{ retried: number }>('retry_failed', websiteId ? { website_id: websiteId } : {});
