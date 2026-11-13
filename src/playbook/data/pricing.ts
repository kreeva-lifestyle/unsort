// The price preview: the SAME formula as supabase/functions/pb-products/pricing.ts.
// supabase/functions/pb-products/test/pricingMirror.test.mjs loads this file next to
// the server's and checks both give the same prices, so keep it pure (type imports only).
import type { PbPricing, PbRoutingRule } from '../types';

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

/** A number in [0, 1) from a product id: the same id always gives the same number (= rangeSpot in pricing.ts). */
export function rangeSpot(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The was-price % for one product (= comparePct): compare_at_pct, or a whole step up to compare_at_max_pct picked by its id. */
export function comparePct(pricing: Partial<PbPricing>, key?: string | null): number {
  const lo = num(pricing.compare_at_pct, 0), hi = num(pricing.compare_at_max_pct, NaN);
  if (!(hi > lo) || !key) return lo;
  return lo + Math.floor(rangeSpot(key) * (Math.floor(hi - lo) + 1));
}

/** The "was" price for a final selling price, or null when compare-at is off (= compareAt). key = the product id. */
export function compareAtPrice(price: number, pricing: Partial<PbPricing>, key?: string | null): number | null {
  const pct = comparePct(pricing, key);
  if (pct <= 0 || !(price > 0)) return null;
  const c = roundPrice(price * (1 + pct / 100), String(pricing.rounding || 'none'));
  return c > price ? c : null;
}

/** p = cost × (1 + markup/100) + add, rounded, then at least min_price; compare-at = p × (1 + pct/100), same rounding (= computePrice). */
export function previewPrice(cost: number, pricing: Partial<PbPricing>, override?: PbRoutingRule['price_override'], key?: string | null): { price: number; compare_at: number | null } {
  const markup = num(override?.markup_pct, num(pricing.markup_pct, 0));
  const add = num(override?.add_flat, num(pricing.add_flat, 0));
  const rounding = String(pricing.rounding || 'none');
  let p = roundPrice(cost * (1 + markup / 100) + add, rounding);
  const min = pricing.min_price === null || pricing.min_price === undefined ? NaN : num(pricing.min_price, NaN);
  if (Number.isFinite(min)) p = Math.max(p, min);
  p = r2(p);
  return { price: p, compare_at: compareAtPrice(p, pricing, key) };
}

/** A random range's lowest and highest was price for one selling price (the Preview tile); null when pricing has no range. */
export function compareAtRange(price: number, pricing: Partial<PbPricing>): { low: number | null; high: number | null } | null {
  const lo = num(pricing.compare_at_pct, 0), hi = num(pricing.compare_at_max_pct, NaN);
  if (!(hi > lo)) return null;
  const at = (pct: number) => compareAtPrice(price, { ...pricing, compare_at_pct: pct, compare_at_max_pct: null });
  return { low: at(lo), high: at(lo + Math.floor(hi - lo)) };
}

/** A random range whose To is not above its From: the website editor will not save it. */
export const badWasRange = (p: Partial<PbPricing>) =>
  p.compare_at_max_pct !== null && p.compare_at_max_pct !== undefined && !(num(p.compare_at_max_pct, NaN) > num(p.compare_at_pct, 0));
