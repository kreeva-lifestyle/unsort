// "With alterations" stock (owner's rule): a garment can be taken in ONE
// size — L becomes M, M becomes S — never let out, never two steps. So the
// stock a marketplace may sell in size X is X's own pieces plus the pieces
// one size larger (L stock of 5 also shows as 5 in M). The largest size has
// nothing above it; sizes that are not sizes (Unstitched, Free size, an
// unmapped number) are left as they are. Pure — the three import tools
// (Utsav, Cbazaar, Indya) hand in their rows and take back the numbers.

// Smallest → largest. 2XL/XXL and XXXL/3XL are the same size (Indya spells
// n-XL, suppliers spell X…L); both normalise to the n-XL form here.
const ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL', '9XL', '10XL'];

/** Canonical size label, or null when the text is not a size. Accepts
 *  "l", "XL (Extra large)", "2XL", "XXXL", "Size: M". */
export function normSize(raw: unknown): string | null {
  const s = String(raw ?? '').trim().toUpperCase().replace(/^SIZE[:\s-]*/, '').split(/[\s(]/)[0].replace(/[^0-9A-Z]/g, '');
  if (!s) return null;
  if (s === 'XXL' || s === '2XL') return 'XXL';
  const nxl = /^(\d{1,2})XL$/.exec(s);
  if (nxl) return ORDER.includes(`${nxl[1]}XL`) ? `${nxl[1]}XL` : null;
  const xl = /^(X{3,})L$/.exec(s);
  if (xl) return ORDER.includes(`${xl[1].length}XL`) ? `${xl[1].length}XL` : null;
  return ORDER.includes(s) ? s : null;
}

/** The next size up (M → L), or null at the top or for a non-size. */
export function sizeUp(size: unknown): string | null {
  const s = normSize(size);
  if (!s) return null;
  const i = ORDER.indexOf(s);
  return i >= 0 && i < ORDER.length - 1 ? ORDER[i + 1] : null;
}

/** Per row: its own quantity plus the quantity of the same product one size
 *  up. `ident` names the product and the size of a row (null = no size, so
 *  the row keeps its own number); `combine` says what to do when a product
 *  has several rows in one size — 'sum' for a listing per row (Utsav's
 *  rel-ids, Cbazaar's rows), 'max' when the rows are mirrors of one listing
 *  showing the same stock (Indya's sibling SKUs). */
export function withAlterations<T>(rows: T[], ident: (r: T) => { product: string; size: unknown } | null, qty: (r: T) => number, combine: 'sum' | 'max' = 'sum'): number[] {
  const bySize = new Map<string, number>();
  const keyOf = (product: string, size: string) => `${product}\u0000${size}`;
  const ids = rows.map(r => { const id = ident(r); const size = id ? normSize(id.size) : null; return id && size ? { product: id.product, size } : null; });
  rows.forEach((r, i) => {
    const id = ids[i]; if (!id) return;
    const k = keyOf(id.product, id.size), q = Math.max(0, qty(r) || 0);
    bySize.set(k, combine === 'sum' ? (bySize.get(k) || 0) + q : Math.max(bySize.get(k) || 0, q));
  });
  return rows.map((r, i) => {
    const own = Math.max(0, qty(r) || 0);
    const id = ids[i]; if (!id) return own;
    const up = sizeUp(id.size);
    return own + (up ? bySize.get(keyOf(id.product, up)) || 0 : 0);
  });
}
