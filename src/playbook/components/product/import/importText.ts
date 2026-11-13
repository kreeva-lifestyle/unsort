// Plain words for the import flow (copy-and-a11y.md §A): platform names,
// the estimate sentence, the primary button's label, run status labels and
// the one-line counts of a run. Pure functions — no React, no network.
import { friendlyError } from '../../../../lib/friendlyError';
import { PB } from '../../../pbTheme';
import type { ImportCheck, ImportRunRow } from '../../../data/imports';
import type { PbImportPlatform, PbImportStatus } from '../../../types';
import { count } from '../../../format';
import { NEUTRAL } from '../status';

export const PLATFORM: Record<PbImportPlatform, { label: string; color: string; hint: string }> = {
  shopify: { label: 'Shopify store', color: PB.live, hint: 'Playbook can read every product on it.' },
  woocommerce: { label: 'WooCommerce store', color: PB.live, hint: 'Playbook can read every product on it.' },
  generic: { label: 'Other store — best effort', color: PB.review, hint: 'Only pages that carry product data can be read. Some products may be missed.' },
  unknown: { label: 'Unknown store', color: PB.failed, hint: 'No product data was found on this site.' },
};

export const RUN_STATUS: Record<PbImportStatus, { label: string; color: string }> = {
  queued: { label: 'Queued', color: NEUTRAL },
  running: { label: 'Importing', color: PB.busy },
  done: { label: 'Done', color: PB.live },
  failed: { label: 'Failed', color: PB.failed },
  cancelled: { label: 'Cancelled', color: NEUTRAL },
};

/** "https://example.com/" for "example.com"; what was typed otherwise (the server validates). */
export function normalizeUrl(input: string): string {
  const s = input.trim();
  if (!s) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
}

/** "1,240" · "5,000+" · null when unknown. */
export const estimateText = (e: number | string | null | undefined): string | null => {
  if (e == null || e === '') return null;
  if (typeof e === 'number') return e > 0 ? count(e) : null;
  const m = /^(\d+)\+$/.exec(e);
  return m ? `${count(Number(m[1]))}+` : e;
};

/** "About 1,240 products, 980 in stock" · "More than 5,000 products" · "Product count unknown". */
export function estimateLine(c: Pick<ImportCheck, 'estimate' | 'estimate_in_stock'>): string {
  const all = estimateText(c.estimate), stock = estimateText(c.estimate_in_stock);
  if (!all) return 'Product count unknown';
  if (all.endsWith('+')) return `More than ${all.slice(0, -1)} products${stock ? `, ${stock.endsWith('+') ? `more than ${stock.slice(0, -1)}` : stock} in stock` : ''}`;
  return `About ${all} product${all === '1' ? '' : 's'}${stock ? `, ${stock} in stock` : ''}`;
}

/** "Import about 980 products" (the in-stock count when only in-stock products are copied) · "Import up to 1,240
 *  products" when the in-stock count is unknown or counting stopped ("5000+") · "Import products".
 *  A website imported before: "Check for new products" when everything it shows is already here, else
 *  "Import about 14 new products" (the store's count less what Playbook already has from it). */
export function importLabel(c: Pick<ImportCheck, 'estimate' | 'estimate_in_stock' | 'already_here'>, inStockOnly: boolean): string {
  const stock = estimateText(c.estimate_in_stock), all = estimateText(c.estimate);
  const n = inStockOnly ? stock ?? all : all;
  if (!n) return c.already_here ? 'Import new products' : 'Import products';
  if (c.already_here) {
    const total = /^[\d,]+$/.test(n) ? Number(n.replace(/,/g, '')) : null;
    if (total === null) return 'Import new products';
    const fresh = total - c.already_here;
    return fresh <= 0 ? 'Check for new products' : `Import about ${count(fresh)} new product${fresh === 1 ? '' : 's'}`;
  }
  const cappedAt = /^([\d,]+)\+$/.exec(n);
  if (cappedAt) { const k = Number(cappedAt[1].replace(/,/g, '')); return k >= 5000 ? 'Import up to 5,000 products' : `Import more than ${count(k)} products`; }
  return inStockOnly && !stock ? `Import up to ${n} products` : `Import about ${n} products`;
}

/** What Playbook already has from this website, for the preview; '' on a first import. */
export function alreadyLine(c: Pick<ImportCheck, 'already_here' | 'estimate' | 'estimate_in_stock'>, inStockOnly = true): string {
  const have = c.already_here ?? 0;
  if (!have) return '';
  const n = estimateText(inStockOnly ? c.estimate_in_stock ?? c.estimate : c.estimate);
  const total = n && /^[\d,]+$/.test(n) ? Number(n.replace(/,/g, '')) : null;
  const all = total !== null && have >= total;
  return `${all ? `All ${count(have)}` : count(have)} ${have === 1 ? 'is' : 'are'} already in Playbook from an earlier import. ${all ? 'Only products the store added since then will be copied.' : 'They are skipped: only the new ones are copied.'}`;
}

/** A check that found nothing to copy: unknown platform and no products. */
export const nothingFound = (c: ImportCheck) => c.platform === 'unknown' && !c.sample.length && !estimateText(c.estimate);

/** The run's headline: "Importing from example.com", "Imported 975 products from example.com", and for a
 *  repeat import that found nothing to add, "Nothing new on example.com: every product found is already here". */
export function runTitle(r: Pick<ImportRunRow, 'status' | 'host' | 'added' | 'skipped'>): string {
  switch (r.status) {
    case 'queued': return `Import from ${r.host} is queued`;
    case 'running': return `Importing from ${r.host}`;
    case 'done': return r.added > 0 ? `Imported ${count(r.added)} product${r.added === 1 ? '' : 's'} from ${r.host}`
      : r.skipped > 0 ? `Nothing new on ${r.host}: every product found is already here` : `Nothing was imported from ${r.host}`;
    case 'failed': return `Import from ${r.host} failed`;
    case 'cancelled': return `Import from ${r.host} was cancelled`;
  }
}

/** The counts that are not zero, in order: "480 found · 470 added · 10 already here · 12 left out by manufacturer · 3 out of stock · 2 failed". */
export function runCounts(r: Pick<ImportRunRow, 'found' | 'added' | 'skipped' | 'out_of_stock' | 'failed' | 'cursor'> & { maker_skipped?: number }): { n: number; label: string }[] {
  const est = r.cursor && typeof r.cursor.estimate === 'number' && r.cursor.estimate > 0 ? r.cursor.estimate : null;
  const out: { n: number; label: string }[] = [];
  if (r.found || est) out.push({ n: r.found, label: est ? `of about ${count(est)} found` : 'found' });
  if (r.added) out.push({ n: r.added, label: 'added' });
  if (r.skipped) out.push({ n: r.skipped, label: 'already here' });
  if (r.maker_skipped) out.push({ n: r.maker_skipped, label: 'left out by manufacturer' });
  if (r.out_of_stock) out.push({ n: r.out_of_stock, label: 'out of stock' });
  if (r.failed) out.push({ n: r.failed, label: 'failed' });
  return out;
}

/** The server's refusals are whole sentences written for staff ("This site asks automated visitors
 *  to stay away…"): friendlyError still maps network / permission errors, but a long plain sentence
 *  is shown as it is instead of its generic fallback. */
const plainSentence = (e: unknown) => {
  const m = e instanceof Error ? e.message.trim() : '';
  return m.length <= 300 && /^[A-Z][^{}<>]*[.!?]$/.test(m) ? m : undefined;
};
export const importError = (e: unknown) => friendlyError(e, plainSentence(e));

/** A run the store's own rules refused: trying again would only be refused again. */
export const refusedByStore = (error: string | null) => !!error && /^This (website does not allow|store is password-protected)/.test(error);
