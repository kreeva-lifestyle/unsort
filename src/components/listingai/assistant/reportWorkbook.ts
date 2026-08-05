// The one-workbook Excel download for a seller comparison (Summary + three
// action sheets), split out of buildReport.ts for the file budget. Any
// truncation/degradation warnings ride INTO the Summary sheet — a toast dies
// in seconds, but this file is the artifact the owner mails to the seller.
import * as XLSX from 'xlsx';
import { exportName, fileDate } from '../../../lib/exportName';
import type { ComparisonReport } from './buildReport';

export function downloadComparisonWorkbook(rep: ComparisonReport): void {
  const wb = XLSX.utils.book_new();

  const summary: (string | number)[][] = [
    ['MASTER ASSISTANT — SELLER STOCK COMPARISON'],
    [`Seller sheet: ${rep.seller}`],
    [`Generated: ${fileDate()}`],
    [],
    ['Everything below is compared against your offline MASTER sheet.'],
    ['ACTIVE = In stock.   INACTIVE = Out of stock.   Brand is ignored.'],
    [`Matched products (in both master and seller sheet): ${rep.matched}`],
    [],
    ['SHEET', 'WHAT TO DO', 'COUNT'],
    ['2. Mark Out of Stock', 'OUT of stock in the master (INACTIVE) but the seller still shows them IN stock — the seller must mark these OUT of stock.', rep.stockOut.length],
    ['3. Mark In Stock', 'IN stock in the master (ACTIVE) but the seller shows them OUT of stock — the seller must put these back IN stock.', rep.inStock.length],
    ['4. Not Uploaded', 'In the master but not in the seller sheet at all. Upload the ones that are ACTIVE.', rep.notUploaded.length],
    [],
    rep.sellerStatusCol
      ? [`Seller stock column used for the comparison: "${rep.sellerStatusCol}".`]
      : ['NOTE: no stock/status column was found in the seller sheet, so "Mark Out of Stock" and "Mark In Stock" are empty. Add an Active/Inactive (or In Stock/Out of Stock) column to the seller sheet and re-run to get those.'],
    ...(rep.undetermined ? [[`${rep.undetermined} matched products could not be classified (status missing or mixed across sizes) — review them by hand.`]] : []),
    ...(rep.warnings.length ? [[], ...rep.warnings.map(w => [`⚠ ${w}`])] : []),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');

  const add = (name: string, cols: string[], rows: string[][]) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cols, ...(rows.length ? rows : [cols.map(() => '')])]), name);
  add('Mark Out of Stock', ['SKU', 'SELLER SKU(S)', 'MASTER STATUS', 'SELLER STATUS'], rep.stockOut);
  add('Mark In Stock', ['SKU', 'SELLER SKU(S)', 'MASTER STATUS', 'SELLER STATUS'], rep.inStock);
  add('Not Uploaded', ['SKU', 'CATEGORY', 'MASTER STATUS'], rep.notUploaded);

  XLSX.writeFile(wb, exportName('Seller-Comparison', [rep.seller.replace(/\.[^.]+$/, ''), fileDate()], 'xlsx'));
}
