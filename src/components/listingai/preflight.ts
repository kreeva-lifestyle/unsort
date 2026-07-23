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

export async function runValidate(items: SkuLine[], templateId: string): Promise<ValidateResult> {
  const { status, data } = await call({ action: 'validate', items: items.map(i => ({ sku: i.sku })), templateId });
  if (!data?.ok) throw new Error(String(data?.details || data?.error || `Pre-check failed (${status})`));
  return data as ValidateResult;
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
