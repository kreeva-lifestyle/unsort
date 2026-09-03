// Price Projector arithmetic — pure, no React, no Supabase, harness-tested.
//
// cost/pc = fabric + material + stitching + maintenance
//   fabric / material  : the costing sheet's own lines (sheetCost split by
//                        unit — Meter/Yard lines are fabric, the rest material)
//   stitching          : the Settings cost heads (per piece / per fabric
//                        meter / % of material), each overridable per product
//   maintenance        : the sheet's maintenance % on materials only (what the
//                        costing sheet has always meant) or on everything
// target price (ex GST) = (cost + fixed profit) / (1 − profit% / 100)
// margin% = (price − cost) / price   ← margin on price, as the costing hero shows
import { CostingProduct, CostingSub, num, subCost, selectedSupplier } from '../costing/costingModel';
import type { PricingConfig, StitchHead, Threshold, MaintenanceBase } from './pricingConfig';

export interface ProductPricing {
  stitching?: Record<string, { enabled?: boolean; qty?: number | null; rate?: number | null }>;
  profit?: { pct?: number | null; fixed?: number | null };
  thresholds?: { minMarginPct?: number | null; maxCost?: number | null };
  maintenanceBase?: MaintenanceBase;
}
export interface PricedProduct extends CostingProduct { category?: string | null; pricing?: ProductPricing | null }

const FABRIC_UNITS: Record<string, number> = { meter: 1, metre: 1, yard: 0.9144 };
const r2 = (x: number) => Math.round(x * 100) / 100;
export const isFabricSub = (s: CostingSub) => (s.unit || '').trim().toLowerCase() in FABRIC_UNITS;
const metersOf = (s: CostingSub) => num(s.qty) * (FABRIC_UNITS[(s.unit || '').trim().toLowerCase()] ?? 0);

export interface StitchLine { head: StitchHead; enabled: boolean; qty: number; rate: number; cost: number }
export interface CostBreakdown {
  fabric: number; material: number; fabricMeters: number;
  stitching: StitchLine[]; stitchingTotal: number;
  maintenancePct: number; maintenanceBase: MaintenanceBase; maintenance: number;
  costPerPc: number;
}

export function costBreakdown(p: PricedProduct, cfg: PricingConfig): CostBreakdown {
  const subs = p.components.flatMap(c => c.subs);
  const fabric = r2(subs.filter(isFabricSub).reduce((t, s) => t + subCost(s), 0));
  const material = r2(subs.filter(s => !isFabricSub(s)).reduce((t, s) => t + subCost(s), 0));
  const fabricMeters = r2(subs.filter(isFabricSub).reduce((t, s) => t + metersOf(s), 0));
  const overrides = p.pricing?.stitching || {};
  const stitching: StitchLine[] = cfg.stitching.filter(h => h.active).map(h => {
    const o = overrides[h.id] || {};
    const enabled = o.enabled !== false;
    const rate = o.rate === null || o.rate === undefined ? h.rate : num(o.rate);
    const qty = h.basis === 'per_pc' ? (o.qty === null || o.qty === undefined ? 1 : num(o.qty)) : h.basis === 'per_meter' ? fabricMeters : 1;
    const cost = !enabled ? 0 : r2(h.basis === 'pct_of_material' ? (fabric + material) * rate / 100 : rate * qty);
    return { head: h, enabled, qty, rate, cost };
  });
  const stitchingTotal = r2(stitching.reduce((t, l) => t + l.cost, 0));
  const maintenancePct = num(p.maintenance_pct);
  const maintenanceBase: MaintenanceBase = p.pricing?.maintenanceBase || cfg.defaults.maintenanceBase;
  const maintenance = r2((maintenanceBase === 'all' ? fabric + material + stitchingTotal : fabric + material) * maintenancePct / 100);
  return { fabric, material, fabricMeters, stitching, stitchingTotal, maintenancePct, maintenanceBase, maintenance, costPerPc: r2(fabric + material + stitchingTotal + maintenance) };
}

/** Indian GST slab for garments (owner's rule, same as the rate card):
 *  ≤ ₹2,500 → 5%, above → 18%. */
export const GST_BOUNDARY = 2500;
export const gstPct = (exc: number) => (exc > GST_BOUNDARY ? 18 : 5);
export const incGst = (exc: number) => r2(exc * (1 + gstPct(exc) / 100));

export const targetPrice = (costPerPc: number, profit: { pct: number; fixed: number }): number => {
  const pct = Math.min(Math.max(num(profit.pct), 0), 95);
  return r2((costPerPc + Math.max(num(profit.fixed), 0)) / (1 - pct / 100));
};

/** Product override beats the category default beats the global default. */
export function resolveThreshold(cfg: PricingConfig, category: string | null | undefined, override?: ProductPricing['thresholds']): Threshold & { source: 'product' | 'category' | 'default' | 'none' } {
  const cat = (category || '').trim().toUpperCase();
  const pick = (t: { minMarginPct?: number | null; maxCost?: number | null } | undefined, src: 'product' | 'category' | 'default') =>
    t && (t.minMarginPct != null || t.maxCost != null) ? { minMarginPct: t.minMarginPct ?? null, maxCost: t.maxCost ?? null, source: src } : null;
  return pick(override, 'product') || pick(cat ? cfg.thresholds.byCategory[cat] : undefined, 'category') || pick(cfg.thresholds.default, 'default')
    || { minMarginPct: null, maxCost: null, source: 'none' };
}

export type PriceStatus = 'ok' | 'below_margin' | 'over_cost' | 'no_price';
export interface Projection {
  breakdown: CostBreakdown;
  profit: { pct: number; fixed: number };
  target: { exc: number; gstPct: number; inc: number };
  price: number | null; priceSource: 'sheet' | 'catalog' | 'none';
  profitAmount: number | null; marginPct: number | null;
  threshold: ReturnType<typeof resolveThreshold>;
  status: PriceStatus;
}

export function project(p: PricedProduct, cfg: PricingConfig, catalogPriceExc?: number | null): Projection {
  const breakdown = costBreakdown(p, cfg);
  const profit = { pct: num(p.pricing?.profit?.pct ?? cfg.defaults.profit.pct), fixed: num(p.pricing?.profit?.fixed ?? cfg.defaults.profit.fixed) };
  const exc = targetPrice(breakdown.costPerPc, profit);
  const sheetPrice = num(p.selling_price);
  const price = sheetPrice > 0 ? sheetPrice : (catalogPriceExc && catalogPriceExc > 0 ? catalogPriceExc : null);
  const priceSource = sheetPrice > 0 ? 'sheet' : price ? 'catalog' : 'none';
  const profitAmount = price === null ? null : r2(price - breakdown.costPerPc);
  const marginPct = price === null || price <= 0 ? null : r2((price - breakdown.costPerPc) / price * 100);
  const threshold = resolveThreshold(cfg, p.category, p.pricing?.thresholds);
  let status: PriceStatus = price === null ? 'no_price' : 'ok';
  if (threshold.maxCost != null && breakdown.costPerPc > threshold.maxCost) status = 'over_cost';
  else if (status === 'ok' && threshold.minMarginPct != null && marginPct != null && marginPct < threshold.minMarginPct) status = 'below_margin';
  return { breakdown, profit, target: { exc, gstPct: gstPct(exc), inc: incGst(exc) }, price, priceSource, profitAmount, marginPct, threshold, status };
}

/** Selected-supplier rate of a sub, exposed for the suggestions engine. */
export const subRate = (s: CostingSub) => num(selectedSupplier(s)?.rate);
