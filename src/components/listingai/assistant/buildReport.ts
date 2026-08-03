// Turns the Master Assistant's on-screen comparison tables + the raw seller
// sheet into ONE downloadable Excel workbook (Summary + three action sheets),
// so the owner hands the seller a single file instead of stitching CSVs.
//
// Everything is compared against the offline master sheet. The master's STOCK
// STATUS is ACTIVE / INACTIVE; ACTIVE = in stock, INACTIVE = out of stock. The
// seller sheet's own status column (when present) is read the same way. Brand
// is intentionally ignored — the seller doesn't care which brand a design is.
//
// This is deterministic set math over data already computed server-side (the
// edge fn matched every SKU with its fuzzy ladder); the AI never touches it.
import * as XLSX from 'xlsx';
import { exportName, fileDate } from '../../../lib/exportName';
import type { AssistantTable } from './AssistantTables';
import type { SellerSheet } from './sellerSheetParse';

export interface ComparisonReport {
  seller: string;
  sellerStatusCol: string | null;   // null = seller sheet had no stock/status column
  stockOut: string[][];             // seller must mark these OUT of stock
  inStock: string[][];              // seller must put these back IN stock
  notUploaded: string[][];          // in the master, missing from the seller sheet
  matched: number;
  undetermined: number;             // matched, but status missing/mixed on one side
}

const normSku = (v: string) => (v || '').trim().toUpperCase();

// A stock/status value → in stock / out of stock / can't tell. Out-of-stock
// words are tested first so "Inactive" never trips the "active" branch.
type Stock = 'in' | 'out' | 'unknown';
const OUT_RE = /\b(inactive|out\s*of\s*stock|oos|disabled?|unavailable|sold\s*out|delisted?|discontinued?|hidden|draft|removed|paused)\b/i;
const IN_RE = /\b(active|in\s*stock|instock|live|enabled?|available|listed|published|online)\b/i;
export const stockClass = (v: string): Stock => {
  const s = (v || '').trim();
  if (!s) return 'unknown';
  if (OUT_RE.test(s) || /^(no|false|off|0|n)$/i.test(s)) return 'out';
  if (IN_RE.test(s) || /^(yes|true|on|1|y)$/i.test(s)) return 'in';
  return 'unknown';
};

const findTable = (tables: AssistantTable[], re: RegExp) => tables.find(t => re.test(t.title));
// The seller SKU string in a matched row is capped (e.g. "745, 745-XL +3");
// split it, drop the "+N more" marker.
const sellerSkusOf = (cell: string) => (cell || '').split(',').map(s => s.trim()).filter(s => s && !s.startsWith('+'));

// Build the report from the edge tables + the seller sheet that produced them.
// Returns null when no seller comparison was run (no Matched table).
export function buildComparisonReport(tables: AssistantTable[], seller: SellerSheet): ComparisonReport | null {
  const matchedT = findTable(tables, /^Matched - in master/);
  if (!matchedT) return null;
  const notUpT = findTable(tables, /^Not uploaded by seller/);
  const unknownT = findTable(tables, /^Unknown SKUs/);

  const mc = matchedT.columns;
  const iSellerSku = mc.indexOf('SELLER SKU(S)');
  let iMasterStatus = mc.indexOf('MASTER STOCK STATUS');
  if (iMasterStatus < 0) iMasterStatus = mc.findIndex(c => c.startsWith('MASTER '));

  // Which seller column is the SKU? The one whose values overlap the SKUs the
  // edge already resolved (matched seller SKUs + unknown SKUs) — mirrors the
  // server's own value-overlap detection, so we pick the same column.
  const known = new Set<string>();
  for (const r of matchedT.rows) for (const s of sellerSkusOf(r[iSellerSku])) known.add(normSku(s));
  if (unknownT) for (const r of unknownT.rows) { const v = normSku(r[0]); if (v) known.add(v); }
  let skuCol = 0, bestHits = -1;
  for (let ci = 0; ci < seller.headers.length; ci++) {
    let n = 0;
    for (const r of seller.rows) if (known.has(normSku(r[ci]))) n++;
    if (n > bestHits) { bestHits = n; skuCol = ci; }
  }

  // Which seller column is the stock/status? Prefer a status-named column;
  // among candidates, the one whose values actually read as in/out stock
  // (also finds it in a header-less export where names are "COL 3").
  const NAME_RE = /status|active|live|state|stock|availab|enabl|inventory/i;
  let statusCol = -1, bestScore = -1;
  for (let ci = 0; ci < seller.headers.length; ci++) {
    if (ci === skuCol) continue;
    let classifiable = 0;
    for (const r of seller.rows) if (stockClass(r[ci]) !== 'unknown') classifiable++;
    if (classifiable === 0) continue;
    const score = (NAME_RE.test(seller.headers[ci]) ? 1_000_000 : 0) + classifiable;
    if (score > bestScore) { bestScore = score; statusCol = ci; }
  }

  // seller SKU -> its raw stock/status value (first row wins on duplicates).
  const sellerStatus = new Map<string, string>();
  if (statusCol >= 0) for (const r of seller.rows) { const k = normSku(r[skuCol]); if (k && !sellerStatus.has(k)) sellerStatus.set(k, r[statusCol] || ''); }

  const stockOut: string[][] = [];
  const inStock: string[][] = [];
  let undetermined = 0;
  for (const r of matchedT.rows) {
    const sku = r[0];
    const sellerSkuCell = r[iSellerSku] || '';
    const masterVal = iMasterStatus >= 0 ? (r[iMasterStatus] || '') : '';
    const m = stockClass(masterVal);

    // Seller side: the listed seller SKUs should agree; if they split, we
    // can't act on it automatically — count it as undetermined.
    let sellerVal = '';
    const classes = new Set<Stock>();
    if (statusCol >= 0) for (const s of sellerSkusOf(sellerSkuCell)) {
      const raw = sellerStatus.get(normSku(s));
      if (raw == null) continue;
      if (!sellerVal) sellerVal = raw;
      classes.add(stockClass(raw));
    }
    classes.delete('unknown');
    const s: Stock = classes.size === 1 ? [...classes][0] : 'unknown';

    const row = [sku, sellerSkuCell, masterVal || '(blank)', sellerVal || '(blank)'];
    if (m === 'out' && s === 'in') stockOut.push(row);
    else if (m === 'in' && s === 'out') inStock.push(row);
    else if (m === 'unknown' || s === 'unknown') undetermined++;
  }

  const notUploaded: string[][] = [];
  if (notUpT) {
    const nc = notUpT.columns;
    const iCat = nc.indexOf('CATEGORY');
    const iSt = nc.indexOf('MASTER STOCK STATUS');
    for (const r of notUpT.rows) notUploaded.push([r[0] || '', iCat >= 0 ? (r[iCat] || '') : '', iSt >= 0 ? (r[iSt] || '') : '']);
  }

  return {
    seller: seller.name,
    sellerStatusCol: statusCol >= 0 ? seller.headers[statusCol] : null,
    stockOut, inStock, notUploaded,
    matched: matchedT.rows.length,
    undetermined,
  };
}

// Build the single .xlsx workbook and trigger the download.
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
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');

  const add = (name: string, cols: string[], rows: string[][]) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cols, ...(rows.length ? rows : [cols.map(() => '')])]), name);
  add('Mark Out of Stock', ['SKU', 'SELLER SKU(S)', 'MASTER STATUS', 'SELLER STATUS'], rep.stockOut);
  add('Mark In Stock', ['SKU', 'SELLER SKU(S)', 'MASTER STATUS', 'SELLER STATUS'], rep.inStock);
  add('Not Uploaded', ['SKU', 'CATEGORY', 'MASTER STATUS'], rep.notUploaded);

  XLSX.writeFile(wb, exportName('Seller-Comparison', [rep.seller.replace(/\.[^.]+$/, ''), fileDate()], 'xlsx'));
}
