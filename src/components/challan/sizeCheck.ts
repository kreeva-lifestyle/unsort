// A sale or return line for a design that comes in sizes must name the size
// (DRS210-M, not DRS210) — owner's rule, 2026-11-03. The SKU box already shows
// the size chips; this stops Save until one is picked. Free text the catalog
// does not know, and designs without sizes (or semi-stitched / unstitched),
// pass as before. If the catalog has not loaded, nothing is blocked.
import { resolveSku, needsSize, type Product } from '../../hooks/useProductCatalog';

type CatalogIndex = Parameters<typeof resolveSku>[0];

/** The first line missing its size, as a form error — or null when every line is fine. */
export function missingSizeError(index: CatalogIndex, items: { sku: string }[]): string | null {
  for (let i = 0; i < items.length; i++) {
    const hit = resolveSku(index, items[i].sku);
    if (!hit || hit.size || !needsSize(hit.product)) continue;
    const p: Product = hit.product;
    return `Row ${i + 1} (${p.sku}): pick a size — ${p.sizes.join(', ')}`;
  }
  return null;
}
