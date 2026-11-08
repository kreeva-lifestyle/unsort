// Plain words for the import flow (copy-and-a11y.md §A): platform names,
// the estimate sentence, the primary button's label, run status labels and
// the one-line counts of a run. Pure functions — no React, no network.
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

/** "1,240" · "5000+" · null when unknown. */
export const estimateText = (e: number | string | null | undefined): string | null =>
  e == null || e === '' ? null : typeof e === 'number' ? (e > 0 ? count(e) : null) : String(e);

/** "About 1,240 products, 980 in stock" · "About 5000+ products" · "Product count unknown". */
export function estimateLine(c: Pick<ImportCheck, 'estimate' | 'estimate_in_stock'>): string {
  const all = estimateText(c.estimate), stock = estimateText(c.estimate_in_stock);
  if (!all) return 'Product count unknown';
  return `About ${all} product${all === '1' ? '' : 's'}${stock ? `, ${stock} in stock` : ''}`;
}

/** "Import about 980 products" (the in-stock count when only in-stock products are copied) · "Import products". */
export function importLabel(c: Pick<ImportCheck, 'estimate' | 'estimate_in_stock'>, inStockOnly: boolean): string {
  const n = estimateText(inStockOnly ? c.estimate_in_stock ?? c.estimate : c.estimate);
  return n ? `Import about ${n} products` : 'Import products';
}

/** A check that found nothing to copy: unknown platform and no products. */
export const nothingFound = (c: ImportCheck) => c.platform === 'unknown' && !c.sample.length && !estimateText(c.estimate);

/** The run's headline: "Importing from example.com", "Imported 975 products from example.com"… */
export function runTitle(r: Pick<ImportRunRow, 'status' | 'host' | 'added'>): string {
  switch (r.status) {
    case 'queued': return `Import from ${r.host} is queued`;
    case 'running': return `Importing from ${r.host}`;
    case 'done': return `Imported ${count(r.added)} product${r.added === 1 ? '' : 's'} from ${r.host}`;
    case 'failed': return `Import from ${r.host} failed`;
    case 'cancelled': return `Import from ${r.host} was cancelled`;
  }
}

/** The counts that are not zero, in order: "480 found · 470 added · 10 already here · 3 out of stock · 2 failed". */
export function runCounts(r: Pick<ImportRunRow, 'found' | 'added' | 'skipped' | 'out_of_stock' | 'failed' | 'cursor'>): { n: number; label: string }[] {
  const est = r.cursor && typeof r.cursor.estimate === 'number' && r.cursor.estimate > 0 ? r.cursor.estimate : null;
  const out: { n: number; label: string }[] = [];
  if (r.found || est) out.push({ n: r.found, label: est ? `of ~${count(est)} found` : 'found' });
  if (r.added) out.push({ n: r.added, label: 'added' });
  if (r.skipped) out.push({ n: r.skipped, label: 'already here' });
  if (r.out_of_stock) out.push({ n: r.out_of_stock, label: 'out of stock' });
  if (r.failed) out.push({ n: r.failed, label: 'failed' });
  return out;
}
