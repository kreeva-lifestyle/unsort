// The one-workbook Excel download for a seller comparison (Summary + three
// action sheets), split out of buildReport.ts for the file budget. Any
// truncation/degradation warnings ride INTO the Summary sheet — a toast dies
// in seconds, but this file is the artifact the owner mails to the seller.
//
// Presentation notes: xlsx@0.18.5 is the community build — it cannot write cell
// fonts, fills or colours, and it does not write freeze panes. Everything below
// is done with what it DOES write: column widths (!cols), merged banner rows
// (!merges) and autofilter. That is enough to make the file readable on open.
import * as XLSX from 'xlsx';
import { exportName, fileDate } from '../../../lib/exportName';
import type { ComparisonReport } from './buildReport';

type Cell = string | number;

// Width from the widest value in each column, so a SKU column stays narrow and
// a "what to do" sentence gets room. Clamped: below 10 the header truncates,
// above 60 the sheet scrolls sideways forever.
//
// Single-cell rows are EXCLUDED from the measurement: the banner, the legend
// lines and the empty-sheet note are full-width prose, and letting them size
// column A blew it out to 60 and shoved the real key/value block off screen.
// In Excel that prose simply overflows into the blank cells beside it.
const colWidths = (rows: Cell[][]): { wch: number }[] => {
  const n = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const measured = rows.filter(r => r.length > 1);
  return Array.from({ length: n }, (_, c) => {
    const longest = measured.reduce((m, r) => Math.max(m, String(r[c] ?? '').length), 0);
    return { wch: Math.min(60, Math.max(10, longest + 2)) };
  });
};

const sheet = (wb: XLSX.WorkBook, name: string, rows: Cell[][], opts?: { filter?: boolean; merges?: XLSX.Range[] }) => {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = colWidths(rows);
  if (opts?.merges) ws['!merges'] = opts.merges;
  // Autofilter over the header row + data. Excel refuses a range with no data
  // rows, so an empty sheet (which carries an explanation instead) gets none.
  if (opts?.filter && rows.length > 1) {
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: Math.max(0, rows[0].length - 1) } }) };
  }
  XLSX.utils.book_append_sheet(wb, ws, name);
};

export function downloadComparisonWorkbook(rep: ComparisonReport): void {
  const wb = XLSX.utils.book_new();

  // Tab names are NUMBERED to match the order the Summary refers to them in —
  // unnumbered tabs next to a body that said "2. / 3. / 4." was the single most
  // confusing thing about this file.
  const SHEETS = {
    out: '2 Mark Out of Stock',
    in: '3 Mark In Stock',
    notUp: '4 Not Uploaded',
  };

  const summary: Cell[][] = [
    ['MASTER ASSISTANT — SELLER STOCK COMPARISON'],
    [],
    ['Seller sheet', rep.seller],
    ['Generated', fileDate()],
    ['Matched products', rep.matched],
    ['', '(in both your master sheet and the seller sheet)'],
    [],
    ['WHAT EACH SHEET IS FOR'],
    ['SHEET', 'WHAT THE SELLER MUST DO', 'COUNT'],
    [SHEETS.out, 'OUT of stock in the master (INACTIVE) but the seller still shows them IN stock — mark these OUT of stock.', rep.stockOut.length],
    [SHEETS.in, 'IN stock in the master (ACTIVE) but the seller shows them OUT of stock — put these back IN stock.', rep.inStock.length],
    [SHEETS.notUp, 'In the master but not in the seller sheet at all. Upload the ones that are ACTIVE.', rep.notUploaded.length],
    [],
    ['HOW TO READ IT'],
    ['Everything is compared against your offline MASTER sheet.'],
    ['ACTIVE = in stock.   INACTIVE = out of stock.   Brand is ignored.'],
    rep.sellerStatusCol
      ? [`Seller stock column used for the comparison: "${rep.sellerStatusCol}".`]
      : ['No stock/status column was found in the seller sheet, so sheets 2 and 3 are empty. Add an Active/Inactive (or In Stock/Out of Stock) column to the seller sheet and run the comparison again.'],
    ...(rep.undetermined
      ? [[`${rep.undetermined} matched products could not be classified (status missing, or mixed across sizes) — review those by hand.`]]
      : []),
    // Warnings get their own heading instead of trailing off the bottom as
    // loose rows — they change how every count above should be read.
    ...(rep.warnings.length ? [[], ['⚠ NOTES — read these before acting on the counts above'], ...rep.warnings.map(w => [w])] : []),
  ];
  // Banner across the width of the sheet table below it.
  sheet(wb, '1 Summary', summary, { merges: [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }] });

  // An empty action sheet says so. It used to write a row of empty strings,
  // which opened as a blank ghost row under the headers and read like data
  // that failed to load. The note is merged across the header width so it
  // reads as a banner instead of looking like a value in the SKU column.
  const action = (name: string, cols: string[], rows: string[][], emptyNote: string) =>
    sheet(wb, name, rows.length ? [cols, ...rows] : [cols, [emptyNote]], {
      filter: rows.length > 0,
      merges: rows.length ? undefined : [{ s: { r: 1, c: 0 }, e: { r: 1, c: cols.length - 1 } }],
    });

  const statusCols = ['SKU', 'SELLER SKU(S)', 'MASTER STATUS', 'SELLER STATUS'];
  action(SHEETS.out, statusCols, rep.stockOut,
    'Nothing to do here — the seller is not showing any out-of-stock product as in stock.');
  action(SHEETS.in, statusCols, rep.inStock,
    'Nothing to do here — the seller is not showing any in-stock product as out of stock.');
  action(SHEETS.notUp, ['SKU', 'CATEGORY', 'MASTER STATUS'], rep.notUploaded,
    'Nothing to do here — the seller has uploaded every product in your master sheet.');

  XLSX.writeFile(wb, exportName('Seller-Comparison', [rep.seller.replace(/\.[^.]+$/, ''), fileDate()], 'xlsx'));
}
