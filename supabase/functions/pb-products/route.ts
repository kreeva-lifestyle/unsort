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
//   a published listing sent with other sizes or another SKU than the product
//   has now (the `published` activity row records what was sent) → sent again
//   as it is, so the Shopify variants follow (a change of stock is not sent
//   this way: it has its own send, stockSend.ts), or whose photos are not the
//   ones the store was last sent — one added, removed or moved (photosEdit.ts)
//   → sent again as it is; found here, not passed in, so every way of routing
//   (save, re-read, tags, photos, the worker's route_due) gets it;
//   a listing that was published before and is waiting to go out again (the
//   re-send above; on a review site it waits for a person) → left as it is,
//   only its price brought up to date: it leaves with what the product has
//   now, so a second change in the same minute does not send it back to the
//   AI to be written again;
//   one being written / published right now goes out with what it was given,
//   and the product is flagged (route_due) so the worker checks it again once
//   that is done — the change is not lost;
//   anything else (removed by staff) is left alone.
// Exclude (or no rule and default 'none') → a waiting listing NOT on Shopify
// becomes 'skipped' with NO_MATCH; one already on Shopify is left as is and
// reported back as a warning (staff decide whether to remove it).
import { enc, insert, logActivity, patch, sel } from './db.ts';
import { galleryOf } from './photos.ts';
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
/** Published before and waiting to go out again (not held by a run). */
const resending = (l: ListingRow) => !!l.published_at && !!l.shopify_product_id && (l.status === 'review' || (l.status === 'publishing' && !l.claimed_at));

type Site = { id: string; name: string; routing_default: string; publish_mode: string; pricing: Partial<Pricing> };
export type RouteResult = { routed: number; repriced: number; resent: number; busy: boolean; listings: ListingRow[]; warning?: string };

/** What each listing was last sent with (newest `published` row per listing; none → not known).
 *  `photos_tried`: a list of photos the store refused (publish.ts) — not sent again by itself. */
export type Sent = { sizes?: string[]; sku?: string; photos?: string[]; photos_tried?: string[] };
/** The store's gallery is not the product's: a photo added, removed or moved since it was last sent. With no
 *  photos here nothing would be sent (the store keeps what it has), so that is not "behind". */
export const galleryBehind = (s: Sent | undefined, photos: string[]) => {
  const was = s?.photos_tried ?? s?.photos;
  return Array.isArray(was) && photos.length > 0 && was.join('|') !== photos.join('|');
};
export async function lastSent(productId: string): Promise<Map<string, Sent>> {
  const rows = await sel<{ listing_id: string | null; details: Sent | null }>(`pb_activity?product_id=eq.${enc(productId)}&action=eq.published&select=listing_id,details&order=created_at.desc&limit=40`);
  const out = new Map<string, Sent>();
  for (const r of rows) if (r.listing_id && !out.has(r.listing_id)) out.set(r.listing_id, r.details || {});
  return out;
}

export async function routeProduct(p: ProductRow, userId: string | null): Promise<RouteResult> {
  const sites = await sel<Site>('pb_websites?active=eq.true&select=id,name,routing_default,publish_mode,pricing&order=name.asc');
  const existing = await sel<ListingRow>(`pb_listings?product_id=eq.${enc(p.id)}&select=${LISTING_COLS}`);
  if (!sites.length) return { routed: 0, repriced: 0, resent: 0, busy: false, listings: existing };
  const ids = sites.map(s => s.id).join(',');
  const rules = await sel<RuleRow>(`pb_routing_rules?website_id=in.(${ids})&enabled=eq.true&select=${RULE_COLS}&order=position.asc`);
  const bySite = new Map(existing.map(l => [l.website_id, l]));
  const live = existing.some(l => l.status === 'published');
  const [sent, photos] = live ? await Promise.all([lastSent(p.id), galleryOf(p.id).then(g => g.map(i => i.path))]) : [new Map<string, Sent>(), [] as string[]];
  const behind = (l: ListingRow) => {
    const s = sent.get(l.id);
    if (!s) return false;
    return (Array.isArray(s.sizes) && (s.sizes.join('|') !== (p.sizes || []).join('|') || String(s.sku ?? '') !== String(p.sku ?? ''))) || galleryBehind(s, photos);
  };
  /** The listing's price from the current cost / pricing / rule, when it is not kept by hand and differs from what it has. */
  const newPrice = (cur: ListingRow, s: Site, rule: RuleRow | null | undefined) => {
    const calc = !(cur.locked || []).includes('price') && hasPrice(p) ? listingPrice(p, s.pricing || {}, rule?.price_override ?? null) : null;
    return calc && calc.price > 0 && !(Number(cur.price) === calc.price && Number(cur.compare_at_price ?? 0) === Number(calc.compare_at ?? 0)) ? calc : null;
  };
  const queued: string[] = [], kept: string[] = [], removed: string[] = [], stillLive: string[] = [], repriced: string[] = [], resent: string[] = [], busy: string[] = [];
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
    } else if (resending(cur)) {
      const calc = newPrice(cur, s, d.rule);
      const done = calc ? await patch('pb_listings', `id=eq.${enc(cur.id)}&status=eq.${cur.status}&claimed_at=is.null`, { price: calc.price, compare_at_price: calc.compare_at, rule_id: d.rule?.id ?? null }) : [];
      (done.length ? repriced : kept).push(s.name);
    } else if (waiting(cur) || autoSkipped(cur)) {
      const done = await patch('pb_listings', `id=eq.${enc(cur.id)}&or=(${WAITING_OR},and(status.eq.skipped,shopify_product_id.is.null,error.in.(${AUTO_SKIP.map(quoted).join(',')})))`, fields);
      (done.length ? queued : kept).push(s.name);
    } else if (cur.status === 'skipped' && cur.error === ARCHIVED && cur.shopify_product_id) {
      // Set aside by the worker because the product was archived while this listing waited to go out, yet it is
      // still on Shopify. The product is back: send it again, or Playbook shows "removed" for a product on sale.
      const done = await patch('pb_listings', `id=eq.${enc(cur.id)}&status=eq.skipped&error=eq.${enc(ARCHIVED)}`, fields);
      (done.length ? queued : kept).push(s.name);
    } else if (cur.status === 'published') {
      // The cost / copied selling price or the site's pricing changed: only the price moves; the written text stays.
      const calc = newPrice(cur, s, d.rule);
      if (!calc && !behind(cur)) { kept.push(s.name); continue; }
      const done = await patch('pb_listings', `id=eq.${enc(cur.id)}&status=eq.published`, {
        ...(calc ? { price: calc.price, compare_at_price: calc.compare_at, rule_id: d.rule?.id ?? null } : {}),
        status: s.publish_mode === 'review' ? 'review' : 'publishing', attempts: 0, error: null, claimed_at: null,
      });
      (done.length ? (calc ? repriced : resent) : kept).push(s.name);
    } else {
      if (cur.status === 'publishing' || cur.status === 'generating') busy.push(s.name); // claimed: goes out with what it was given
      kept.push(s.name);
    }
  }
  // Checked again by the worker (tagFill.ts routeDue) once the run that holds the listing is done.
  if (busy.length) await patch('pb_products', `id=eq.${enc(p.id)}`, { route_due: true });
  const warnings = [
    ...(stillLive.length ? [`No longer matches the rules of ${stillLive.join(', ')}, but it is already on Shopify there — open that listing and tap Remove from site if it should not be sold.`] : []),
    ...(busy.length ? [`${busy.join(', ')}: being written or published right now with the earlier details. Playbook checks it again by itself within a few minutes.`] : []),
  ];
  const warning = warnings.join(' ') || undefined;
  // A busy listing alone is not written to the timeline: the worker may meet it every minute until it is free.
  if (queued.length || removed.length || repriced.length || resent.length || stillLive.length) {
    await logActivity({
      product_id: p.id, action: 'routed', user_id: userId,
      details: {
        websites: queued,
        ...(kept.length ? { unchanged: kept } : {}),
        ...(removed.length ? { removed } : {}),
        ...(repriced.length ? { repriced } : {}),
        ...(resent.length ? { resent } : {}),
        ...(warning ? { warning } : {}),
      },
    });
  }
  const listings = await sel<ListingRow>(`pb_listings?product_id=eq.${enc(p.id)}&select=${LISTING_COLS}`);
  return { routed: queued.length, repriced: repriced.length, resent: resent.length, busy: busy.length > 0, listings, ...(warning ? { warning } : {}) };
}
