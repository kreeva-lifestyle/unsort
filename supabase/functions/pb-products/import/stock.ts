// Stock of the products that are ALREADY here, brought up to date by every
// import run (owner, 2026-11-12: "If stock out/in-stock on playbook that same
// happens in shopify stores"). A repeat import used to skip a product it had
// copied before, so one that sold out at its store stayed on sale on ours.
// For each such product the run now compares what the store shows today with
// what Playbook has:
//   in stock / out of stock → pb_products.in_stock;
//   the sizes on sale (only while it is in stock, and only when nobody typed
//   the sizes by hand: a sold-out product lists every size) → pb_products.sizes.
// A change is saved with stock.ts saveStock, which sends the listings already
// on Shopify again with the new stock (productInput.ts). Shopify and WooCommerce
// stores only: a generic site's known pages are not fetched again. A product
// its store no longer lists at all is NOT touched (a run may cover only part
// of a store, so "not seen" never means "sold out").
import { enc, sel } from '../db.ts';
import { saveStock, type StockChange } from '../stock.ts';
import { hostTwin, storeSizes } from './body.ts';
import type { Found } from './normalize.ts';

interface Here { id: string; source_ref: string; in_stock: boolean; sizes: string[] | null; locked: string[] | null; status: string }
/** What a product already here changes to, given what its store shows now; null when nothing does. Pure. */
export function stockChange(p: Pick<Here, 'in_stock' | 'sizes' | 'locked'>, f: Pick<Found, 'in_stock' | 'sizes'>): StockChange | null {
  const out: StockChange = {};
  if (p.in_stock !== f.in_stock) out.in_stock = f.in_stock;
  const sizes = storeSizes(f.sizes);
  if (f.in_stock && sizes.length && !(p.locked || []).includes('sizes') && sizes.join('|') !== (p.sizes || []).join('|')) out.sizes = sizes;
  return Object.keys(out).length ? out : null;
}

const quoted = (r: string) => `"${r.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Refresh the stock of the products of this store that are already here. Returns how many changed. */
export async function refreshStock(host: string, items: Found[]): Promise<number> {
  if (!items.length) return 0;
  const byRef = new Map<string, Found>();
  for (const h of [host, hostTwin(host)]) for (const f of items) byRef.set(`${h}:${f.ref}`.slice(0, 200), f);
  const rows = await sel<Here>(`pb_products?source=eq.import&source_ref=in.(${enc([...byRef.keys()].map(quoted).join(','))})&select=id,source_ref,in_stock,sizes,locked,status`);
  let changed = 0;
  for (const p of rows) {
    const f = byRef.get(p.source_ref), ch = f ? stockChange(p, f) : null;
    if (!ch || p.status === 'archived') continue;
    if ((await saveStock(p, ch, { from: host }, null)) >= 0) changed++;
  }
  return changed;
}
