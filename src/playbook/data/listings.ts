// Product Directory listings (one product on one website) + the pb_activity
// helper the product data shares. Explicit columns; errors thrown as-is —
// callers show them with friendlyError(). Contract: docs/playbook/product-directory-spec.md.
import { supabase } from '../../lib/supabase';
import { logSwallowed } from '../../lib/errorLogger';
import type { PbListing } from '../types';

export type ListingFull = Pick<PbListing, 'id' | 'product_id' | 'website_id' | 'status' | 'price' | 'compare_at_price' | 'title'
  | 'description_html' | 'seo_title' | 'seo_description' | 'handle' | 'tags' | 'locked' | 'error' | 'shopify_product_id'
  | 'shopify_status' | 'published_at' | 'generated_at' | 'ai_model' | 'attempts' | 'updated_at'>;
export const LISTING_COLS = 'id,product_id,website_id,status,price,compare_at_price,title,description_html,seo_title,seo_description,handle,tags,locked,error,shopify_product_id,shopify_status,published_at,generated_at,ai_model,attempts,updated_at';

/** Best-effort timeline row; a failure is logged, never shown. */
export const logPbActivity = (row: { product_id: string; action: string; listing_id?: string; website_id?: string; details?: Record<string, unknown> }) => {
  supabase.from('pb_activity').insert(row).then(({ error }) => { if (error) logSwallowed('pb_activity insert', error); });
};

/** While the worker holds a listing it works from what it read at claim time — edits then would be lost or published stale. */
export const listingBusy = (status: string) => status === 'generating' || status === 'publishing';

/** Save hand edits; every edited field joins `locked` so Regenerate keeps it. Refused while the worker holds the listing. */
export async function updateListing(l: Pick<ListingFull, 'id' | 'locked' | 'product_id' | 'website_id'>, patch: Partial<ListingFull>): Promise<ListingFull> {
  const changed = Object.keys(patch);
  const locked = Array.from(new Set([...l.locked, ...changed]));
  const { data, error } = await supabase.from('pb_listings').update({ ...patch, locked })
    .eq('id', l.id).not('status', 'in', '(generating,publishing)').select(LISTING_COLS).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This listing is being written or published right now — wait a minute, reload it and edit again.');
  logPbActivity({ product_id: l.product_id, listing_id: l.id, website_id: l.website_id, action: 'edited', details: { fields: changed } });
  return data as unknown as ListingFull;
}

export async function getListing(id: string): Promise<ListingFull> {
  const { data, error } = await supabase.from('pb_listings').select(LISTING_COLS).eq('id', id).single();
  if (error) throw error;
  return data as unknown as ListingFull;
}

/** Review → publishing (the worker publishes it within a minute). */
export async function approveListing(l: Pick<ListingFull, 'id' | 'product_id' | 'website_id'>) {
  const { data, error } = await supabase.from('pb_listings').update({ status: 'publishing', error: null })
    .eq('id', l.id).eq('status', 'review').select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('This listing is no longer waiting for review — reload and check it again.');
  logPbActivity({ product_id: l.product_id, listing_id: l.id, website_id: l.website_id, action: 'approved' });
}
