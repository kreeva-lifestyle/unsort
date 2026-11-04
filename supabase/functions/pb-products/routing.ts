// Pure: does a website take this product? For one website: its enabled rules
// ordered by position; the FIRST rule whose conditions all match decides
// (include → listing, exclude → none). No rule matched → routing_default
// ('none' = no listing, 'all' = list). Conditions given must all match; empty
// arrays / null bounds are ignored, so a rule with no conditions matches all.
import type { RuleConditions, RuleRow } from './types.ts';

export interface RouteFacts {
  vendor_id: string | null; category: string | null; fabric: string | null; cost_price: number | null;
  name: string | null; sku: string | null; raw_text: string | null; attributes: Record<string, string>;
}

const list = (a: unknown): string[] => (Array.isArray(a) ? a.map(x => String(x ?? '').trim()).filter(Boolean) : []);
const has = (vals: string[], v: string | null) => !!v && vals.some(x => x.toLowerCase() === v.trim().toLowerCase());
const bound = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function ruleMatches(c: RuleConditions | null | undefined, p: RouteFacts): boolean {
  const cond = c || {};
  const vendors = list(cond.vendor_ids);
  if (vendors.length && (!p.vendor_id || !vendors.includes(p.vendor_id))) return false;
  const cats = list(cond.categories);
  if (cats.length && !has(cats, p.category)) return false;
  const fabrics = list(cond.fabrics);
  if (fabrics.length && !has(fabrics, p.fabric)) return false;
  const lo = bound(cond.min_cost), hi = bound(cond.max_cost);
  if (lo !== null || hi !== null) {
    if (p.cost_price === null || p.cost_price === undefined) return false;
    if (lo !== null && p.cost_price < lo) return false;
    if (hi !== null && p.cost_price > hi) return false;
  }
  const words = list(cond.keywords).map(w => w.toLowerCase());
  if (words.length) {
    const hay = [p.name, p.sku, p.raw_text, ...Object.values(p.attributes || {})].map(x => String(x ?? '')).join('\n').toLowerCase();
    if (!words.some(w => hay.includes(w))) return false;
  }
  return true;
}

export function decide(rules: RuleRow[], routingDefault: string, p: RouteFacts): { include: boolean; rule: RuleRow | null } {
  const ordered = rules.filter(r => r.enabled).sort((a, b) => a.position - b.position);
  for (const r of ordered) {
    if (ruleMatches(r.conditions, p)) return { include: r.action === 'include', rule: r };
  }
  return { include: routingDefault === 'all', rule: null };
}
