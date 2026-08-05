// Pre-AI validation: one free edge call (action 'validate') checks every
// pasted SKU against the master sheet AND the template's garment category
// before any Anthropic spend — a Kurta Set paste into a Lehenga template is
// caught here instead of burning tokens. Category keywords live ONLY in the
// edge function; this file just carries the shapes and the issue split.
import { call } from './api';
import { SkuLine } from './skuInput';

export interface ValidateItem {
  sku: string; found: boolean;
  detected: string | null; detectedLabel: string | null; mismatch: boolean;
}
export interface ValidateResult {
  templateCategory: string | null;
  templateCategoryLabel: string | null;
  categorySource: 'saved' | 'name' | null;
  results: ValidateItem[];
  warnings?: string[];
}

// The edge caps one validate call at 60 SKUs (VALIDATE_CAP) and splitIssues
// treats any uncovered SKU as not-in-master — so a 200-SKU run must be
// checked in batches and merged, or everything past 60 would be wrongly
// flagged before a single token is spent.
const VALIDATE_BATCH = 60;

export async function runValidate(items: SkuLine[], templateId: string, addToast?: (m: string, t?: string) => void): Promise<ValidateResult> {
  let merged: ValidateResult | null = null;
  for (let i = 0; i < items.length; i += VALIDATE_BATCH) {
    const batch = items.slice(i, i + VALIDATE_BATCH);
    const { status, data } = await call({ action: 'validate', items: batch.map(b => ({ sku: b.sku })), templateId });
    if (!data?.ok) throw new Error(String(data?.details || data?.error || `Pre-check failed (${status})`));
    const v = data as ValidateResult;
    if (!merged) merged = v;
    else {
      merged.results = merged.results.concat(v.results);
      if (v.warnings?.length) merged.warnings = [...(merged.warnings || []), ...v.warnings];
    }
  }
  // A degraded master read (stale mirror, unreadable tab) makes perfectly
  // valid SKUs come back "not in master" — the owner MUST see why before the
  // panel talks them into removing those SKUs from the run.
  for (const w of [...new Set(merged?.warnings || [])]) addToast?.(w, 'error');
  return merged || { templateCategory: null, templateCategoryLabel: null, categorySource: null, results: [] };
}

export interface PreflightIssues {
  clean: SkuLine[]; // SKUs that pass — safe to run as-is
  notInMaster: string[];
  mismatched: { sku: string; detectedLabel: string }[];
  tplLabel: string | null; // template's effective category label, for the panel copy
}

// A SKU the validate response somehow didn't cover counts as not-in-master —
// never silently run something the pre-check didn't clear.
export function splitIssues(v: ValidateResult, skus: SkuLine[]): PreflightIssues {
  const by = new Map(v.results.map(r => [r.sku, r]));
  const clean: SkuLine[] = [];
  const notInMaster: string[] = [];
  const mismatched: { sku: string; detectedLabel: string }[] = [];
  for (const s of skus) {
    const r = by.get(s.sku);
    if (!r || !r.found) { notInMaster.push(s.sku); continue; }
    if (r.mismatch) { mismatched.push({ sku: s.sku, detectedLabel: r.detectedLabel || 'a different category' }); continue; }
    clean.push(s);
  }
  return { clean, notInMaster, mismatched, tplLabel: v.templateCategoryLabel };
}
