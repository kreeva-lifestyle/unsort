// Websites (one Shopify store each) + their routing rules. Explicit columns;
// credentials never pass through here — they go write-only to the pb-products
// edge function (save_credentials) and pb_website_secrets is not readable by
// the browser. Contract: docs/playbook/product-directory-spec.md. Errors are
// thrown as-is — callers show them with friendlyError().
import { supabase } from '../../lib/supabase';
import { logSwallowed } from '../../lib/errorLogger';
import { pbCall } from './pbFunctions';
import type { PbAuthMode, PbContent, PbPricing, PbRoutingRule, PbTagRules, PbWebsite } from '../types';

// Same values as the column defaults in 20261105090000_pb_product_directory.sql —
// only used to fill a key missing from an older jsonb value.
export const DEFAULT_PRICING: PbPricing = { markup_pct: 100, add_flat: 0, rounding: 'end_99', compare_at_pct: 0, min_price: null };
export const DEFAULT_TAGS: PbTagRules = { templates: ['{category}', '{fabric}', '{color}', 'Vendor_{vendor}'], static: [], case: 'as_is', ai_extra: true, ai_extra_max: 5 };
export const DEFAULT_CONTENT: PbContent = {
  model: 'claude-haiku-5-5', effort: '', language: 'English', brand_voice: '', title_template: '{ai_title}',
  title_max: 70, description_words: 120, meta_title_max: 60, meta_desc_max: 155, extra_instructions: '', alt_text: true,
};

const COLS = 'id,name,shop_domain,auth_mode,api_version,active,publish_mode,routing_default,track_inventory,pricing,tag_rules,content,connected_at,shop_name,last_error,created_at,updated_at';

const norm = (w: PbWebsite): PbWebsite => ({
  ...w,
  pricing: { ...DEFAULT_PRICING, ...(w.pricing || {}) },
  tag_rules: { ...DEFAULT_TAGS, ...(w.tag_rules || {}) },
  content: { ...DEFAULT_CONTENT, ...(w.content || {}) },
});

const logActivity = (website_id: string, action: string, details: Record<string, unknown> = {}) => {
  supabase.from('pb_activity').insert({ website_id, action, details }).then(({ error }) => { if (error) logSwallowed('pb_activity insert', error); });
};

export async function listWebsites(): Promise<PbWebsite[]> {
  const { data, error } = await supabase.from('pb_websites').select(COLS).order('name').limit(200);
  if (error) throw error;
  return ((data ?? []) as PbWebsite[]).map(norm);
}

export async function getWebsite(id: string): Promise<PbWebsite> {
  const { data, error } = await supabase.from('pb_websites').select(COLS).eq('id', id).single();
  if (error) throw error;
  return norm(data as PbWebsite);
}

/** "https://My-Shop.myshopify.com/admin" → "my-shop.myshopify.com". */
export const cleanDomain = (s: string) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
export const domainProblem = (d: string) =>
  !d ? 'Enter the store domain' : !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(d) ? 'Use the store\'s myshopify.com address, e.g. my-store.myshopify.com' : null;

/** New site: only name + domain — every other setting comes from the column defaults (inactive, safe routing 'none'). */
export async function createWebsite(name: string, shopDomain: string): Promise<PbWebsite> {
  const { data, error } = await supabase.from('pb_websites').insert({ name, shop_domain: shopDomain }).select(COLS).single();
  if (error) throw error;
  logActivity((data as PbWebsite).id, 'website_created', { name });
  return norm(data as PbWebsite);
}

// shop_domain, auth_mode, connected_at, shop_name and last_error are NOT here:
// only the edge function writes them (a domain change goes through
// save_credentials, admin/manager only, which wipes the old store's secrets).
export type WebsitePatch = Partial<Pick<PbWebsite, 'name' | 'active' | 'publish_mode' | 'routing_default' | 'track_inventory' | 'pricing' | 'tag_rules' | 'content'>>;

export async function updateWebsite(id: string, patch: WebsitePatch): Promise<PbWebsite> {
  const { data, error } = await supabase.from('pb_websites').update(patch).eq('id', id).select(COLS).single();
  if (error) throw error;
  logActivity(id, 'website_edited', { fields: Object.keys(patch) });
  return norm(data as PbWebsite);
}

/** Turn a site on only once it has connected at least once (the DB row is re-checked, not the screen). */
export async function setWebsiteActive(id: string, active: boolean): Promise<PbWebsite> {
  if (active) {
    const { data, error } = await supabase.from('pb_websites').select('connected_at').eq('id', id).single();
    if (error) throw error;
    if (!data?.connected_at) throw new Error('Connect this store first — save the credentials and pass "Test connection".');
  }
  return updateWebsite(id, { active });
}

/** shop_domain only when moving the site to another store: the server then switches the site off,
 *  deletes every saved secret of the old store and re-queues its listings before storing these. */
export type Credentials = { auth_mode: PbAuthMode; access_token?: string; client_id?: string; client_secret?: string; shop_domain?: string };
export type ConnectionResult = { ok: boolean; shop_name: string; scopes?: string[]; missing_scopes?: string[] };

export const saveCredentials = (websiteId: string, c: Credentials) =>
  pbCall<ConnectionResult>('save_credentials', { website_id: websiteId, ...c });
export const testConnection = (websiteId: string) =>
  pbCall<ConnectionResult>('test_connection', { website_id: websiteId });

// ── price preview: the SAME formula as supabase/functions/pb-products/pricing.ts ──
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown, d: number) => {
  const n = typeof v === 'number' ? v : v === null || v === undefined || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : d;
};
export function roundPrice(p: number, rounding: string): number {
  const x = r2(p);
  switch (rounding) {
    case 'nearest_10': return Math.round(x / 10) * 10;
    case 'end_99': return Math.ceil((x + 1) / 100) * 100 - 1;
    case 'end_49_99': return Math.ceil((x + 1) / 50) * 50 - 1;
    default: return x;
  }
}
/** p = cost × (1 + markup/100) + add, rounded, then at least min_price; compare-at = p × (1 + pct/100), same rounding. */
export function previewPrice(cost: number, pricing: Partial<PbPricing>, override?: PbRoutingRule['price_override']): { price: number; compare_at: number | null } {
  const markup = num(override?.markup_pct, num(pricing.markup_pct, 0));
  const add = num(override?.add_flat, num(pricing.add_flat, 0));
  const rounding = String(pricing.rounding || 'none');
  let p = roundPrice(cost * (1 + markup / 100) + add, rounding);
  const min = pricing.min_price === null || pricing.min_price === undefined ? NaN : num(pricing.min_price, NaN);
  if (Number.isFinite(min)) p = Math.max(p, min);
  p = r2(p);
  const pct = num(pricing.compare_at_pct, 0);
  let compare_at: number | null = null;
  if (pct > 0 && p > 0) { const c = roundPrice(p * (1 + pct / 100), rounding); compare_at = c > p ? c : null; }
  return { price: p, compare_at };
}

// ── routing rules ──
const RULE_COLS = 'id,website_id,position,name,enabled,action,conditions,price_override,created_at,updated_at';
export type RuleDraft = Pick<PbRoutingRule, 'name' | 'enabled' | 'action' | 'conditions' | 'price_override'>;

export async function listRules(websiteId: string): Promise<PbRoutingRule[]> {
  const { data, error } = await supabase.from('pb_routing_rules').select(RULE_COLS)
    .eq('website_id', websiteId).order('position').order('created_at').limit(500);
  if (error) throw error;
  return (data ?? []) as PbRoutingRule[];
}

export async function saveRule(websiteId: string, id: string | null, d: RuleDraft, position: number): Promise<PbRoutingRule> {
  const q = id
    ? supabase.from('pb_routing_rules').update(d).eq('id', id).eq('website_id', websiteId)
    : supabase.from('pb_routing_rules').insert({ ...d, website_id: websiteId, position });
  const { data, error } = await q.select(RULE_COLS).single();
  if (error) throw error;
  logActivity(websiteId, id ? 'rule_edited' : 'rule_added', { rule_id: (data as PbRoutingRule).id, name: d.name });
  return data as PbRoutingRule;
}

export async function setRuleEnabled(rule: PbRoutingRule, enabled: boolean) {
  const { error } = await supabase.from('pb_routing_rules').update({ enabled }).eq('id', rule.id);
  if (error) throw error;
  logActivity(rule.website_id, 'rule_edited', { rule_id: rule.id, enabled });
}

export async function deleteRule(rule: PbRoutingRule) {
  const { error } = await supabase.from('pb_routing_rules').delete().eq('id', rule.id);
  if (error) throw error;
  logActivity(rule.website_id, 'rule_deleted', { rule_id: rule.id, name: rule.name });
}

/** Renumber positions in the given order (10, 20, 30…). UPDATE only — never an
 *  upsert, which would re-create a rule deleted elsewhere as a blank "send
 *  everything" rule. A row that no longer matches throws; the caller reloads. */
export async function reorderRules(websiteId: string, ordered: PbRoutingRule[]) {
  const moves = ordered.map((r, i) => ({ id: r.id, position: (i + 1) * 10, was: r.position })).filter(m => m.position !== m.was);
  const res = await Promise.all(moves.map(m => supabase.from('pb_routing_rules').update({ position: m.position })
    .eq('id', m.id).eq('website_id', websiteId).select('id')));
  const failed = res.find(r => r.error);
  if (failed?.error) throw failed.error;
  if (res.some(r => !r.data?.length)) throw new Error('A rule was changed or deleted somewhere else — the list has been reloaded, try again.');
  logActivity(websiteId, 'rules_reordered', { rule_ids: ordered.map(r => r.id) });
}
