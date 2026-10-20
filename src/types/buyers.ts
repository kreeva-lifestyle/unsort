// buyer_runs (15 cols) / buyer_leads (25 cols) — Buyer Spider (Minis → Client
// Finder → Buyers). buyer_queue is server-only. Re-exported from database.ts.

export interface BuyerProfile {
  business_name: string; what_they_sell: string; segment: string; customer: string;
  city: string; country: string; is_buyer: boolean; why: string; queries: string[];
}
export type BuyerRunStatus = 'running' | 'paused' | 'done' | 'failed';
export interface BuyerRun {
  id: string;
  created_by: string;
  seed_url: string;
  seed_domain: string;
  profile: BuyerProfile;
  status: BuyerRunStatus;
  max_depth: number;
  max_leads: number;
  queries_used: number;
  pages_fetched: number;
  leads_found: number;
  step_note: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}
export type BuyerLeadStatus = 'new' | 'contacted' | 'replied' | 'customer' | 'rejected';
export interface BuyerLead {
  id: string;
  domain: string;
  url: string;
  name: string | null;
  kind: string | null;
  what_they_sell: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
  score: number;
  reason: string | null;
  hop: number;
  parent_domain: string | null;
  first_run_id: string | null;
  found_by: string | null;
  status: BuyerLeadStatus;
  /** Generated: the business part of the domain (buyer_brand_key, migration 20261020185737). */
  brand_key: string;
  notes: string | null;
  contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

// Buyer Spider: Brave searches used per UTC month (free plan cap 1,000).
export interface BuyerSearchUsage { month: string; used: number; updated_at: string }
