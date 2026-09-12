// Indya's newer export of the product master is a CSV — the same four
// columns as the HTML report (SKU, VendorSKU, Size, Stock), a trailing comma
// on every line, CRLF. Same contract as the HTML report: the file goes back
// byte-for-byte with only the Stock field changed, so this parser records
// each Stock field's byte range and rewriteMasterBytes (indyaMaster.ts)
// splices the new value in. The text is latin1-decoded, so a char offset IS
// a byte offset. RFC 4180 quoting is honoured — a quoted field may hold
// commas, doubled quotes and line breaks — and the recorded range covers the
// raw field, quotes included, so the replacement is always a whole field.
//
// Messages thrown here are shown as-is only under 80 characters with no
// '<' or '{' (friendlyError's pass-through rule) — keep them short.
import type { MasterRow, MasterFile } from './indyaMaster';

const WANT = ['SKU', 'VENDORSKU', 'SIZE', 'STOCK'] as const;
const normHead = (s: string) => s.replace(/[^A-Za-z]/g, '').toUpperCase();
const fmt = (n: number) => n.toLocaleString('en-IN');

interface Field { text: string; start: number; end: number }

/** Records of fields with byte ranges. A record ends at CRLF, LF or CR; a
 *  line that is only a line break yields one empty field. */
function records(text: string): Field[][] {
  const out: Field[][] = [];
  let rec: Field[] = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const start = i;
    let val = '';
    if (text[i] === '"') {
      i++;
      for (;;) {
        if (i >= n) throw new Error(`Line ${fmt(out.length + 1)}: a quoted field never closes — can’t write it back`);
        const ch = text[i];
        if (ch === '"') { if (text[i + 1] === '"') { val += '"'; i += 2; continue; } i++; break; }
        val += ch; i++;
      }
    }
    const from = i;
    while (i < n && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') i++;
    val += text.slice(from, i);
    rec.push({ text: val, start, end: i });
    if (i < n && text[i] === ',') {
      i++;
      if (i === n) rec.push({ text: '', start: i, end: i });   // "…,6," at the very end of the file
      continue;
    }
    if (i < n && text[i] === '\r') i++;
    if (i < n && text[i] === '\n') i++;
    out.push(rec); rec = [];
  }
  if (rec.length) out.push(rec);
  return out;
}

/** True when the first line names all four columns — the sniff for a CSV master. */
export function looksLikeCsvMaster(head: string): boolean {
  const cols = head.split(/\r?\n|\r/, 1)[0].split(',').map(normHead);
  return WANT.every(w => cols.includes(w));
}

/** Parse the CSV master. Throws a short plain-English Error when the shape
 *  is not one we can safely write back (the caller toasts it). */
export function parseMasterCsv(text: string): MasterFile {
  const recs = records(text).filter(r => r.length > 1 || r[0].text.trim() !== '');
  if (recs.length === 0) throw new Error('No rows found in the file');
  const columns = recs[0].map(f => normHead(f.text));
  const found = Object.fromEntries(WANT.map(w => [w, columns.indexOf(w)])) as Record<(typeof WANT)[number], number>;
  const missing = WANT.filter(w => found[w] < 0);
  if (missing.length) throw new Error(`Not Indya’s master — the header has no ${missing.join(', ')} column`);
  const rows: MasterRow[] = [];
  for (let k = 1; k < recs.length; k++) {
    const r = recs[k];
    if (r.length !== columns.length) throw new Error(`Line ${fmt(k + 1)} has ${r.length} fields, the header has ${columns.length} — can’t write it back`);
    const st = r[found.STOCK];
    rows.push({
      i: rows.length,
      sku: r[found.SKU].text.trim(),
      vendorSku: r[found.VENDORSKU].text.trim(),
      size: r[found.SIZE].text.trim(),
      stock: st.text.trim(),
      stockStart: st.start, stockEnd: st.end,
    });
  }
  if (rows.length === 0) throw new Error('The file has a header but no product rows');
  return { rows, columns };
}
