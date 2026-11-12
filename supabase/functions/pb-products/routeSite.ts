// route_website: send the READY products already in the directory to ONE
// website — run when a site is switched on, or from "Send matching products
// now" after its rules change. Per-product routing (route.ts) only runs when a
// product is read, saved or checked again, so without this a new store would
// only get products that arrive after it. Pages of 100 products: a listing is
// inserted 'queued' for each match that has none, and a listing routing
// skipped itself (NO_MATCH / ARCHIVED, never on Shopify) is queued again, and
// so is one a revert of an earlier send took back (bulkLog.ts REVERTED; one
// that was already on the store goes back as it is, with no new AI call).
// Listings staff removed, or that already exist in any other state, are left
// alone. Stops after ~100 s and reports `more: true` (tap again to continue).
// A bulk change: written to the log with the listings it queued, so it can be
// taken back (Settings → Bulk changes).
import { type Body, uuid } from './actions.ts';
import { REVERTED, endRun, startRun } from './bulkLog.ts';
import { enc, insert, logActivity, one, patch, sel } from './db.ts';
import { HttpError } from './http.ts';
import { NO_MATCH } from './route.ts';
import { decide } from './routing.ts';
import { ARCHIVED, PRODUCT_COLS, RULE_COLS, type ProductRow, type RuleRow } from './types.ts';

const PAGE = 100;
const quoted = (s: string) => enc(`"${s}"`);

export async function routeWebsite(b: Body, userId: string | null) {
  const id = uuid(b.website_id, 'website_id');
  const site = await one<{ id: string; name: string; active: boolean; routing_default: string }>(`pb_websites?id=eq.${enc(id)}&select=id,name,active,routing_default`);
  if (!site) throw new HttpError(404, 'That website no longer exists.');
  if (!site.active) throw new HttpError(400, `${site.name} is switched off — turn it on first.`);
  const rules = await sel<RuleRow>(`pb_routing_rules?website_id=eq.${enc(id)}&enabled=eq.true&select=${RULE_COLS}&order=position.asc`);
  const t0 = Date.now();
  let queued = 0, matched = 0, more = false, lastId = '';
  // Set aside by routing itself and never on Shopify, or taken back by a revert (on Shopify or not).
  const auto = `status=eq.skipped&error=in.(${[NO_MATCH, ARCHIVED, REVERTED].map(quoted).join(',')})&or=(shopify_product_id.is.null,error.eq.${quoted(REVERTED)})`;
  const run = await startRun('route_site', `Sent matching products to ${site.name}`, { websiteId: id, userId });
  try {
    for (;;) {
      if (Date.now() - t0 > 100_000) { more = true; break; }
      const page = await sel<ProductRow>(`pb_products?status=eq.ready${lastId ? `&id=gt.${enc(lastId)}` : ''}&select=${PRODUCT_COLS}&order=id.asc&limit=${PAGE}`);
      if (!page.length) break;
      lastId = page[page.length - 1].id;
      const take = page.map(p => ({ p, d: decide(rules, site.routing_default, p) })).filter(x => x.d.include);
      matched += take.length;
      if (take.length) {
        const made = await insert('pb_listings', take.map(({ p, d }) => ({ product_id: p.id, website_id: id, status: 'queued', rule_id: d.rule?.id ?? null })),
          { onConflict: 'product_id,website_id', mode: 'ignore', run });
        const skipped = await sel<{ id: string; product_id: string; generated_at: string | null; shopify_product_id: string | null }>(
          `pb_listings?website_id=eq.${enc(id)}&product_id=in.(${take.map(x => x.p.id).join(',')})&${auto}&select=id,product_id,generated_at,shopify_product_id`);
        let back = 0;
        for (const s of skipped) { // rare: one by one, each with its own rule
          const rule = take.find(x => x.p.id === s.product_id)?.d.rule;
          // One a revert took off the store goes back as it was written; anything else is written (again).
          const status = s.shopify_product_id && s.generated_at ? 'publishing' : 'queued';
          back += (await patch('pb_listings', `id=eq.${enc(s.id)}&${auto}`, { status, rule_id: rule?.id ?? null, attempts: 0, error: null, claimed_at: null, unpublish_due: false }, 'id', run)).length;
        }
        // One a revert marked to come off the store, not taken off yet: this send takes it again, so it stays on.
        await patch('pb_listings', `website_id=eq.${enc(id)}&unpublish_due=eq.true&product_id=in.(${take.map(x => x.p.id).join(',')})`, { unpublish_due: false, unpublish_tried_at: null });
        queued += made.length + back;
      }
      if (page.length < PAGE) break;
    }
  } finally { await endRun(run, { queued, matched, ...(more ? { more } : {}) }); } // also when it stopped half-way: what it did queue is in the log
  if (queued) await logActivity({ website_id: id, action: 'routed_site', details: { queued, matched, run_id: run, ...(more ? { more } : {}) }, user_id: userId });
  return { ok: true, queued, matched, more };
}
