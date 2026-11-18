// "Let AI decide" by itself (owner, 18 Nov 2026: "over here also AI should auto select. No user inputs required").
// A product the read left in Needs info with a tag missing gets ONE automatic fill per read: pb_tags_auto_claim takes
// it and stamps tags_ai_at (read again → asked again), so nothing is paid for twice and a product the AI still cannot
// finish never loops. The fill is tagFill.ts fillOne: the word rules first, then the AI for what is left — a must-have
// attribute always gets a value (the schema asks for at least one), an "only if it fits" one (Product Type) only when
// a listed value truly fits. Then the gate; a product that became Ready is routed by the next run's route_due step.
// Not a bulk change: it finishes the read, whose own tags are not one either. Paused, or the day's AI limit reached:
// nothing is taken (the claim stamps nothing), so the products wait.
import { enc, logActivity, one, rpc } from './db.ts';
import { plain, usdOf } from './http.ts';
import { FILL_NEEDS_MS, fillOne } from './tagFill.ts';
import { type Taxonomy, loadTaxonomy } from './taxonomy.ts';
import { PRODUCT_COLS, type Budget, type ProductRow } from './types.ts';

/** Products taken per claim, and at most per worker run (each may need one cheap AI call). */
export const AUTO_BATCH = 5, AUTO_MAX = 30;

export async function autoFill(o: { budget: Budget; left: (ms: number) => boolean; capped: () => Promise<boolean>; stopped: () => Promise<boolean> }): Promise<number> {
  let tax: Taxonomy | null = null, done = 0, taken = 0;
  while (taken < AUTO_MAX && o.left(FILL_NEEDS_MS) && !(await o.stopped()) && !(await o.capped())) {
    const ids = (await rpc<{ id: string }[]>('pb_tags_auto_claim', { p_limit: AUTO_BATCH })) ?? [];
    if (!ids.length) break;
    tax ??= await loadTaxonomy();
    for (const { id } of ids) {
      taken++;
      try {
        const p = await one<ProductRow>(`pb_products?id=eq.${enc(id)}&status=eq.needs_info&select=${PRODUCT_COLS}`);
        if (!p || (p.locked || []).includes('tags')) continue; // answered or locked meanwhile
        await fillOne(p, tax, { manual: false, auto: true, userId: null, budget: o.budget });
        done++;
      } catch (e) {
        await logActivity({ product_id: id, action: 'failed', details: { step: 'tags_fill', auto: true, error: plain(e), ...(usdOf(e) ? { usd: usdOf(e) } : {}) } });
      }
    }
  }
  return done;
}
