// Pure: the "ready" gate with required attributes — "for each attribute of
// its category a tag is a must" (owner, 2026-11-10) — and the necessary
// details: "if a few necessary details are not there … do not auto generate
// until everything is ok" (owner, 2026-11-12). A product is Ready for websites
// only with a category that is on the owner's list, a cost price (or a copied
// selling price), a fabric, a colour, at least one photo AND at least one value
// for every attribute linked to its category; otherwise it is Needs info with
// the plain reason "Missing: Colour, Work" ("Missing: Category" for a category
// the list no longer has). The SQL twin is pb_products_refresh
// (20261113150000_pb_gate_category_list.sql) — the database applies it
// after every tag change; this copy lets the retag dry run project the counts
// and the reader word its result. A Needs-info product that was never read
// (photos still uploading from the app) is never moved to Ready here.
// No I/O — tested in test/tagGate.test.mjs.

export interface GateProduct {
  status: string; cost_price: number | null; sell_price?: number | null; category: string | null;
  ai_read_at?: string | null; ai_error?: string | null;
  fabric?: string | null; color?: string | null;
  /** At least one photo (pb_product_images kind 'image'). */
  has_photo?: boolean;
}
export interface LinkedAttr { id: string; name: string }

const catKey = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** A category the owner's list (Settings → Tags) no longer has: the gate holds the product as missing its category
 *  ("Missing: Category") until one from the list is chosen. With no list saved, nothing is held for this. SQL twin:
 *  pb_products_refresh in 20261113150000_pb_gate_category_list.sql (owner, 13 Nov 2026: a product stayed Ready
 *  under "Indo-Western" after that category was removed). */
export const categoryGone = (category: string | null | undefined, list: string[]): boolean =>
  !!catKey(category) && list.length > 0 && !list.some(c => catKey(c) === catKey(category));

/** The category's attributes with no value on the product, in the category's order. */
export const missingAttrs = (linked: LinkedAttr[], filledAttrIds: Iterable<string>): string[] => {
  const have = new Set(filledAttrIds);
  return linked.filter(a => !have.has(a.id)).map(a => a.name);
};

export const priced = (p: Pick<GateProduct, 'cost_price' | 'sell_price'>) =>
  (p.cost_price !== null && p.cost_price !== undefined) || (p.sell_price !== null && p.sell_price !== undefined);

/** The necessary details a product lacks, as the app names them: Fabric, Colour, Photo. */
export const missingDetails = (p: Pick<GateProduct, 'fabric' | 'color' | 'has_photo'>): string[] => [
  ...(String(p.fabric ?? '').trim() ? [] : ['Fabric']), ...(String(p.color ?? '').trim() ? [] : ['Colour']), ...(p.has_photo ? [] : ['Photo']),
];

/** Everything websites need: price, category, fabric, colour, a photo and every required attribute. */
export const complete = (p: GateProduct, missing: string[]) =>
  priced(p) && !!String(p.category ?? '').trim() && missing.length === 0 && missingDetails(p).length === 0;

/** The status after a tag change: only Ready ↔ Needs info move; new / reading / archived stay. */
export function gateStatus(p: GateProduct, missing: string[]): string {
  if (p.status !== 'ready' && p.status !== 'needs_info') return p.status;
  if (!complete(p, missing)) return 'needs_info';
  if (p.status === 'needs_info' && !p.ai_read_at && !p.ai_error) return 'needs_info'; // held while its photos upload
  return 'ready';
}

/** "Missing: Colour, Work" — '' when nothing is missing. */
export const missingNote = (missing: string[]) => (missing.length ? `Missing: ${missing.join(', ')}` : '');

/** How a set of before → after statuses moves the counts (retag dry run). */
export function gateMoves(rows: { before: string; after: string }[]) {
  let to_needs_info = 0, to_ready = 0;
  for (const r of rows) {
    if (r.before === r.after) continue;
    if (r.after === 'needs_info') to_needs_info++;
    else if (r.after === 'ready') to_ready++;
  }
  return { to_needs_info, to_ready };
}
