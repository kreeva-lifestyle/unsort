// Bulk actions on listings (owner, 2026-11-12: "Implement bulk action").
//   reprice_website { website_id } — after a website's pricing or a rule's own
//     price changed: every WRITTEN listing of that website gets the price
//     today's cost / pricing / rule gives. A published one whose price moved is
//     sent to Shopify again (text untouched, no AI call); one still waiting
//     (review, failed, not yet claimed) only has its price corrected. A price
//     typed by hand (kept) stays. The person who tapped it is the approval, so
//     a "Review first" website's listings go straight out too.
//   retry_failed { website_id? } — every failed listing gets its three tries
//     again: a written one is sent again, one the AI never wrote is queued.
// Both only mark the rows; the worker (worker.ts) writes and sends them, about
// ten a minute. Stops after ~100 s and reports `more: true` (tap again).
import { type Body, uuid } from './actions.ts';
import { enc, logActivity, one, patch, sel } from './db.ts';
import { HttpError } from './http.ts';
import { listingPrice } from './pricing.ts';
import { RULE_COLS, hasPrice, type Pricing, type RuleRow } from './types.ts';

const PAGE = 200, AT_ONCE = 8;
interface Row {
  id: string; status: string; price: number | null; compare_at_price: number | null; locked: string[] | null; rule_id: string | null;
  pb_products: { cost_price: number | null; sell_price: number | null; status: string };
}
type Override = { markup_pct?: number; add_flat?: number } | null;

/** The price this listing should have now, or why it is left: 'kept' (typed by hand), 'same', 'none' (the product has no price). */
export function newPrice(l: Pick<Row, 'price' | 'compare_at_price' | 'locked' | 'pb_products'>, pricing: Partial<Pricing>, override: Override): { price: number; compare_at_price: number | null } | 'kept' | 'same' | 'none' {
  if ((l.locked || []).includes('price')) return 'kept';
  const calc = hasPrice(l.pb_products) ? listingPrice(l.pb_products, pricing, override) : null;
  if (!calc || !(calc.price > 0)) return 'none';
  return Number(l.price) === calc.price && Number(l.compare_at_price ?? 0) === Number(calc.compare_at ?? 0) ? 'same' : { price: calc.price, compare_at_price: calc.compare_at };
}

export async function repriceWebsite(b: Body, userId: string | null) {
  const id = uuid(b.website_id, 'website_id');
  const site = await one<{ id: string; name: string; pricing: Partial<Pricing> | null }>(`pb_websites?id=eq.${enc(id)}&select=id,name,pricing`);
  if (!site) throw new HttpError(404, 'That website no longer exists.');
  const rules = new Map((await sel<RuleRow>(`pb_routing_rules?website_id=eq.${enc(id)}&select=${RULE_COLS}`)).map(r => [r.id, r]));
  const t0 = Date.now();
  let repriced = 0, kept = 0, more = false, lastId = '';
  for (;;) {
    if (Date.now() - t0 > 100_000) { more = true; break; }
    const page = await sel<Row>(`pb_listings?website_id=eq.${enc(id)}&generated_at=not.is.null&or=(status.in.(published,review,failed),and(status.eq.publishing,claimed_at.is.null))`
      + `${lastId ? `&id=gt.${enc(lastId)}` : ''}&select=id,status,price,compare_at_price,locked,rule_id,pb_products!inner(cost_price,sell_price,status)&pb_products.status=eq.ready&order=id.asc&limit=${PAGE}`);
    if (!page.length) break;
    lastId = page[page.length - 1].id;
    const todo = page.flatMap((l) => {
      const now = newPrice(l, site.pricing || {}, (l.rule_id ? rules.get(l.rule_id)?.price_override : null) ?? null);
      if (now === 'kept') kept++;
      return typeof now === 'string' ? [] : [{ l, now }];
    });
    for (let i = 0; i < todo.length; i += AT_ONCE) {
      const done = await Promise.all(todo.slice(i, i + AT_ONCE).map(({ l, now }) => patch('pb_listings',
        // only from the state it was read in: a run may have claimed or published it meanwhile
        `id=eq.${enc(l.id)}&status=eq.${enc(l.status)}${l.status === 'publishing' ? '&claimed_at=is.null' : ''}`,
        { ...now, ...(l.status === 'published' ? { status: 'publishing', attempts: 0, error: null, claimed_at: null } : {}) })));
      repriced += done.filter(d => d.length).length;
    }
    if (page.length < PAGE) break;
  }
  if (repriced) await logActivity({ website_id: id, action: 'repriced_site', details: { repriced, kept, ...(more ? { more } : {}) }, user_id: userId });
  return { ok: true, repriced, kept, more };
}

export async function retryFailed(b: Body, userId: string | null) {
  const site = b.website_id ? uuid(b.website_id, 'website_id') : null;
  const failed = `status=eq.failed${site ? `&website_id=eq.${enc(site)}` : ''}`;
  const again = { attempts: 0, error: null, claimed_at: null };
  const sent = await patch('pb_listings', `${failed}&generated_at=not.is.null`, { status: 'publishing', ...again });
  const written = await patch('pb_listings', `${failed}&generated_at=is.null`, { status: 'queued', ...again });
  const retried = sent.length + written.length;
  if (retried) await logActivity({ website_id: site, action: 'retried_failed', details: { retried, to_shopify: sent.length, to_writer: written.length }, user_id: userId });
  return { ok: true, retried };
}
