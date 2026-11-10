// Order sheet → labels to print. The sheet lists SKUs per marketplace; each is
// matched to a master label, trying the SKU as written, then with the brand's
// prefix (SW for Svaraa, TN for Tanuka), then with a prefix stripped.
//
// The matching used to download every label (8,000+, ~3 MB, 9 requests) and
// search them in the browser. Now only the spellings this sheet could match
// are sent to brand_tags_by_skus() and only those labels come back (owner,
// 2026-11-10). The match rules themselves are unchanged.
import { supabase } from '../../lib/supabase';
import { MARKETPLACE_BRAND, toRow, type BrandTagRow, type BrandTagDb } from './tagModel';

export interface OrderRow { sku: string; marketplace: string; brand: string; copies: number; found: boolean; masterData?: BrandTagRow; }
type SheetRow = Record<string, unknown>;

const BRAND_PREFIX: Record<string, string> = { 'SVARAA': 'SW', 'TANUKA': 'TN' };
const KEYS_PER_CALL = 2000;

interface Entry { sku: string; marketplace: string; brand: string; copies: number }

/** Every "SKU" or "SKU*copies" on the sheet, one entry each (a cell may list several, comma-separated). */
const entriesOf = (data: SheetRow[]): Entry[] => {
  const out: Entry[] = [];
  for (const row of data) {
    const mp = String(row['Marketplace'] || row['marketplace'] || '').trim();
    const rawSku = String(row['SKU'] || row['sku'] || '').trim();
    if (!mp || !rawSku) continue;
    const brand = MARKETPLACE_BRAND[mp.toLowerCase()] || 'UNKNOWN';
    for (const entry of rawSku.split(',').map(s => s.trim()).filter(Boolean)) {
      const [skuPart, copiesStr] = entry.split('*');
      const sku = skuPart.trim();
      if (!sku) continue;
      out.push({ sku, marketplace: mp, brand, copies: Math.max(1, parseInt(copiesStr) || 1) });
    }
  }
  return out;
};

/** The spellings one SKU may be stored under, in the order they are tried. */
const candidates = (sku: string, brand: string): string[] => {
  const upper = sku.toUpperCase();
  const out = [upper];                                        // 1. as written
  const prefix = BRAND_PREFIX[brand];
  if (prefix) out.push(prefix + upper);                       // 2. with the brand's prefix
  for (const px of Object.values(BRAND_PREFIX)) {             // 3. with a prefix stripped
    if (upper.startsWith(px)) out.push(upper.slice(px.length));
  }
  return out;
};

const buildRows = (list: Entry[], master: BrandTagRow[]): OrderRow[] => {
  // Master rows arrive oldest first, so for a SKU held by two labels the
  // newest one wins.
  const masterMap = new Map<string, BrandTagRow>();
  master.forEach(r => masterMap.set(r.sku.toUpperCase(), r));
  const map = new Map<string, OrderRow>();
  for (const e of list) {
    const key = e.sku.toUpperCase() + '::' + e.brand;
    const seen = map.get(key);
    if (seen) { seen.copies += e.copies; continue; }
    let found: BrandTagRow | undefined;
    for (const c of candidates(e.sku, e.brand)) { found = masterMap.get(c); if (found) break; }
    map.set(key, { sku: found?.sku || e.sku, marketplace: e.marketplace, brand: e.brand, copies: e.copies, found: !!found, masterData: found });
  }
  return Array.from(map.values());
};

/** Match an order sheet against the master labels. Throws when the lookup
 *  fails — a failed lookup must never be shown as "SKU missing". */
export async function matchOrderSheet(data: SheetRow[]): Promise<OrderRow[]> {
  const list = entriesOf(data);
  const keys = [...new Set(list.flatMap(e => candidates(e.sku, e.brand)).filter(Boolean))];
  const master: BrandTagRow[] = [];
  for (let i = 0; i < keys.length; i += KEYS_PER_CALL) {
    const { data: found, error } = await supabase.rpc('brand_tags_by_skus', { p_skus: keys.slice(i, i + KEYS_PER_CALL) });
    if (error) throw error;
    master.push(...((found || []) as BrandTagDb[]).map(toRow));
  }
  return buildRows(list, master);
}
