// One-shot SKU handoff: Master Assistant (Minis tab) → Listing AI tab.
// "Generate listings for not-uploaded" writes the ACTIVE not-uploaded SKUs
// here and switches tabs; ListingAI pre-fills its SKU box from it.
//
// Why sessionStorage AND a CustomEvent: App keeps pages mounted and hidden
// (display:none), so a mount-time read alone misses the case where Listing AI
// was already visited. The event reaches the hidden-but-mounted instance; the
// mount-time read covers a never-visited tab that App mounts after the switch.
// Reading removes the payload — each click writes a fresh one.
import { ComparisonReport, stockClass } from './assistant/buildReport';

export interface ListingHandoff { skus: string[]; seller: string }

export const HANDOFF_EVENT = 'listingai:prefill';
const KEY = 'listingai_prefill';

// ACTIVE (in stock) not-uploaded SKUs only — there is no point generating
// listings for designs that can't ship, and 'unknown' status must never
// trigger AI spend. notUploaded rows are [SKU, CATEGORY, MASTER STATUS].
export function activeNotUploadedSkus(rep: ComparisonReport): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rep.notUploaded) {
    const sku = (r[0] || '').trim();
    if (!sku || seen.has(sku)) continue;
    if (stockClass(r[2] || '') !== 'in') continue;
    seen.add(sku); out.push(sku);
  }
  return out;
}

export function writeListingHandoff(h: ListingHandoff): void {
  sessionStorage.setItem(KEY, JSON.stringify(h));
  window.dispatchEvent(new CustomEvent(HANDOFF_EVENT));
}

export function readListingHandoff(): ListingHandoff | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  sessionStorage.removeItem(KEY);
  try {
    const h = JSON.parse(raw);
    const skus = (Array.isArray(h?.skus) ? h.skus : []).map((s: unknown) => String(s ?? '').trim()).filter(Boolean);
    if (skus.length === 0) return null;
    return { skus, seller: String(h?.seller || 'seller sheet') };
  } catch { return null; }
}
