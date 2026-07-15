// Export generated listings in the template's exact column order, so the
// file can be uploaded to the marketplace as-is.
import * as XLSX from 'xlsx';
import type { GenRow } from './api';

export function exportFilledXlsx(headers: string[], rows: GenRow[], templateName: string): void {
  const aoa = [headers, ...rows.map(r => r.values)];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Listings');
  const safe = templateName.replace(/[^\w-]+/g, '_').slice(0, 40) || 'Listings';
  XLSX.writeFile(wb, `${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
