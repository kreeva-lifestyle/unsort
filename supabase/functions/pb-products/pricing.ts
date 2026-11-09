// Pure: the selling price (₹) of a product on one website, from the vendor
// COST (owner, 2026-11-04). No I/O — easy to reason about and to preview.
// Import from website (owner, 2026-11-08): a product with sell_price (the
// price seen on the other store) sells at EXACTLY that price on every website
// — markup, add, rounding, min price and any rule price_override are skipped
// (listingPrice). Only the site's compare-at % still applies (its "was" price
// policy, as for a price typed by hand).
//   p = cost × (1 + markup_pct/100) + add_flat   (markup/add from the rule's price_override when set)
//   rounding: none → 2 dp · nearest_10 → nearest 10 · end_99 → up to the next …99 (1234 → 1299,
//   1299 stays) · end_49_99 → up to the next …49 or …99 — then max(p, min_price).
//   compare_at_pct > 0 → compare_at = p × (1 + pct/100) with the same rounding; else null.
import type { Pricing } from './types.ts';

const num = (v: unknown, d: number): number => {
  const n = typeof v === 'number' ? v : (v === null || v === undefined || v === '' ? NaN : Number(v));
  return Number.isFinite(n) ? n : d;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export function roundPrice(p: number, rounding: string): number {
  const x = r2(p); // kill float noise (1298.9999…) before rounding up
  switch (rounding) {
    case 'nearest_10': return Math.round(x / 10) * 10;
    case 'end_99': return Math.ceil((x + 1) / 100) * 100 - 1;
    case 'end_49_99': return Math.ceil((x + 1) / 50) * 50 - 1;
    default: return x;
  }
}

/** The "was" price for a final selling price, or null when compare-at is off. */
export function compareAt(price: number, pricing: Partial<Pricing>): number | null {
  const pct = num(pricing.compare_at_pct, 0);
  if (pct <= 0 || !(price > 0)) return null;
  const c = roundPrice(price * (1 + pct / 100), String(pricing.rounding || 'none'));
  return c > price ? c : null;
}

/** The listing price for a product: sell_price as is (see header), else computePrice from the cost; null when neither is set. */
export function listingPrice(p: { cost_price: number | null; sell_price?: number | null }, pricing: Partial<Pricing>, override?: { markup_pct?: number; add_flat?: number } | null): { price: number; compare_at: number | null } | null {
  if (p.sell_price !== null && p.sell_price !== undefined && Number(p.sell_price) > 0) {
    const price = r2(Number(p.sell_price));
    return { price, compare_at: compareAt(price, pricing) };
  }
  if (p.cost_price === null || p.cost_price === undefined) return null;
  return computePrice(Number(p.cost_price), pricing, override);
}

export function computePrice(cost: number, pricing: Partial<Pricing>, override?: { markup_pct?: number; add_flat?: number } | null): { price: number; compare_at: number | null } {
  const markup = num(override?.markup_pct, num(pricing.markup_pct, 0));
  const add = num(override?.add_flat, num(pricing.add_flat, 0));
  let p = roundPrice(cost * (1 + markup / 100) + add, String(pricing.rounding || 'none'));
  const min = pricing.min_price === null || pricing.min_price === undefined ? NaN : num(pricing.min_price, NaN);
  if (Number.isFinite(min)) p = Math.max(p, min);
  p = r2(p);
  return { price: p, compare_at: compareAt(p, pricing) };
}
