// What a listing carries besides its row (search phrase, FAQ, missed facts,
// check notes) and what the AI cost — all through database functions
// (20261112090000_pb_store_writer.sql). Errors are thrown as-is; callers show
// them with friendlyError().
import { supabase } from '../../lib/supabase';
import type { PbAiCost, PbFaq, PbListingSeo } from '../seoTypes';

const EMPTY = (listing_id: string): PbListingSeo => ({ listing_id, keyword: null, keyword_locked: false, faq: [], faq_locked: false, missing: [], notes: [], rewrites: 0 });

/** One listing's extras (an unwritten listing has none yet: the empty shape comes back). */
export async function getListingSeo(listingId: string): Promise<PbListingSeo> {
  const { data, error } = await supabase.rpc('pb_listing_seo_get', { p_ids: [listingId] });
  if (error) throw error;
  const row = (data as PbListingSeo[] | null)?.[0];
  return row ? { ...row, faq: Array.isArray(row.faq) ? row.faq : [], missing: row.missing ?? [], notes: row.notes ?? [] } : EMPTY(listingId);
}

/** Save a search phrase and / or the questions typed by hand: each joins its "kept" flag, so Regenerate keeps it
 *  (an emptied one hands it back to the AI). */
export async function saveListingSeo(listingId: string, set: { keyword?: string; faq?: PbFaq[] }): Promise<void> {
  const p: Record<string, unknown> = {};
  if (set.keyword !== undefined) { p.keyword = set.keyword.trim(); p.keyword_locked = !!set.keyword.trim(); }
  if (set.faq !== undefined) { p.faq = set.faq; p.faq_locked = set.faq.length > 0; }
  const { error } = await supabase.rpc('pb_listing_seo_put', { p_listing: listingId, p_set: p });
  if (error) throw error;
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** What the reader, the tag filler and the writer (every website, every rewrite) cost for one product. */
export async function getAiCost(productId: string): Promise<PbAiCost> {
  const { data, error } = await supabase.rpc('pb_ai_costs', { p_ids: [productId] });
  if (error) throw error;
  const r = (data as Record<string, unknown>[] | null)?.[0];
  return { product_id: productId, read_usd: num(r?.read_usd), tag_usd: num(r?.tag_usd), write_usd: num(r?.write_usd), writes: num(r?.writes) };
}

/** The AI's total since a moment: dollars, how many products it touched and how many listings it wrote. */
export async function getAiCostSince(sinceIso: string): Promise<{ usd: number; products: number; writes: number }> {
  const { data, error } = await supabase.rpc('pb_ai_cost_since', { p_since: sinceIso });
  if (error) throw error;
  const r = (data as Record<string, unknown>[] | null)?.[0];
  return { usd: num(r?.usd), products: num(r?.products), writes: num(r?.writes) };
}
