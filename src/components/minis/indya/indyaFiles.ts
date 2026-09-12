// Vendor stock sheets and the Blocked Inventory sheet for Indya Import —
// the same files Odette Import takes. Read with SheetJS (lazy-loaded so the
// mini stays out of the main bundle). The header row is FOUND, not assumed:
// the first of the top 20 rows holding an SKU-like and a qty-like header
// (a title row above the header no longer yields garbage keys).
import { normKey } from './indyaSku';

export interface VendorRow { sku: string; qty: string; cat?: string }
export interface VendorFile { name: string; rows: VendorRow[]; note?: string }
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

const SKU_ALIASES = ['sku', 'skucode', 'designno', 'design', 'itemcode', 'productcode', 'stylecode', 'styleno', 'code', 'article', 'style', 'item'];
const QTY_ALIASES = ['qty', 'quantity', 'availableqty', 'availablestock', 'qtyavailable', 'closingstock', 'stock', 'available', 'pieces', 'pcs', 'balance'];
// A header carrying one of these is descriptive, never a key or a number.
const NEVER = ['name', 'desc', 'status', 'date', 'price', 'rate', 'colour', 'color', 'size', 'remark', 'image', 'url'];
const BLOCKED_ALIASES = ['blockedcommitted', 'blocked', 'committed', 'reserved'];

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/[^a-z]/g, '');
const cellText = (v: unknown) => v == null ? '' : typeof v === 'number' ? String(v) : String(v).trim();

/** A file name short enough to sit inside a toast message. */
const shortName = (name: string) => name.length > 28 ? `${name.slice(0, 25)}…` : name;

/** The file's bytes, or a short plain-English reason. Every message thrown
 *  in this mini must stay under 80 characters with no '<' or '{' — that is
 *  friendlyError's pass-through rule; anything longer is shown as
 *  "Something went wrong", which is exactly what the owner cannot act on. */
export async function readBytes(file: File): Promise<Uint8Array> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${shortName(file.name)} is over 15 MB`);
  try { return new Uint8Array(await file.arrayBuffer()); }
  catch { throw new Error(`Could not read ${shortName(file.name)} — pick it again from Files`); }
}

async function grid(file: File): Promise<unknown[][]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await readBytes(file), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error(`${file.name} has no sheets`);
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
}

/** Best column for a set of aliases: an exact header beats a header that
 *  merely contains the alias ("SKU" beats "Item Name"), and descriptive
 *  headers ("Stock Status", "Product Name") never qualify. */
function bestCol(heads: string[], aliases: string[], skip = -1): number {
  let best = -1, score = 0;
  heads.forEach((h, j) => {
    if (j === skip || !h || NEVER.some(n => h.includes(n))) return;
    const sc = aliases.some(a => h === a) ? 3 : aliases.some(a => h.startsWith(a)) ? 2 : aliases.some(a => h.includes(a)) ? 1 : 0;
    if (sc > score) { score = sc; best = j; }
  });
  return best;
}

/** Header row index + the column indexes, or null when no header matched. */
function findHeader(rows: unknown[][], keyAliases: string[], valAliases: string[]): { at: number; key: number; val: number } | null {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const heads = (rows[i] || []).map(norm);
    const key = bestCol(heads, keyAliases);
    if (key < 0) continue;
    const val = bestCol(heads, valAliases, key);
    if (val >= 0) return { at: i, key, val };
  }
  return null;
}

/** One vendor sheet → [{ sku, qty }] with qty kept as text (Odette parity:
 *  'NA', blank and 'Out of stock' mean different things downstream). */
export async function readVendorFile(file: File): Promise<VendorFile> {
  const rows = await grid(file);
  const h = findHeader(rows, SKU_ALIASES, QTY_ALIASES);
  const at = h ? h.at : 0, key = h ? h.key : 0, val = h ? h.val : 1;
  // Optional category column (the vendor sheets carry one): LEHENGA CHOLI
  // rows get special treatment in compute.
  const cat = h ? (rows[h.at] || []).map(norm).findIndex(x => x === 'category' || x.includes('category')) : -1;
  const out: VendorRow[] = [];
  for (let i = at + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const sku = normKey(cellText(r[key]));
    if (!sku) continue;
    out.push(cat >= 0 ? { sku, qty: cellText(r[val]), cat: cellText(r[cat]) } : { sku, qty: cellText(r[val]) });
  }
  if (out.length === 0) throw new Error(`${file.name}: no SKU rows found`);
  return { name: file.name, rows: out, note: h ? undefined : 'no SKU/qty header found — used columns A and B' };
}

/** Blocked Inventory: 'Sku Code' + 'Blocked (Committed)'; values > 0 add up. */
export async function readBlockedFile(file: File): Promise<{ name: string; map: Record<string, number>; count: number }> {
  const rows = await grid(file);
  const h = findHeader(rows, SKU_ALIASES, BLOCKED_ALIASES);
  const at = h ? h.at : 0, key = h ? h.key : 0, val = h ? h.val : 1;
  const map: Record<string, number> = {};
  let count = 0;
  for (let i = at + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const sku = normKey(cellText(r[key]));
    const v = Number(cellText(r[val]));
    if (!sku || !(v > 0)) continue;
    map[sku] = (map[sku] || 0) + v; count++;
  }
  if (count === 0) throw new Error(`${file.name}: no blocked quantities found`);
  return { name: file.name, map, count };
}

/** Code fixes applied before any lookup — filled by the saved SKU map (indyaMap.ts). */
export interface Corrections { name: string; bySku: Map<string, string>; byVendor: Map<string, string>; byShape?: Map<string, string>; count: number }
