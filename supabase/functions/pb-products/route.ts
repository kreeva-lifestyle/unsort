// Step 2 — Route: which active websites take a READY product. The decision is
// routing.ts (pure); this file reads the rules and writes pb_listings.
// Include → upsert the (product, website) listing as 'queued' with rule_id.
// A listing that is published or skipped by staff, or being written /
// published right now, is never touched.
// Exclude (or no rule and default 'none') → a listing still waiting (queued,
// review, failed) that is NOT on Shopify yet becomes 'skipped' with
// NO_MATCH; one already on Shopify is left as is and reported (staff decide
// whether to unpublish). A NO_MATCH listing is queued again if the rules
// take the product back later.
import { enc, insert, logActivity, patch, sel } from './db.ts';
import { decide } from './routing.ts';
import { LISTING_COLS, RULE_COLS, type ListingRow, type ProductRow, type RuleRow } from './types.ts';

const REQUEUE = ['queued', 'review', 'failed'];
export const NO_MATCH = "No longer matches this website's rules.";

export async function routeProduct(p: ProductRow, userId: string | null): Promise<{ routed: number; listings: ListingRow[] }> {
  const sites = await sel<{ id: string; name: string; routing_default: string }>('pb_websites?active=eq.true&select=id,name,routing_default&order=name.asc');
  const existing = await sel<ListingRow>(`pb_listings?product_id=eq.${enc(p.id)}&select=${LISTING_COLS}`);
  if (!sites.length) return { routed: 0, listings: existing };
  const ids = sites.map(s => s.id).join(',');
  const rules = await sel<RuleRow>(`pb_routing_rules?website_id=in.(${ids})&enabled=eq.true&select=${RULE_COLS}&order=position.asc`);
  const bySite = new Map(existing.map(l => [l.website_id, l]));
  const queued: string[] = [], kept: string[] = [], removed: string[] = [], stillLive: string[] = [];
  for (const s of sites) {
    const d = decide(rules.filter(r => r.website_id === s.id), s.routing_default, p);
    const cur = bySite.get(s.id);
    if (!d.include) {
      if (!cur || !REQUEUE.includes(cur.status)) continue;
      if (cur.shopify_product_id) { stillLive.push(s.name); continue; }
      const done = await patch('pb_listings', `id=eq.${enc(cur.id)}&status=in.(${REQUEUE.join(',')})&shopify_product_id=is.null`,
        { status: 'skipped', error: NO_MATCH, claimed_at: null });
      if (done.length) removed.push(s.name);
      continue;
    }
    const fields = { status: 'queued', rule_id: d.rule?.id ?? null, attempts: 0, error: null, claimed_at: null };
    if (!cur) {
      const made = await insert('pb_listings', [{ product_id: p.id, website_id: s.id, ...fields }], { onConflict: 'product_id,website_id', mode: 'ignore' });
      (made.length ? queued : kept).push(s.name);
    } else if (REQUEUE.includes(cur.status) || (cur.status === 'skipped' && cur.error === NO_MATCH && !cur.shopify_product_id)) {
      const done = await patch('pb_listings', `id=eq.${enc(cur.id)}&or=(status.in.(${REQUEUE.join(',')}),and(status.eq.skipped,error.eq.${enc(`"${NO_MATCH}"`)}))`, fields);
      (done.length ? queued : kept).push(s.name);
    } else {
      kept.push(s.name);
    }
  }
  if (queued.length || removed.length || stillLive.length) {
    await logActivity({
      product_id: p.id, action: 'routed', user_id: userId,
      details: {
        websites: queued,
        ...(kept.length ? { unchanged: kept } : {}),
        ...(removed.length ? { removed } : {}),
        ...(stillLive.length ? { warning: `No longer matches the rules of ${stillLive.join(', ')}, but it is already on Shopify there — unpublish it if it should not be sold.` } : {}),
      },
    });
  }
  const listings = await sel<ListingRow>(`pb_listings?product_id=eq.${enc(p.id)}&select=${LISTING_COLS}`);
  return { routed: queued.length, listings };
}
