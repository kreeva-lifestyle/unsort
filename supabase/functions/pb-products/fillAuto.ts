// "Let AI decide" by itself (owner, 18 Nov 2026: "over here also AI should auto select. No user inputs required").
// A product waiting in Needs info only for a tag gets ONE automatic fill per read: pb_tags_auto_claim takes one product
// at a time and stamps tags_ai_at (read again, or a tag newly missing → asked again), so nothing is paid for twice and
// a product the AI still cannot finish never loops. The fill is tagFill.ts fillOne: the word rules first, then the AI
// for what is left — a must-have attribute always gets a value (the schema asks for at least one), an "only if it fits"
// one (Product Type) only when a listed value truly fits. Then the gate; a product that became Ready is routed by the
// next run's route_due step. Not a bulk change: it finishes the read, whose own tags are not one either.
// Paused or no time left: nothing is taken. The day's AI limit used up: the waiting products are held until the next
// IST day (pb_tags_auto_hold), so they do not wake the worker every minute. An AI that cannot be reached (no key, no
// credit, busy, down) gives the try back and holds the product 30 minutes; a failure is never left unchecked — the
// gate runs again either way, so a product held only by an "only if it fits" attribute still goes Ready.
import { istDayStart } from './brake.ts';
import { enc, logActivity, one, patch, rpc } from './db.ts';
import { HttpError, plain, usdOf } from './http.ts';
import { FILL_NEEDS_MS, fillOne } from './tagFill.ts';
import { failureOf } from './tagsFile.ts';
import { type Taxonomy, loadTaxonomy } from './taxonomy.ts';
import { PRODUCT_COLS, type Budget, type ProductRow } from './types.ts';

/** Products filled at most per worker run (each may need one cheap AI call). */
export const AUTO_MAX = 30;
const OUTAGE_WAIT_MS = 30 * 60_000;

export async function autoFill(o: { budget: Budget; left: (ms: number) => boolean; capped: () => Promise<boolean>; stopped: () => Promise<boolean> }): Promise<number> {
  let tax: Taxonomy | null = null, done = 0;
  for (let taken = 0; taken < AUTO_MAX && o.left(FILL_NEEDS_MS) && !(await o.stopped()); taken++) {
    if (await o.capped()) { await rpc('pb_tags_auto_hold', { p_until: new Date(Date.parse(istDayStart()) + 86_400_000).toISOString() }); break; }
    const [c] = (await rpc<{ id: string }[]>('pb_tags_auto_claim', { p_limit: 1 })) ?? [];
    if (!c) break;
    tax ??= await loadTaxonomy();
    try {
      const p = await one<ProductRow>(`pb_products?id=eq.${enc(c.id)}&status=eq.needs_info&select=${PRODUCT_COLS}`);
      if (!p || (p.locked || []).includes('tags')) continue; // answered or locked meanwhile
      await fillOne(p, tax, { manual: false, auto: true, userId: null, budget: o.budget });
      done++;
    } catch (e) {
      // No AI to ask, or no answer in time (an aborted call is not paid for): the try is given back.
      const outage = failureOf(e) === 'outage' || (e instanceof HttpError && e.status === 504 && !usdOf(e));
      await logActivity({ product_id: c.id, action: 'failed', details: { step: 'tags_fill', auto: true, error: plain(e), ...(usdOf(e) ? { usd: usdOf(e) } : {}) } });
      // The gate again (no AI): what is no longer a must does not hold it. Best effort — the failure is logged above.
      await rpc('pb_products_refresh', { p_ids: [c.id] }).catch(r => console.error(`pb-products auto fill ${c.id}: gate not checked again: ${plain(r)}`));
      if (outage) { // the try is given back, after a wait; every other waiting product waits too
        const until = new Date(Date.now() + OUTAGE_WAIT_MS).toISOString();
        await patch('pb_products', `id=eq.${enc(c.id)}`, { tags_ai_at: null, tags_ai_retry_at: until });
        await rpc('pb_tags_auto_hold', { p_until: until });
        break;
      }
    }
  }
  return done;
}
