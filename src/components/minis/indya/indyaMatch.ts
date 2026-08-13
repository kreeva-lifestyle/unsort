// Indya Import — the matching rules, kept separate from the UI so they can be
// exercised directly against a real Product Master Report.
//
// Indya's report has four columns: SKU (their code), VendorSKU (ours), Size,
// Stock. Two facts drive everything here, both measured from a real 23,604-row
// export rather than assumed:
//
//   1. VendorSKU often carries a size suffix that is WRONG for the row —
//      TF-343-XL appears on the S, M, L, XL, XS and Unstitched rows alike. So
//      the suffix is stripped and the SIZE COLUMN is the truth (owner's rule).
//   2. The suffix is only sometimes a size. KB-272-GREEN-S ends in a colour
//      then a size, KA-1036-BLACK ends in a colour, TF-304 ends in a number.
//      Stripping "the last segment" would destroy those, so only a segment
//      that IS a size token is removed, and only one.

/** Size vocabulary seen in the real export plus the usual spellings. */
const SIZE_WORDS = new Set([
  'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL',
  'FREE', 'FREESIZE', 'ONESIZE', 'UNSTITCHED', 'STITCHED', 'SEMISTITCHED',
]);

/** Canonical size: case/separator-insensitive, and XXL ≡ 2XL, XXXL ≡ 3XL so a
 *  vendor sheet spelling either way still lines up with Indya's. */
export function normSize(v: unknown): string {
  const t = String(v ?? '').trim().toUpperCase().replace(/[\s._-]/g, '');
  if (!t) return '';
  if (t === 'XL') return 'XL';                    // not 1XL
  const x = t.match(/^(X+)L$/);                   // XXL → 2XL, XXXL → 3XL
  if (x) return `${x[1].length}XL`;
  return t;
}

const isSizeToken = (v: string): boolean => {
  const n = normSize(v);
  return !!n && (SIZE_WORDS.has(n) || /^(?:[2-9]|1[0-9])XL$/.test(n));
};

/** Drop ONE trailing size segment: TF-343-XL → TF-343, KB-272-GREEN-S →
 *  KB-272-GREEN, while TF-304 and KA-1036-BLACK are left alone. */
export function stripSize(vendorSku: unknown): string {
  const raw = String(vendorSku ?? '').trim();
  if (!raw) return '';
  const parts = raw.split('-');
  if (parts.length > 1 && isSizeToken(parts[parts.length - 1])) parts.pop();
  return parts.join('-');
}

/** Comparison key for one design+size, used on both sides of the match. */
export const designKey = (vendorSku: unknown): string =>
  stripSize(vendorSku).toUpperCase().replace(/[\s._-]/g, '');
export const rowKey = (vendorSku: unknown, size: unknown): string =>
  `${designKey(vendorSku)}|${normSize(size)}`;

/** One row of Indya's report. `sku`, `vendorSku` and `size` are held VERBATIM
 *  as they arrived — Indya's own codes contain mistakes, and the owner needs
 *  the exported file to carry those exact codes back so a row can still be
 *  found on their side. Size-stripping happens only inside the comparison
 *  helpers above; nothing here is ever rewritten. */
export interface IndyaRow { sku: string; vendorSku: string; size: string; stock: number | string }
export interface StockRow { key: string; base: string; qty: number; hasSize: boolean }

/** Find a column by header, tolerant of spacing/case/punctuation. */
export const pickCol = (headers: string[], res: RegExp[]): string | null => {
  const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const re of res) {
    const hit = headers.find(h => re.test(norm(h)));
    if (hit) return hit;
  }
  return null;
};

export const SKU_COL = [/^(vendorsku|vendorcode|skucode|sku|code|designcode|design|stylecode|style|item|itemcode|article)$/, /sku/, /code/];
export const QTY_COL = [/^(qty|quantity|stock|availablestock|available|closingstock|balance|pieces|pcs)$/, /qty|quantity|stock|available/];
export const SIZE_COL = [/^(size|sizename|standardsize)$/, /size/];

/** Quantity as a number. Marketplace sheets say "Out of Stock", "NA" or leave
 *  the cell empty; all of those mean nothing available, not "unknown". */
export function toQty(v: unknown): number {
  const s = String(v ?? '').trim();
  if (!s) return 0;
  if (/^(na|n\/a|out of stock|out_of_stock|oos|nil|-)$/i.test(s)) return 0;
  const n = Number(s.replace(/[, ]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Sizes we do not stock-manage. Owner's rule: an Unstitched row is ignored —
 *  it is not matched, and by default it is left OUT of the export so Indya
 *  keeps whatever it already has. Writing 0 for it would be an ACTION (every
 *  Unstitched listing goes out of stock); omitting the row is inaction, which
 *  is the safe reading of "ignore". The UI can opt into sending 0 instead. */
export const IGNORED_SIZES = new Set(['UNSTITCHED']);
export const isIgnoredSize = (size: unknown): boolean => IGNORED_SIZES.has(normSize(size));

export type MatchKind = 'size' | 'design' | 'none' | 'ignored';
/** The original row plus the computed stock. Spreading IndyaRow (rather than
 *  rebuilding it) is what guarantees the export keeps Indya's exact codes:
 *  only `newStock` is ours. */
export interface Filled extends IndyaRow { newStock: number; match: MatchKind; sources: number }

/**
 * Fill each Indya row's stock from the imported stock sheets.
 * `spreadDesign` is OFF by default on purpose: a stock sheet with no size
 * breakdown cannot say how many of each size exist, and copying a design's
 * total onto every size row would tell Indya there is far more stock than
 * really exists. Turning it on is a deliberate choice, not a default.
 */
export function fillRows(rows: IndyaRow[], stock: StockRow[], spreadDesign: boolean): Filled[] {
  const bySize = new Map<string, number>();
  const byDesign = new Map<string, number>();
  const sizeHits = new Map<string, number>();
  const designHits = new Map<string, number>();
  for (const s of stock) {
    if (s.hasSize) {
      bySize.set(s.key, (bySize.get(s.key) || 0) + s.qty);
      sizeHits.set(s.key, (sizeHits.get(s.key) || 0) + 1);
    } else {
      byDesign.set(s.base, (byDesign.get(s.base) || 0) + s.qty);
      designHits.set(s.base, (designHits.get(s.base) || 0) + 1);
    }
  }
  return rows.map(r => {
    if (isIgnoredSize(r.size)) return { ...r, newStock: 0, match: 'ignored', sources: 0 };
    const k = rowKey(r.vendorSku, r.size);
    const base = designKey(r.vendorSku);
    if (bySize.has(k)) return { ...r, newStock: bySize.get(k) as number, match: 'size', sources: sizeHits.get(k) || 1 };
    if (spreadDesign && byDesign.has(base)) return { ...r, newStock: byDesign.get(base) as number, match: 'design', sources: designHits.get(base) || 1 };
    return { ...r, newStock: 0, match: 'none', sources: 0 };
  });
}
