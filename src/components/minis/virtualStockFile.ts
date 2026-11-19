// Virtual Stock Override from a file (owner, 2026-11-19: "how can i import
// virtual stock in bulk"): CSV or Excel with a SKU and a quantity column — the
// same two columns Export writes ("SKU,Quantity"). The header row is found by
// name with the vendor-sheet helpers (indya/indyaFiles.ts); with none, columns
// A and B are used from the first line (a first line of words is taken as a
// header). SKUs are trimmed and upper-cased like the Add box does. Each SKU is
// then set to its quantity; 0 removes it (VirtualStockBulk applies the list).
import { QTY_ALIASES, SKU_ALIASES, cellText, findHeader, grid } from './indya/indyaFiles';
import { normKey } from './indya/indyaSku';

export interface StockLine { sku: string; qty: number }

/** The file's SKUs with whole quantities of 0 or more. Anything else is listed
 *  in `bad` and skipped; a SKU given twice keeps its last line (`repeated`). */
export async function readStockFile(file: File): Promise<{ list: StockLine[]; bad: string[]; repeated: number; noHeader: boolean }> {
  const rows = await grid(file);
  const h = findHeader(rows, SKU_ALIASES, QTY_ALIASES);
  const key = h ? h.key : 0, val = h ? h.val : 1;
  const map = new Map<string, number>();
  const bad: string[] = [];
  let repeated = 0;
  for (let i = h ? h.at + 1 : 0; i < rows.length; i++) {
    const r = rows[i] || [];
    const sku = normKey(cellText(r[key]));
    const q = cellText(r[val]);
    if (!sku) continue;
    if (!/^\d+$/.test(q)) {
      if (!h && i === 0) continue; // no header found: a first line of words is one
      bad.push(`${sku} ${q || '(blank)'}`);
      continue;
    }
    if (map.has(sku)) repeated++;
    map.set(sku, parseInt(q, 10));
  }
  if (!map.size && !bad.length) throw new Error(`${file.name.length > 28 ? `${file.name.slice(0, 25)}…` : file.name}: no SKU rows found`);
  return { list: [...map].map(([sku, qty]) => ({ sku, qty })), bad, repeated, noHeader: !h };
}
