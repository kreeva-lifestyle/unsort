// Price Projector configuration — app-wide, kept in app_settings (key/jsonb)
// like print_mode and costing_top_subs, edited in Settings → Pricing.
// Loading always returns a fully-shaped config: anything missing or
// malformed in the stored JSON falls back to a default, so the math never
// sees undefined.
import { supabase } from '../../../lib/supabase';

export type StitchBasis = 'per_pc' | 'per_meter' | 'pct_of_material';
export interface StitchHead { id: string; name: string; basis: StitchBasis; rate: number; active: boolean }
export interface Threshold { minMarginPct: number | null; maxCost: number | null }
export interface PricingThresholds { default: Threshold; byCategory: Record<string, Threshold> }
export interface PricingDefaults { profit: { pct: number; fixed: number } }
export interface PricingConfig { stitching: StitchHead[]; thresholds: PricingThresholds; defaults: PricingDefaults }

export const PRICING_KEYS = { stitching: 'pricing_stitching', thresholds: 'pricing_thresholds', defaults: 'pricing_defaults' } as const;

export const BASIS_LABEL: Record<StitchBasis, string> = { per_pc: '₹ per piece', per_meter: '₹ per fabric meter', pct_of_material: '% of material cost' };

export const emptyConfig = (): PricingConfig => ({
  stitching: [],
  thresholds: { default: { minMarginPct: null, maxCost: null }, byCategory: {} },
  defaults: { profit: { pct: 0, fixed: 0 } },
});

const n = (v: unknown, fallback = 0): number => { const x = Number(v); return Number.isFinite(x) ? x : fallback; };
const nOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export const normalizeStitching = (v: unknown): StitchHead[] => !Array.isArray(v) ? [] : v
  .filter(h => h && typeof h === 'object')
  .map((h: Record<string, unknown>, i) => ({
    id: String(h.id || `h${i}`), name: String(h.name || '').trim(),
    basis: (['per_pc', 'per_meter', 'pct_of_material'] as StitchBasis[]).includes(h.basis as StitchBasis) ? (h.basis as StitchBasis) : 'per_pc',
    rate: n(h.rate), active: h.active !== false,
  }))
  .filter(h => h.name);

const normThreshold = (v: unknown): Threshold => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { minMarginPct: nOrNull(o.minMarginPct), maxCost: nOrNull(o.maxCost) };
};
export const normalizeThresholds = (v: unknown): PricingThresholds => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const by = (o.byCategory && typeof o.byCategory === 'object' ? o.byCategory : {}) as Record<string, unknown>;
  const byCategory: Record<string, Threshold> = {};
  for (const [k, t] of Object.entries(by)) { const key = k.trim().toUpperCase(); if (key) byCategory[key] = normThreshold(t); }
  return { default: normThreshold(o.default), byCategory };
};
export const normalizeDefaults = (v: unknown): PricingDefaults => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const p = (o.profit && typeof o.profit === 'object' ? o.profit : {}) as Record<string, unknown>;
  return { profit: { pct: n(p.pct), fixed: n(p.fixed) } };
};

export async function loadPricingConfig(): Promise<{ config: PricingConfig; error: unknown }> {
  const { data, error } = await supabase.from('app_settings').select('key, value').in('key', Object.values(PRICING_KEYS));
  const cfg = emptyConfig();
  if (error) return { config: cfg, error };
  for (const row of data || []) {
    if (row.key === PRICING_KEYS.stitching) cfg.stitching = normalizeStitching(row.value);
    if (row.key === PRICING_KEYS.thresholds) cfg.thresholds = normalizeThresholds(row.value);
    if (row.key === PRICING_KEYS.defaults) cfg.defaults = normalizeDefaults(row.value);
  }
  return { config: cfg, error: null };
}

export async function savePricingKey(key: string, value: unknown): Promise<{ error: unknown }> {
  const { error } = await supabase.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return { error };
}

export const newHeadId = () => `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
