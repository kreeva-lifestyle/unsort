// Brand Tags ⇄ Excel. The Excel library is ~425 KB, so it is loaded here on
// first use (an import or an export), not when the page opens.
//
// Imports go through import_brand_tags(): the database writes only labels
// that are new or really different and reports how many of each. Before, the
// whole file was rewritten row by row every time, changed or not (owner,
// 2026-11-10).
import { supabase } from '../../lib/supabase';
import { saveWorkbook } from '../../lib/xlsxDownload';
import { friendlyError } from '../../lib/friendlyError';
import { DEFAULT_MKTD, MARKETPLACE_BRAND, uid, validateRow, type BrandTagRow } from './tagModel';

type SheetRow = Record<string, unknown>;
const BATCH = 500;

/** First sheet of an Excel / CSV file as plain rows, or null when it has no sheets. */
export async function readSheet(buf: ArrayBuffer): Promise<SheetRow[] | null> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  if (!wb.SheetNames.length) return null;
  return XLSX.utils.sheet_to_json<SheetRow>(wb.Sheets[wb.SheetNames[0]]);
}

/** Save rows as a one-sheet workbook. Resolves false when the share sheet was dismissed. */
export async function saveSheet(rows: Record<string, unknown>[], sheet: string, fileName: string): Promise<boolean> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheet);
  return saveWorkbook(wb, fileName);
}

/** Excel rows → labels, using the template's column headers. */
export const rowsFromSheet = (json: SheetRow[]): BrandTagRow[] => json.map(d => {
  // Auto-map brand from the Marketplace column if BRAND NAME is missing
  let brand = String(d['BRAND NAME'] ?? '');
  if (!brand) {
    const mp = String(d['Marketplace'] || d['marketplace'] || '').trim().toLowerCase();
    if (mp) brand = 'BRAND NAME: ' + (MARKETPLACE_BRAND[mp] || mp.toUpperCase());
  }
  return {
    id: uid(),
    brand,
    ean: String(d['EAN'] ?? ''),
    sku: String(d['SKU'] ?? '').split('*')[0].trim(), // strip *copies if present
    qty: String(d['QTY'] ?? ''),
    mrp: Number(d['MRP']) || 0,
    size: String(d['SIZE'] ?? ''),
    product: String(d['PRODUCT'] ?? ''),
    color: String(d['Color'] ?? ''),
    mktd: String(d['MKTD & DIST. BY'] ?? '') || DEFAULT_MKTD,
    jioCode: String(d['Jio Code'] ?? ''),
    copies: Number(d['COPIES']) || 0,
  };
});

/** One line per label that cannot be imported, for the downloadable error report. */
export const importProblems = (rows: BrandTagRow[]): Record<string, unknown>[] =>
  rows.flatMap((r, i) => {
    const bad = validateRow(r);
    return bad ? [{ Row: i + 2, SKU: r.sku || '(empty)', MissingField: bad, EAN: r.ean, Size: r.size, Brand: r.brand }] : [];
  });

export interface ImportResult {
  added: number; changed: number; unchanged: number; duplicates: number;
  failed: number; failedBatches: number[]; errors: string[];
}

/** Send the labels in batches of 500. A failed batch is counted and reported; the rest still go. */
export async function importTags(rows: BrandTagRow[], onProgress: (done: number, total: number) => void): Promise<ImportResult> {
  const res: ImportResult = { added: 0, changed: 0, unchanged: 0, duplicates: 0, failed: 0, failedBatches: [], errors: [] };
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map(r => ({
      brand: r.brand, ean: r.ean, sku: r.sku, qty: r.qty, mrp: r.mrp, size: r.size,
      product: r.product, color: r.color, mktd: r.mktd, jio_code: r.jioCode, copies: r.copies,
    }));
    const { data, error } = await supabase.rpc('import_brand_tags', { p_rows: batch });
    if (error) {
      res.failed += batch.length;
      res.failedBatches.push(Math.floor(i / BATCH) + 1);
      res.errors.push(friendlyError(error));
    } else {
      const d = (data || {}) as Partial<ImportResult>;
      res.added += d.added || 0; res.changed += d.changed || 0;
      res.unchanged += d.unchanged || 0; res.duplicates += d.duplicates || 0;
    }
    onProgress(Math.min(i + BATCH, rows.length), rows.length);
  }
  return res;
}

/** "120 new, 14 changed, 3,866 unchanged" (+ repeats merged, when the file had any). */
export const importSummary = (r: ImportResult): string => {
  const n = (v: number) => v.toLocaleString('en-IN');
  const parts = [`${n(r.added)} new`, `${n(r.changed)} changed`, `${n(r.unchanged)} unchanged`];
  if (r.duplicates > 0) parts.push(`${n(r.duplicates)} repeated row${r.duplicates === 1 ? '' : 's'} in the file merged`);
  return parts.join(', ');
};
