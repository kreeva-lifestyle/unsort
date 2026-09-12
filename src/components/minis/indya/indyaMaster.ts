// Indya's "ProductMasterReport.xls" is not a spreadsheet: it is one HTML
// <table> (SKU | VendorSKU | Size | Stock), machine-generated, ASCII, CRLF.
// The owner must hand the SAME file back with only Stock changed, so we
// never re-serialise it. We locate each Stock cell's byte range and copy
// every other byte verbatim. Pure functions — the harness runs them on the
// real report.
//
// Offsets: the text is decoded as latin1 (one char per byte), so a string
// offset IS a byte offset for any ASCII-superset encoding. The rewrite is
// ONE forward pass over the rows (a per-cell slice+concat measured 22 s on
// this 25k-row file; the single pass takes milliseconds).
import { escHtml } from '../../../lib/escape';
import { decodeEntities } from './indyaSku';

export interface MasterRow { i: number; sku: string; vendorSku: string; size: string; stock: string; stockStart: number; stockEnd: number }
export interface MasterFile { rows: MasterRow[]; columns: string[] }

const WANT = ['SKU', 'VENDORSKU', 'SIZE', 'STOCK'] as const;
const normHead = (s: string) => decodeEntities(s).replace(/<[^>]*>/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();

// Every message thrown here is shown to the owner as-is ONLY while it is
// under 80 characters with no '<' or '{' (friendlyError's pass-through
// rule) — longer, or quoting a tag, and the toast says "Something went
// wrong" instead. Keep them short and say "row tags", not "<tr>".
const fmt = (n: number) => n.toLocaleString('en-IN');

/** null when the bytes look like Indya's HTML report; otherwise a short
 *  reason saying what the file actually is (real Excel, UTF-16, or — when
 *  no table is found anywhere — how the file starts, so a screenshot of the
 *  toast says which file was picked). */
export function looksLikeHtmlReport(bytes: Uint8Array): string | null {
  const not = (what: string) => `Not Indya’s report: ${what} — pick the .xls Indya sent`;
  if (bytes.length < 8) return not('the file is empty');
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) return not('this is a UTF-16 text file');
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) return not('this is a real Excel workbook');
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return not('this is a real Excel workbook');
  // UTF-16 without a byte-order mark: every other byte is NUL.
  const probe = bytes.subarray(0, 512);
  let nul = 0; for (const x of probe) if (x === 0) nul++;
  if (nul > probe.length / 4) return not('this is a UTF-16 text file');
  // Opened in Excel and saved: Excel rewrites the report as a "Web Page"
  // frameset stub (the data moves to a _files folder) — nothing to import,
  // and the bytes Indya needs back are gone.
  const head = latin1(bytes.subarray(0, 4096));
  if (/Excel Workbook Frameset|name=Generator content="Microsoft Excel/i.test(head)) return 'Excel re-saved this file and dropped the data — download it from Indya again';
  if (/<table\b/i.test(latin1(bytes))) return null;
  const peek = latin1(bytes.subarray(0, 80)).replace(/[^\x20-\x7e]+/g, ' ').replace(/[<>{}]/g, '').trim().slice(0, 20);
  return `Not Indya’s report (starts “${peek}”) — pick the .xls Indya sent`;
}

export const latin1 = (bytes: Uint8Array): string => new TextDecoder('latin1').decode(bytes);

/** Parse the report. Throws a plain-English Error when the shape is not
 *  the one we can safely write back (the caller toasts it). */
export function parseMasterHtml(text: string): MasterFile {
  // O(n) shape check first: a report with unclosed <tr>/<td> would send the
  // lazy row regex quadratic (measured ~10 s on a 1.6 MB file), and cannot
  // be written back safely anyway.
  const count = (re: RegExp) => (text.match(re) || []).length;
  const trOpen = count(/<tr\b/gi), trClose = count(/<\/tr\s*>/gi);
  if (trOpen !== trClose) throw new Error(`Row tags don’t balance (${fmt(trOpen)} open / ${fmt(trClose)} close) — can’t write it back`);
  const tdOpen = count(/<t[dh]\b/gi), tdClose = count(/<\/t[dh]\s*>/gi);
  if (tdOpen !== tdClose) throw new Error(`Cell tags don’t balance (${fmt(tdOpen)} open / ${fmt(tdClose)} close) — can’t write it back`);
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<t([dh])\b[^>]*>([\s\S]*?)<\/t\1>/gi;
  const rows: MasterRow[] = [];
  let columns: string[] | null = null;
  let idx: Record<(typeof WANT)[number], number> | null = null;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(text))) {
    const rowStart = m.index + m[0].indexOf('>') + 1;   // <tr\b[^>]*> ends at the first '>'
    const cells: { text: string; start: number; end: number }[] = [];
    cellRe.lastIndex = 0;
    let c: RegExpExecArray | null;
    while ((c = cellRe.exec(m[1]))) {
      const inner = c[2];
      const open = c[0].slice(0, c[0].indexOf('>') + 1);
      if ((open.match(/"/g) || []).length % 2 || (open.match(/'/g) || []).length % 2) throw new Error(`Row ${fmt(rows.length + 2)}: a cell tag has an unbalanced quote — can’t write it back`);
      const start = rowStart + c.index + open.length;   // the opening tag has no '>' inside (guarded above)
      cells.push({ text: inner, start, end: start + inner.length });
    }
    if (cells.length === 0) continue;
    if (!columns) {
      columns = cells.map(x => normHead(x.text));
      const found = Object.fromEntries(WANT.map(w => [w, columns!.indexOf(w)])) as Record<(typeof WANT)[number], number>;
      const missing = WANT.filter(w => found[w] < 0);
      if (missing.length) throw new Error(`Not Indya’s master — the header has no ${missing.join(', ')} column`);
      idx = found;
      continue;
    }
    if (cells.length !== columns.length) throw new Error(`Row ${fmt(rows.length + 2)} has ${cells.length} cells, the header has ${columns.length} — can’t write it back`);
    const st = cells[idx!.STOCK];
    if (st.text.includes('<')) throw new Error(`Row ${fmt(rows.length + 2)}: the Stock cell contains markup — can’t write it back`);
    rows.push({
      i: rows.length,
      sku: decodeEntities(cells[idx!.SKU].text).trim(),
      vendorSku: decodeEntities(cells[idx!.VENDORSKU].text).trim(),
      size: decodeEntities(cells[idx!.SIZE].text).trim(),
      stock: decodeEntities(st.text).trim(),
      stockStart: st.start, stockEnd: st.end,
    });
  }
  if (!columns) throw new Error('No table rows found in the file');
  if (rows.length === 0) throw new Error('The report has a header but no product rows');
  return { rows, columns };
}

/** The original bytes with only the Stock cells replaced. One forward pass. */
export function rewriteMasterBytes(bytes: Uint8Array, rows: MasterRow[], stocks: (string | number)[]): Uint8Array<ArrayBuffer> {
  if (stocks.length !== rows.length) throw new Error('stock count does not match row count');
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  let total = 0, prev = 0;
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k];
    if (r.stockStart < prev) throw new Error('rows are not in file order');
    const head = bytes.subarray(prev, r.stockStart);
    const val = enc.encode(escHtml(String(stocks[k])));
    parts.push(head, val); total += head.length + val.length;
    prev = r.stockEnd;
  }
  const tail = bytes.subarray(prev);
  parts.push(tail); total += tail.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
