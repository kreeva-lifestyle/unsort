// The SKU sheet (owner's ask): right after the Indya master is imported,
// an Excel with the SKU every row will be looked up as — the size rules
// already applied (code-SIZE, a stuck-on size dropped, Unstitched as the
// bare code, corrections applied when a Correct-SKU sheet is loaded). The
// file goes to the vendors, so it is ONE column of distinct SKUs and
// nothing else (owner: "a sheet just with sku"); the per-row mapping stays
// in memory for the harness and the results table.
import { lookupKeys, normKey, shapeKey, isAboveXXL } from './indyaSku';
import type { MasterRow } from './indyaMaster';
import type { Corrections } from './indyaFiles';
import { saveWorkbook } from '../../../lib/xlsxDownload';
import { exportName, fileDate } from '../../../lib/exportName';

export interface SkuSheet { skus: string[]; rows: [string, string, string, string][]; skipped: number }

/** Pure: the canonical key per row (the stripped code-SIZE form, 2XL spelled
 *  XXL) and the distinct list in file order. Sizes above XXL are left out
 *  (vendors do not make them; `skipped` counts those rows). Two spellings of
 *  one product ("TF353-S" / "TF-353-S", both in Indya's file) collapse to
 *  the dashed one, so a vendor never sees the same product twice. */
export function buildSkuSheet(master: MasterRow[], corrections?: Corrections | null): SkuSheet {
  const byShape = new Map<string, string>();
  const order: string[] = [];
  const rows: [string, string, string, string][] = [];
  let skipped = 0;
  for (const r of master) {
    const code = corrections ? (corrections.bySku.get(normKey(r.sku)) ?? corrections.byVendor.get(normKey(r.vendorSku)) ?? r.vendorSku) : r.vendorSku;
    const keys = lookupKeys(code, r.size);
    const sku = keys[keys.length - 1];
    rows.push([r.sku, r.vendorSku, r.size, sku]);
    if (isAboveXXL(r.size)) { skipped++; continue; }
    const shape = shapeKey(sku);
    const cur = byShape.get(shape);
    if (cur === undefined) { byShape.set(shape, sku); order.push(shape); }
    else if ((sku.match(/-/g) || []).length > (cur.match(/-/g) || []).length) byShape.set(shape, sku);
  }
  return { skus: order.map(s => byShape.get(s)!), rows, skipped };
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
