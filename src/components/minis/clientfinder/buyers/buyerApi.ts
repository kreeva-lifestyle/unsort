// Edge-function caller for the Buyer Spider (Client Finder → Buyers). Sends
// the session token: the server checks the role, enforces the per-person run
// cap and holds every key (search API, Anthropic) — nothing reaches the browser.
import { supabase, SUPABASE_ANON_KEY } from '../../../../lib/supabase';
import type { BuyerRun, BuyerLead, BuyerLeadStatus } from '../../../../types/database';

export const FN = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/buyer-spider';

export type SearchProvider = 'brave' | 'google';

export interface SpiderStatus {
  searchProvider: SearchProvider | null;
  hasAiKey: boolean;
  model: string;
  role: string;
  caps: { runsPerDay: number; queriesPerRun: number; pagesPerRun: number };
}

/** What one `step` did, shown in the live log under the progress card. */
export interface StepItem { domain: string; hop: number; result: 'searched' | 'lead' | 'rejected' | 'unreachable' | 'failed'; score?: number; added?: number }

export interface SpiderResponse {
  ok: boolean;
  error?: string;
  details?: string;
  run?: BuyerRun;
  done?: boolean;
  item?: StepItem;
  searchProvider?: SearchProvider | null;
  hasAiKey?: boolean;
  model?: string;
  role?: string;
  caps?: SpiderStatus['caps'];
}

export const call = async (body: object): Promise<{ status: number; data: SpiderResponse }> => {
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token || SUPABASE_ANON_KEY;
  const r = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => ({ ok: false } as SpiderResponse)) };
};

// Server messages are written for people ("Daily limit reached — 5 runs per
// person per day"), so they are shown verbatim, like Client Finder does.
export const explain = (data: SpiderResponse, status: number): string =>
  String(data?.details || data?.error || '').trim() || `Request failed (${status})`;

export const LEAD_COLS = 'id, domain, url, name, kind, what_they_sell, city, country, phone, email, whatsapp, instagram, facebook, score, reason, hop, parent_domain, first_run_id, found_by, status, notes, contacted_at, created_at, updated_at';
export const RUN_COLS = 'id, created_by, seed_url, seed_domain, profile, status, max_depth, max_leads, queries_used, pages_fetched, leads_found, step_note, last_error, created_at, updated_at';

export const STATUS_LABEL: Record<BuyerLeadStatus, string> = { new: 'New', contacted: 'Contacted', replied: 'Replied', customer: 'Customer', rejected: 'Not a fit' };
export const KIND_LABEL: Record<string, string> = { boutique: 'Boutique', retailer: 'Retailer', online_store: 'Online store', wholesaler: 'Wholesaler', marketplace_seller: 'Marketplace seller', other: 'Other' };

/** Outreach update — the only columns staff may change (column grant). */
export async function updateLead(id: string, patch: { status?: BuyerLeadStatus; notes?: string }): Promise<{ error: unknown }> {
  const body: Record<string, unknown> = { ...patch };
  if (patch.status === 'contacted') body.contacted_at = new Date().toISOString();
  const { error } = await supabase.from('buyer_leads').update(body).eq('id', id);
  return { error };
}

export type { BuyerRun, BuyerLead, BuyerLeadStatus };
