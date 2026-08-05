// Turns the Master Assistant's on-screen comparison tables + the raw seller
// sheet into the ComparisonReport behind the one-workbook Excel download
// (see reportWorkbook.ts) and the Listing AI handoff.
//
// Everything is compared against the offline master sheet. The master's STOCK
// STATUS is ACTIVE / INACTIVE; ACTIVE = in stock, INACTIVE = out of stock. The
// seller sheet's own status column (when present) is read the same way. Brand
// is intentionally ignored — the seller doesn't care which brand a design is.
//
// This is deterministic set math over data already computed server-side (the
// edge fn matched every SKU with its fuzzy ladder); the AI never touches it.
import type { AssistantTable } from './AssistantTables';
import type { SellerSheet } from './sellerSheetParse';

export interface ComparisonReport {
  seller: string;
  sellerStatusCol: string | null;   // null = seller sheet had no stock/status column
  stockOut: string[][];             // seller must mark these OUT of stock
  inStock: string[][];              // seller must put these back IN stock
  notUploaded: string[][];          // in the master, missing from the seller sheet
  matched: number;                  // TRUE count (from the table title, not the capped rows)
  undetermined: number;             // matched, but status missing/mixed on one side
  warnings: string[];               // truncation/degradation notes — baked into the workbook
}

const normSku = (v: string) => (v || '').trim().toUpperCase();

// A stock/status value → in stock / out of stock / can't tell. Negations
// ("Not Available", "Not Active", "not in stock") are tested FIRST — their
// inner positive word would otherwise trip the IN branch. Then out-of-stock
// words, so "Inactive" never trips "active".
type Stock = 'in' | 'out' | 'unknown';
const NOT_RE = /\bnot?\b[\s-]*(available|active|live|enabled?|published|listed|online|sell?able|in\s*stock)/i;
const OUT_RE = /\b(inactive|out\s*of\s*stock|oos|disabled?|unavailable|sold\s*out|delisted?|discontinued?|hidden|draft|removed|paused)\b/i;
const IN_RE = /\b(active|in\s*stock|instock|live|enabled?|available|listed|published|online)\b/i;
export const stockClass = (v: string): Stock => {
  const s = (v || '').trim();
  if (!s) return 'unknown';
  if (NOT_RE.test(s) || OUT_RE.test(s) || /^(no|false|off|0|n)$/i.test(s)) return 'out';
  if (IN_RE.test(s) || /^(yes|true|on|1|y)$/i.test(s)) return 'in';
  return 'unknown';
};

const findTable = (tables: AssistantTable[], re: RegExp) => tables.find(t => re.test(t.title));
// The seller SKU string in a matched row is capped with a SPACE-separated
// "+N" marker ("745, 745-XL +3") — strip it BEFORE splitting on commas.
const sellerSkusOf = (cell: string) => (cell || '').replace(/\s\+\d+$/, '').split(',').map(s => s.trim()).filter(Boolean);

// Build the report from the edge tables + the seller sheet that produced them.
// Returns null when no seller comparison was run (no Matched table).
export function buildComparisonReport(tables: AssistantTable[], seller: SellerSheet, warnings: string[]): ComparisonReport | null {
  const matchedT = findTable(tables, /^Matched - in master/);
  if (!matchedT) return null;
  const notUpT = findTable(tables, /^Not uploaded by seller/);
  const unknownT = findTable(tables, /^Unknown SKUs/);

  const mc = matchedT.columns;
  const iSellerSku = mc.indexOf('SELLER SKU(S)');
  // Master columns are the CONTIGUOUS TAIL of the matched table. A seller
  // column that happens to start with "MASTER " (ALL-CAPS exports) must not
  // hijack the lookup — find the tail start first, search only inside it.
  const tail = mc.findIndex((c, i) => i >= 3 && c.startsWith('MASTER ') && mc.slice(i).every(x => x.startsWith('MASTER ')));
  let iMasterStatus = -1;
  if (tail >= 0) {
    const j = mc.slice(tail).indexOf('MASTER STOCK STATUS');
    iMasterStatus = j >= 0 ? tail + j : tail; // first master col = the edge's primary status col
  }

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

  // Which seller column is the stock/status? NAME evidence is required — a
  // value-only pick let a "COD Available" Y/N column drive the whole workbook.
  // Headerless sheets (synthesized "COL n" names) have no names to test, so
  // they fall back to value scoring with a MAJORITY threshold instead.
  const NAME_RE = /status|active|live|state|stock|availab|enabl|inventory/i;
  const headerless = seller.headers.every(h => /^COL \d+$/.test(h));
  let statusCol = -1, bestScore = -1;
  for (let ci = 0; ci < seller.headers.length; ci++) {
    if (ci === skuCol) continue;
    if (!headerless && !NAME_RE.test(seller.headers[ci])) continue;
    let classifiable = 0;
    for (const r of seller.rows) if (stockClass(r[ci]) !== 'unknown') classifiable++;
    if (classifiable === 0 || (headerless && classifiable * 2 < seller.rows.length)) continue;
    if (classifiable > bestScore) { bestScore = classifiable; statusCol = ci; }
  }

  // seller SKU -> its raw stock/status value (first row wins on duplicates).
  const sellerStatus = new Map<string, string>();
  if (statusCol >= 0) for (const r of seller.rows) { const k = normSku(r[skuCol]); if (k && !sellerStatus.has(k)) sellerStatus.set(k, r[statusCol] || ''); }

  // Prefer the edge's aggregated status cell: it is computed over ALL size-
  // variant rows of the group, while SELLER SKU(S) lists at most 6. The edge
  // carries its validated status column FIRST (mc[3]); match positionally,
  // then by name — but never past the master tail (a master column sharing
  // the name must not win). "MIXED (...)" means the variants disagree.
  const statusHdr = statusCol >= 0 ? seller.headers[statusCol] : '';
  let iAggStatus = -1;
  if (statusCol >= 0) {
    if (mc[3] === statusHdr) iAggStatus = 3;
    else { const j = mc.indexOf(statusHdr); iAggStatus = j >= 3 && (tail < 0 || j < tail) ? j : -1; }
  }

  const stockOut: string[][] = [];
  const inStock: string[][] = [];
  let undetermined = 0;
  for (const r of matchedT.rows) {
    const sku = r[0];
    const sellerSkuCell = r[iSellerSku] || '';
    const masterVal = iMasterStatus >= 0 ? (r[iMasterStatus] || '') : '';
    const m = stockClass(masterVal);

    // Seller side: the group's status across ALL its size variants. Never
    // run a "MIXED (...)" value through stockClass — the words inside the
    // parens would false-match the in/out regexes.
    let sellerVal = '';
    let s: Stock;
    if (iAggStatus >= 0) {
      sellerVal = r[iAggStatus] || '';
      s = /^MIXED\b/i.test(sellerVal.trim()) ? 'unknown' : stockClass(sellerVal);
    } else {
      // Fallback (aggregated column absent): derive from the listed seller
      // SKUs; if they split, we can't act on it — count it as undetermined.
      const classes = new Set<Stock>();
      if (statusCol >= 0) for (const sv of sellerSkusOf(sellerSkuCell)) {
        const raw = sellerStatus.get(normSku(sv));
        if (raw == null) continue;
        if (!sellerVal) sellerVal = raw;
        classes.add(stockClass(raw));
      }
      classes.delete('unknown');
      s = classes.size === 1 ? [...classes][0] : 'unknown';
    }

    const row = [sku, sellerSkuCell, masterVal || '(blank)', sellerVal || '(blank)'];
    if (m === 'out' && s === 'in') stockOut.push(row);
    else if (m === 'in' && s === 'out') inStock.push(row);
    else if (m === 'unknown' || s === 'unknown') undetermined++;
  }

  const notUploaded: string[][] = [];
  if (notUpT) {
    const nc = notUpT.columns;
    const iCat = nc.indexOf('CATEGORY');
    // The master's status header isn't always literally "STOCK STATUS"
    // ("STATUS", "LISTING STATUS"...) — fall back to the first MASTER column
    // (safe here: this table carries no seller columns).
    let iSt = nc.indexOf('MASTER STOCK STATUS');
    if (iSt < 0) iSt = nc.findIndex(c => c.startsWith('MASTER '));
    for (const r of notUpT.rows) notUploaded.push([r[0] || '', iCat >= 0 ? (r[iCat] || '') : '', iSt >= 0 ? (r[iSt] || '') : '']);
  }

  // The table ROWS are capped server-side; the title carries the true count.
  const matched = Number((matchedT.title.match(/\((\d+)\)\s*$/) || [])[1] || matchedT.rows.length);

  return {
    seller: seller.name,
    sellerStatusCol: statusCol >= 0 ? seller.headers[statusCol] : null,
    stockOut, inStock, notUploaded, matched, undetermined, warnings,
  };
}
