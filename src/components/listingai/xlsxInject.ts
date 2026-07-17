// Pure, DOM-free helpers to write cell values into an xlsx worksheet's XML
// while leaving every other byte untouched. exportFilled.ts uses these so a
// filled marketplace template keeps ALL of Myntra's formatting — styles,
// column widths, drawings, cell comments and (critically) the thousands of
// dropdown data-validations that SheetJS CE silently drops on write.

export interface CellWrite { r: number; c: number; v: string } // r: 1-based row, c: 0-based col

export function colLetter(idx: number): string {
  let n = idx + 1, s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function letterToIdx(s: string): number {
  let n = 0;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const XML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export function escapeXml(v: string): string {
  // Drop XML-illegal control chars first, then escape markup.
  return v.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').replace(/[&<>"]/g, c => XML_ESC[c]);
}

// Resolve xl/worksheets/sheetN.xml for a workbook sheet name (regex, DOM-free
// so it runs identically in the browser and a Node test harness).
export function resolveSheetPart(workbookXml: string, relsXml: string, sheetName: string): string | null {
  const esc = sheetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sheetTag = new RegExp('<sheet\\b[^>]*\\bname="' + esc + '"[^>]*>', 'i').exec(workbookXml);
  if (!sheetTag) return null;
  const rid = (/r:id="([^"]+)"/i.exec(sheetTag[0]) || /\bid="([^"]+)"/i.exec(sheetTag[0]) || [])[1];
  if (!rid) return null;
  const rel = new RegExp('<Relationship\\b[^>]*\\bId="' + rid + '"[^>]*>', 'i').exec(relsXml);
  const target = rel && (/Target="([^"]+)"/i.exec(rel[0]) || [])[1];
  if (!target) return null;
  return 'xl/' + target.replace(/^\//, '').replace(/^xl\//, '');
}

// Replace a single cell inside a row's inner XML, preserving its style (s="…")
// so the template's per-cell formatting survives. Inserts in column order if
// the cell doesn't already exist.
function setCell(inner: string, ref: string, col: number, value: string): string {
  const re = new RegExp('<c r="' + ref + '"([^>]*?)(?:/>|>[\\s\\S]*?</c>)');
  const m = re.exec(inner);
  const sMatch = m && /\ss="(\d+)"/.exec(m[1]);
  const sAttr = sMatch ? ' s="' + sMatch[1] + '"' : '';
  const cell = '<c r="' + ref + '"' + sAttr + ' t="inlineStr"><is><t xml:space="preserve">' + escapeXml(value) + '</t></is></c>';
  if (m) return inner.slice(0, m.index) + cell + inner.slice(m.index + m[0].length);
  const cells = /<c r="([A-Z]+)\d+"/g;
  let mm: RegExpExecArray | null;
  while ((mm = cells.exec(inner))) if (letterToIdx(mm[1]) > col) return inner.slice(0, mm.index) + cell + inner.slice(mm.index);
  return inner + cell;
}

// Insert a synthesized <row> into <sheetData> in ascending row order.
function insertRow(xml: string, R: number, rowXml: string): string {
  const rows = /<row r="(\d+)"/g;
  let mm: RegExpExecArray | null;
  while ((mm = rows.exec(xml))) if (parseInt(mm[1], 10) > R) return xml.slice(0, mm.index) + rowXml + xml.slice(mm.index);
  const close = xml.indexOf('</sheetData>');
  return close >= 0 ? xml.slice(0, close) + rowXml + xml.slice(close) : xml;
}

function writeRow(xml: string, R: number, cells: CellWrite[]): string {
  // Self-closing form FIRST: a pre-formatted empty row (<row r="7" ht="15"/>)
  // must not be eaten by the content branch, whose [^>]*> would swallow the
  // trailing "/" and run the lazy inner across to the NEXT row's </row>,
  // nesting rows and corrupting the sheet. Group 1 = self-close attrs;
  // groups 2/3 = normal-row attrs / inner.
  const re = new RegExp('<row r="' + R + '"([^>]*)/>|<row r="' + R + '"([^>]*)>([\\s\\S]*?)</row>');
  const m = re.exec(xml);
  let inner = m ? (m[3] ?? '') : '';
  for (const c of cells) inner = setCell(inner, colLetter(c.c) + R, c.c, c.v);
  const rowXml = '<row r="' + R + '"' + (m ? (m[2] ?? m[1] ?? '') : '') + '>' + inner + '</row>';
  return m ? xml.slice(0, m.index) + rowXml + xml.slice(m.index + m[0].length) : insertRow(xml, R, rowXml);
}

// Grow <dimension ref> only if the writes extend past the sheet's declared box.
function growDimension(xml: string, maxRow: number, maxCol: number): string {
  const m = /<dimension ref="([A-Za-z]+\d+):([A-Za-z]+)(\d+)"\s*\/?>/.exec(xml);
  if (!m) return xml;
  const col = Math.max(letterToIdx(m[2]), maxCol);
  const row = Math.max(parseInt(m[3], 10), maxRow);
  if (col === letterToIdx(m[2]) && row === parseInt(m[3], 10)) return xml;
  return xml.replace(m[0], '<dimension ref="' + m[1] + ':' + colLetter(col) + row + '"/>');
}

export function injectCells(sheetXml: string, writes: CellWrite[]): string {
  const byRow = new Map<number, CellWrite[]>();
  let maxRow = 0, maxCol = 0;
  for (const w of writes) {
    if (!w.v) continue;
    (byRow.get(w.r) ?? byRow.set(w.r, []).get(w.r)!).push(w);
    maxRow = Math.max(maxRow, w.r); maxCol = Math.max(maxCol, w.c);
  }
  if (!byRow.size) return sheetXml;
  let xml = sheetXml;
  for (const R of [...byRow.keys()].sort((a, b) => a - b)) {
    xml = writeRow(xml, R, byRow.get(R)!.sort((a, b) => a.c - b.c));
  }
  return growDimension(xml, maxRow, maxCol);
}
