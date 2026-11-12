// What a listing carries besides its pb_listings row (owner, 2026-11-12): the
// search phrase it was written for, its two questions (FAQ), the facts the
// writer missed and what the checks noted. Kept in private.pb_listing_seo
// (20261112090000_pb_store_writer.sql) behind two RPCs, so this reads and
// writes through them. A failed write here never fails the listing: the copy
// is already saved; the failure is logged and the extras are written on the
// next Regenerate.
import { rpc } from './db.ts';
import { plain } from './http.ts';
import type { Faq } from './seoCheck.ts';

export interface SeoRow {
  listing_id: string; keyword: string | null; keyword_locked: boolean;
  faq: Faq[]; faq_locked: boolean; missing: string[]; notes: string[]; rewrites: number;
}

export async function seoGet(ids: string[]): Promise<Map<string, SeoRow>> {
  if (!ids.length) return new Map();
  const rows = await rpc<SeoRow[]>('pb_listing_seo_get', { p_ids: ids });
  return new Map((rows || []).map(r => [r.listing_id, { ...r, faq: Array.isArray(r.faq) ? r.faq : [], missing: r.missing || [], notes: r.notes || [] }]));
}

/** Only the keys given are changed. Returns false (and logs) when it could not be saved. */
export async function seoPut(listingId: string, set: Partial<Omit<SeoRow, 'listing_id'>>): Promise<boolean> {
  try { await rpc('pb_listing_seo_put', { p_listing: listingId, p_set: set }); return true; }
  catch (e) { console.error(`pb-products seo ${listingId}: ${plain(e)}`); return false; }
}
