// The SKU sheet (owner's ask): right after the Indya master is imported,
// an Excel with the SKU every row will be looked up as — the size rules
// already applied (code-SIZE, a stuck-on size dropped, Unstitched as the
// bare code, corrections applied when a Correct-SKU sheet is loaded). The
// file goes to the vendors, so it is ONE column of distinct SKUs and
// nothing else (owner: "a sheet just with sku"); the per-row mapping stays
// in memory for the harness and the results table.
import { lookupKeys, normKey } from './indyaSku';
import type { MasterRow } from './indyaMaster';
import type { Corrections } from './indyaFiles';
import { saveWorkbook } from '../../../lib/xlsxDownload';
import { exportName, fileDate } from '../../../lib/exportName';

export interface SkuSheet { skus: string[]; rows: [string, string, string, string][] }

/** Pure: the canonical key per row (the stripped code-SIZE form) and the distinct list in file order. */
export function buildSkuSheet(master: MasterRow[], corrections?: Corrections | null): SkuSheet {
  const seen = new Set<string>();
  const skus: string[] = [];
  const rows: [string, string, string, string][] = [];
  for (const r of master) {
    const code = corrections ? (corrections.bySku.get(normKey(r.sku)) ?? corrections.byVendor.get(normKey(r.vendorSku)) ?? r.vendorSku) : r.vendorSku;
    const keys = lookupKeys(code, r.size);
    const sku = keys[keys.length - 1];
    rows.push([r.sku, r.vendorSku, r.size, sku]);
    if (!seen.has(sku)) { seen.add(sku); skus.push(sku); }
  }
  return { skus, rows };
}

export async function exportSkuSheet(master: MasterRow[], corrections?: Corrections | null): Promise<boolean> {
  const { skus } = buildSkuSheet(master, corrections);
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['SKU'], ...skus.map(s => [s])]);
  ws['!cols'] = [{ wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws, 'SKU');
  return saveWorkbook(wb, exportName('Indya-SKU-List', [fileDate()], 'xlsx'));
}
