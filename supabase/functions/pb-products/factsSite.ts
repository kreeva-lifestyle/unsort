// resend_website { website_id, dry? } — the website's button "Send tags and fields again" (owner, 20 Nov 2026).
// Every product of the website that is on sale on Shopify is marked (pb_listings.facts_due + facts_force), and the
// worker's small send (factsSend.ts) then sets its product type, Playbook's own tags and its custom fields to what
// Playbook has now — also where the record says the store has them already (someone edited the product in Shopify,
// or a field's kind was changed there). Titles, descriptions, prices, sizes and photos are not touched, and no AI
// is used. `dry`: only say how many products that would be (the screen asks before it sends).
// Not a bulk change in the log (bulkLog.ts): it changes nothing a person or the AI decided. It sends again what
// follows from the product and the website's saved tag rules, so there is nothing to put back, and tapping it twice
// gives the same result. It is written to the website's activity instead, as "Set up on Shopify" is.
import { type Body, uuid } from './actions.ts';
import { countRows, enc, logActivity, one, patch } from './db.ts';
import { HttpError } from './http.ts';
import { ON_SALE } from './stockSend.ts';

export async function resendWebsite(b: Body, userId: string | null) {
  const id = uuid(b.website_id, 'website_id');
  const site = await one<{ id: string; name: string; active: boolean }>(`pb_websites?id=eq.${enc(id)}&select=id,name,active`);
  if (!site) throw new HttpError(404, 'That website no longer exists.');
  const onSale = `website_id=eq.${enc(id)}&${ON_SALE}`;
  const listings = await countRows(`pb_listings?select=id&${onSale}`);
  if (b.dry === true) return { ok: true, dry: true, listings, active: site.active };
  if (!site.active) throw new HttpError(400, `${site.name} is switched off, and a website that is off is sent nothing. Switch it on first.`);
  if (listings) {
    await patch('pb_listings', onSale, { facts_due: true, facts_force: true, facts_tried_at: null });
    await logActivity({ website_id: id, action: 'facts_resend_site', details: { listings }, user_id: userId });
  }
  return { ok: true, listings };
}
