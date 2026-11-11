// Step 2 — Route: which active websites take a READY product. The decision is
// routing.ts (pure); this file reads the rules and writes pb_listings.
// Include →
//   no listing yet → insert it 'queued' with rule_id;
//   a listing still waiting (queued, review, failed, or 'publishing' that no
//   run has claimed yet) → queued again, so it is re-priced and rewritten;
//   a listing routing skipped itself (NO_MATCH, or ARCHIVED while the product
//   was archived) and not on Shopify → queued again;
//   a published listing whose price is not kept by hand → re-priced from the
//   current cost / pricing / rule and sent to Shopify again (no new AI call);
//   anything else (removed by staff, being written / published right now) is
//   left alone.
// Exclude (or no rule and default 'none') → a waiting listing NOT on Shopify
// becomes 'skipped' with NO_MATCH; one already on Shopify is left as is and
// reported back as a warning (staff decide whether to remove it).
import { enc, insert, logActivity, patch, sel } from './db.ts';
import { listingPrice } from './pricing.ts';
import { decide } from './routing.ts';
import { ARCHIVED, LISTING_COLS, RULE_COLS, hasPrice, type ListingRow, type Pricing, type ProductRow, type RuleRow } from './types.ts';

const REQUEUE = ['queued', 'review', 'failed'];
export const NO_MATCH = "No longer matches this website's rules.";
/** Skips routing / the worker made on their own (not staff): undone when the rules take the product back. */
const AUTO_SKIP = [NO_MATCH, ARCHIVED];
const quoted = (s: string) => enc(`"${s}"`);
/** PostgREST or-terms for a listing no run holds and that is not published yet. */
const WAITING_OR = `status.in.(${REQUEUE.join(',')}),and(status.eq.publishing,claimed_at.is.null)`;
const waiting = (l: ListingRow) => REQUEUE.includes(l.status) || (l.status === 'publishing' && !l.claimed_at);
const autoSkipped = (l: ListingRow) => l.status === 'skipped' && AUTO_SKIP.includes(l.error || '') && !l.shopify_product_id;

type Site = { id: string; name: string; routing_default: string; publish_mode: string; pricing: Partial<Pricing> };
export type RouteResult = { routed: number; repriced: number; listings: ListingRow[]; warning?: string };

export async function routeProduct(p: ProductRow, userId: string | null): Promise<RouteResult> {
  const sites = await sel<Site>('pb_websites?active=eq.true&select=id,name,routing_default,publish_mode,pricing&order=name.asc');
  const existing = await sel<ListingRow>(`pb_listings?product_id=eq.${enc(p.id)}&select=${LISTING_COLS}`);
  if (!sites.length) return { routed: 0, repriced: 0, listings: existing };
  const ids = sites.map(s => s.id).join(',');
  const rules = await sel<RuleRow>(`pb_routing_rules?website_id=in.(${ids})&enabled=eq.true&select=${RULE_COLS}&order=position.asc`);
  const bySite = new Map(existing.map(l => [l.website_id, l]));
  const queued: string[] = [], kept: string[] = [], removed: string[] = [], stillLive: string[] = [], repriced: string[] = [], busy: string[] = [];
  for (const s of sites) {
    const d = decide(rules.filter(r => r.website_id === s.id), s.routing_default, p);
    const cur = bySite.get(s.id);
    if (!d.include) {
      if (!cur || cur.status === 'skipped') continue;
      if (cur.shopify_product_id) { stillLive.push(s.name); continue; }
      if (!waiting(cur)) continue;
      const done = await patch('pb_listings', `id=eq.${enc(cur.id)}&or=(${WAITING_OR})&shopify_product_id=is.null`,
        { status: 'skipped', error: NO_MATCH, claimed_at: null });
      if (done.length) removed.push(s.name);
      continue;
    }
    const fields = { status: 'queued', rule_id: d.rule?.id ?? null, attempts: 0, error: null, claimed_at: null };
    if (!cur) {
      const made = await insert('pb_listings', [{ product_id: p.id, website_id: s.id, ...fields }], { onConflict: 'product_id,website_id', mode: 'ignore' });
      (made.length ? queued : kept).push(s.name);
    } else if (waiting(cur) || autoSkipped(cur)) {
      const done = await patch('pb_listings', `id=eq.${enc(cur.id)}&or=(${WAITING_OR},and(status.eq.skipped,shopify_product_id.is.null,error.in.(${AUTO_SKIP.map(quoted).join(',')})))`, fields);
      (done.length ? queued : kept).push(s.name);
    } else if (cur.status === 'skipped' && cur.error === ARCHIVED && cur.shopify_product_id) {
      // Set aside by the worker because the product was archived while this listing waited to go out, yet it is
      // still on Shopify. The product is back: send it again, or Playbook shows "removed" for a product on sale.
      const done = await patch('pb_listings', `id=eq.${enc(cur.id)}&status=eq.skipped&error=eq.${enc(ARCHIVED)}`, fields);
      (done.length ? queued : kept).push(s.name);
    } else if (cur.status === 'published' && !(cur.locked || []).includes('price') && hasPrice(p)) {
      // The cost / copied selling price or the site's pricing changed: only the price moves; the written text stays.
      const calc = listingPrice(p, s.pricing || {}, d.rule?.price_override ?? null)!;
      const same = Number(cur.price) === calc.price && Number(cur.compare_at_price ?? 0) === Number(calc.compare_at ?? 0);
      if (same || !(calc.price > 0)) { kept.push(s.name); continue; }
      const done = await patch('pb_listings', `id=eq.${enc(cur.id)}&status=eq.published`, {
        price: calc.price, compare_at_price: calc.compare_at, rule_id: d.rule?.id ?? null,
        status: s.publish_mode === 'review' ? 'review' : 'publishing', attempts: 0, error: null, claimed_at: null,
      });
      (done.length ? repriced : kept).push(s.name);
    } else {
      if (cur.status === 'publishing') busy.push(s.name); // claimed: goes out with what it was given
      kept.push(s.name);
    }
  }
  const warnings = [
    ...(stillLive.length ? [`No longer matches the rules of ${stillLive.join(', ')}, but it is already on Shopify there — open that listing and tap Remove from site if it should not be sold.`] : []),
    ...(busy.length ? [`${busy.join(', ')}: being published right now with the earlier details — tap Check websites again in a minute.`] : []),
  ];
  const warning = warnings.join(' ') || undefined;
  if (queued.length || removed.length || repriced.length || warning) {
    await logActivity({
      product_id: p.id, action: 'routed', user_id: userId,
      details: {
        websites: queued,
        ...(kept.length ? { unchanged: kept } : {}),
        ...(removed.length ? { removed } : {}),
        ...(repriced.length ? { repriced } : {}),
        ...(warning ? { warning } : {}),
      },
    });
  }
  const listings = await sel<ListingRow>(`pb_listings?product_id=eq.${enc(p.id)}&select=${LISTING_COLS}`);
  return { routed: queued.length, repriced: repriced.length, listings, ...(warning ? { warning } : {}) };
}
