// The tag step that rides on a read (reader.ts), after the facts are saved:
// rules for the attributes of the category the reader settled on, then the
// AI's choices from the same call for what the rules left empty (tagAuto.ts),
// then the ready gate (pb_products_refresh): a missing required attribute
// moves the product to Needs info with "Missing: Colour". A failure here is
// logged and the gate is still re-applied, so a product never stays Ready
// without its required values.
import { logActivity } from './db.ts';
import { plain } from './http.ts';
import { type TagOut, type TagSpec, readTags } from './tagPrompt.ts';
import { autoTag, refresh } from './tagStore.ts';
import { type Taxonomy, attrsFor } from './taxonomy.ts';
import type { ProductRow } from './types.ts';

export async function tagAfterRead(p: ProductRow, tax: Taxonomy, spec: TagSpec, out: TagOut, userId: string | null): Promise<ProductRow> {
  try {
    const only = new Set(attrsFor(tax, p.category).map(a => a.id));
    const r = await autoTag(p, tax, { ai: readTags(spec, out, only), byCategory: true });
    const fin = r?.refreshed ?? (await refresh([p.id]))[0];
    return fin ? { ...p, status: fin.status, missing_attrs: fin.missing } : p;
  } catch (e) {
    const msg = plain(e);
    console.error(`pb-products tags ${p.id}: ${msg}`);
    await logActivity({ product_id: p.id, action: 'failed', details: { step: 'tags', error: msg }, user_id: userId });
    try { const fin = (await refresh([p.id]))[0]; if (fin) return { ...p, status: fin.status, missing_attrs: fin.missing }; } catch (e2) { console.error(`pb-products gate ${p.id}: ${plain(e2)}`); }
    return p;
  }
}
