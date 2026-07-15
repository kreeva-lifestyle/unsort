// Extract dropdown datasets (data validations of type "list") for one sheet
// of an xlsx. The raw sheet XML comes from xlsxZip; list formulas are then
// resolved against the SheetJS workbook already parsed in memory — covering
// inline lists ("A,B,C"), ranges on (often hidden) dataset sheets, defined
// names, and the newer x14 validations Excel writes into <extLst>.
import * as XLSX from 'xlsx';
import { readZipEntries } from './xlsxZip';

export const ALLOWED_CAP = 500;
const RELS_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const colToIdx = (col: string): number => {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

// "D3:D5000 F2" -> unique zero-based column indexes [3, 5]
function sqrefCols(sqref: string): number[] {
  const cols = new Set<number>();
  for (const part of sqref.trim().split(/\s+/)) {
    const m = part.match(/^\$?([A-Z]+)\$?\d*(?::\$?([A-Z]+)\$?\d*)?$/i);
    if (!m) continue;
    const a = colToIdx(m[1].toUpperCase());
    const b = m[2] ? colToIdx(m[2].toUpperCase()) : a;
    for (let c = Math.min(a, b); c <= Math.max(a, b); c++) cols.add(c);
  }
  return [...cols];
}

// Read a "Sheet!A2:A300"-style range from the parsed workbook as strings.
function rangeValues(wb: XLSX.WorkBook, ref: string): string[] {
  const m = ref.replace(/\$/g, '').match(/^(?:'([^']+)'|([^'!]+))!([A-Z]+\d*(?::[A-Z]+\d*)?)$/i);
  if (!m) return [];
  const ws = wb.Sheets[m[1] || m[2]];
  if (!ws) return [];
  const out: string[] = [];
  try {
    const r = XLSX.utils.decode_range(m[3].includes(':') ? m[3] : `${m[3]}:${m[3]}`);
    for (let R = r.s.r; R <= Math.min(r.e.r, r.s.r + 10000) && out.length <= ALLOWED_CAP; R++) {
      for (let C = r.s.c; C <= r.e.c; C++) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        const v = cell == null ? '' : String(cell.v ?? '').trim();
        if (v) out.push(v);
      }
    }
  } catch { return []; }
  return out;
}

function resolveFormula(wb: XLSX.WorkBook, formula: string, ownSheet: string): string[] {
  let f = formula.trim().replace(/^=/, '').trim();
  if (!f) return [];
  if (f.startsWith('"')) return f.replace(/^"|"$/g, '').split(',').map(s => s.trim()).filter(Boolean);
  const dn = (wb.Workbook?.Names || []).find(n => (n.Name || '').toLowerCase() === f.toLowerCase());
  if (dn?.Ref) f = dn.Ref;
  if (!f.includes('!')) f = `'${ownSheet}'!${f}`; // same-sheet range like $A$2:$A$9
  return rangeValues(wb, f);
}

// Resolve which xl/worksheets/sheetN.xml part backs a workbook sheet name.
function sheetPartName(workbookXml: string, relsXml: string, sheetName: string): string | null {
  const wbDoc = new DOMParser().parseFromString(workbookXml, 'application/xml');
  let rid = '';
  for (const el of Array.from(wbDoc.getElementsByTagName('*'))) {
    if (el.localName === 'sheet' && el.getAttribute('name') === sheetName) {
      rid = el.getAttributeNS(RELS_NS, 'id') || el.getAttribute('r:id') || '';
      break;
    }
  }
  if (!rid) return null;
  const relsDoc = new DOMParser().parseFromString(relsXml, 'application/xml');
  for (const el of Array.from(relsDoc.getElementsByTagName('*'))) {
    if (el.localName === 'Relationship' && el.getAttribute('Id') === rid) {
      const target = (el.getAttribute('Target') || '').replace(/^\//, '').replace(/^xl\//, '');
      return target ? `xl/${target}` : null;
    }
  }
  return null;
}

// -> Map<zero-based column index, allowed values> for the given sheet.
export async function extractDropdowns(buf: ArrayBuffer, wb: XLSX.WorkBook, sheetName: string): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  try {
    const zip = await readZipEntries(buf);
    const wbXml = await zip.get('xl/workbook.xml')?.();
    const relsXml = await zip.get('xl/_rels/workbook.xml.rels')?.();
    if (!wbXml || !relsXml) return out;
    const part = sheetPartName(wbXml, relsXml, sheetName);
    const sheetXml = part ? await zip.get(part)?.() : null;
    if (!sheetXml) return out;
    const doc = new DOMParser().parseFromString(sheetXml, 'application/xml');
    for (const el of Array.from(doc.getElementsByTagName('*'))) {
      // Matches classic <dataValidation> AND <x14:dataValidation> (same localName).
      if (el.localName !== 'dataValidation' || el.getAttribute('type') !== 'list') continue;
      let formula = '';
      let sqref = el.getAttribute('sqref') || '';
      for (const ch of Array.from(el.getElementsByTagName('*'))) {
        if (ch.localName === 'formula1' && !formula) formula = ch.textContent || '';
        if (ch.localName === 'sqref' && !sqref) sqref = ch.textContent || ''; // x14: <xm:sqref>
      }
      if (!sqref || !formula) continue;
      const vals = [...new Set(resolveFormula(wb, formula, sheetName))].slice(0, ALLOWED_CAP);
      if (!vals.length) continue;
      for (const c of sqrefCols(sqref)) if (!out.has(c)) out.set(c, vals);
    }
  } catch { /* best-effort: a sheet without readable validations still works */ }
  return out;
}
