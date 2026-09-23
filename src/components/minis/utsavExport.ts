// Utsav Import's export: the rows as imported with the ARYA SKU column, as
// an .xls for Utsav's upload. Two flavours (owner's ask): the stock as
// entered, and "with alterations" — every size also counting the next size
// up (see lib/sizeAlteration.ts). Split out of Minis.tsx.
import * as XLSX from 'xlsx';
import { saveWorkbook } from '../../lib/xlsxDownload';
import { exportName, fileDate } from '../../lib/exportName';
import { withAlterations } from '../../lib/sizeAlteration';

/** Utsav's numeric sizes → the size names our SKUs carry. */
export const UTSAV_SIZE_MAP: Record<number, string> = { 32: 'XXS', 34: 'XS', 36: 'S', 38: 'M', 40: 'L', 42: 'XL', 44: 'XXL' };

export interface UtsavRow { relid: string; vendorno: string; stock: number; leadtime: number; block: number; designno: string; size: number; catalogname: string; updateddate: string; aryaSku: string }

/** Stock per row, with the next size up of the same design added when
 *  `alterations` is on. A row without a mapped size keeps its own number. */
export function utsavStocks(rows: UtsavRow[], alterations: boolean): number[] {
  if (!alterations) return rows.map(r => r.stock);
  return withAlterations(rows, r => (r.designno && UTSAV_SIZE_MAP[r.size] ? { product: r.designno.toUpperCase(), size: UTSAV_SIZE_MAP[r.size] } : null), r => r.stock, 'sum');
}

export function exportUtsavXls(rows: UtsavRow[], alterations: boolean): Promise<boolean> {
  const stocks = utsavStocks(rows, alterations);
  const data = rows.map((r, i) => ({ relid: r.relid, vendorno: r.vendorno, stock: stocks[i], leadtime: r.leadtime, block: r.block, 'ARYA SKU': r.aryaSku }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Utsav Export');
  return saveWorkbook(wb, exportName('Utsav-Upload', [alterations ? 'alterations' : '', fileDate()], 'xls'));
}
