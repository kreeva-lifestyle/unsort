// One page of an import run, product by product (runner.ts calls it per page):
// each product goes through ingest() — source 'import', source_ref
// '<host>:<id on that site>' — three at a time. Shopify / WooCommerce also
// fetch each NEW product's own page once (enrich.ts), so:
//   - products imported before are found with ONE lookup per page and skipped
//     before their page is fetched; their STOCK is brought up to date from the
//     list itself (stock.ts), whatever the "in stock only" choice of the run;
//   - no new batch starts in the last META_RESERVE_MS of the import clock (the
//     runner then saves where it stopped and the next tick carries on there).
// Caps: MAX_PRODUCTS new products (added + failed) per run — products already
// here do not count, so "run it again for the rest" works — and MAX_SCANNED
// products looked at in all.
import { plain } from '../http.ts';
import { ingest } from '../ingest.ts';
import { MAX_PRODUCTS, MAX_SCANNED } from './cursor.ts';
import { ingestBody } from './body.ts';
import { type Gate, enrich } from './enrich.ts';
import { type Found } from './normalize.ts';
import { refreshStock } from './stock.ts';
import { type Robots } from './urlCheck.ts';

const INGEST_AT_ONCE = 3;
/** Shopify / Woo: no new batch (3 page fetches + ingest) starts this close to the end of the import clock. */
export const META_RESERVE_MS = 10_000;

export interface Counts { found: number; added: number; skipped: number; out_of_stock: number; failed: number }
export interface PageCtx {
  run: { id: string; host: string; use_their_price: boolean; platform: string | null; in_stock_only: boolean };
  origin: string; robots: Robots; vendor: string; perItem: boolean; until: number;
  worked: boolean; // a batch already ran this tick (so a slow site still moves by at least one)
  gate: Gate; known: (refs: string[]) => Promise<Set<string>>;
}

export const capped = (c: Counts) => c.added + c.failed >= MAX_PRODUCTS || c.found >= MAX_SCANNED;

/** Add the page's products from index `start`; returns where it stopped and the new products it sent to ingest. */
export async function addProducts(items: Found[], start: number, counts: Counts, ctx: PageCtx): Promise<{ next: number; taken: Found[] }> {
  const taken: Found[] = [], here: Found[] = [];
  let i = start;
  const seen = ctx.perItem && i < items.length ? await ctx.known(items.slice(i).map(f => f.ref)) : new Set<string>();
  while (i < items.length && !capped(counts)) {
    if (ctx.perItem && ctx.worked && Date.now() > ctx.until - META_RESERVE_MS) break; // the next tick carries on at item i
    const batch: Found[] = [];
    while (i < items.length && batch.length < INGEST_AT_ONCE && counts.added + counts.failed + batch.length < MAX_PRODUCTS && counts.found < MAX_SCANNED) {
      const f = items[i++];
      counts.found++;
      if (seen.has(f.ref)) here.push(f);
      if (!f.in_stock && ctx.run.in_stock_only) counts.out_of_stock++;
      else if (seen.has(f.ref)) counts.skipped++;
      else batch.push(f);
    }
    if (!batch.length) continue;
    ctx.worked = true;
    taken.push(...batch);
    await Promise.all(batch.map(async (f) => {
      try {
        const r = await ingest(ingestBody(ctx.perItem ? await enrich(f, ctx.origin, ctx.robots, ctx.gate) : f, ctx.run, ctx.vendor));
        if (r.duplicate) counts.skipped++; else counts.added++;
      } catch (e) {
        counts.failed++;
        console.error(`pb-products import ${ctx.run.id} ${f.url}: ${plain(e)}`);
      }
    }));
  }
  // A failure here must not stop the import: the next run compares again.
  if (here.length) await refreshStock(ctx.run.host, here).catch(e => console.error(`pb-products import ${ctx.run.id} stock: ${plain(e)}`));
  return { next: i, taken };
}
