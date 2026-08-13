// Reading the two kinds of sheet this module accepts. Pure functions, kept
// out of the component so they can be run against a real Product Master
// Report without a browser.
import * as XLSX from 'xlsx';
import {
  designKey, rowKey, normSize, pickCol, toQty,
  SKU_COL, QTY_COL, SIZE_COL, type IndyaRow, type StockRow,
} from './indyaMatch';

export class SheetError extends Error {}

const firstSheet = (buf: ArrayBuffer): Record<string, unknown>[] => {
  // Indya's ".xls" is really an HTML table; SheetJS detects that from the
  // bytes, so no special-casing is needed here.
  const wb = XLSX.read(buf, { type: 'array' });
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
};

/** Indya's report → rows held VERBATIM (their codes carry mistakes and must
 *  survive the round trip untouched). */
export function parseIndyaSheet(buf: ArrayBuffer): IndyaRow[] {
  const raw = firstSheet(buf);
  const headers = Object.keys(raw[0] || {});
  const vCol = pickCol(headers, [/^vendorsku$/, /vendor/, ...SKU_COL]);
  const sCol = pickCol(headers, SIZE_COL);
  const kCol = pickCol(headers, [/^sku$/, /sku/]);
  const qCol = pickCol(headers, [/^stock$/, ...QTY_COL]);
  if (!vCol || !sCol) throw new SheetError(`needs a VendorSKU and a Size column — found ${headers.join(', ') || 'no headers'}`);
  const rows = raw.map(r => ({
    sku: String(r[kCol || ''] ?? ''),
    vendorSku: String(r[vCol] ?? ''),
    size: String(r[sCol] ?? ''),
    stock: (r[qCol || ''] ?? '') as number | string,
  })).filter(r => r.vendorSku.trim());
  if (!rows.length) throw new SheetError('no rows with a VendorSKU');
  return rows;
}

export interface ParsedStock { rows: StockRow[]; sized: boolean; note: string }

/** A stock sheet → per design+size quantities. A sheet with no size column can
 *  only speak per DESIGN, which the caller must handle deliberately. */
export function parseStockSheet(buf: ArrayBuffer): ParsedStock {
  const raw = firstSheet(buf);
  const headers = Object.keys(raw[0] || {});
  const skuCol = pickCol(headers, SKU_COL);
  const qtyCol = pickCol(headers, QTY_COL);
  const sizeCol = pickCol(headers, SIZE_COL);
  if (!skuCol || !qtyCol) throw new SheetError(`could not find a code column and a quantity column (${headers.join(', ') || 'no headers'})`);
  const rows: StockRow[] = [];
  for (const r of raw) {
    const code = String(r[skuCol] ?? '').trim();
    if (!code) continue;
    const size = sizeCol ? String(r[sizeCol] ?? '') : '';
    const hasSize = !!(sizeCol && normSize(size));
    rows.push({ key: hasSize ? rowKey(code, size) : '', base: designKey(code), qty: toQty(r[qtyCol]), hasSize });
  }
  if (!rows.length) throw new SheetError('no usable rows');
  const sized = rows.some(r => r.hasSize);
  return { rows, sized, note: sized ? `${skuCol} + ${sizeCol} + ${qtyCol}` : `${skuCol} + ${qtyCol} — no size column` };
}
