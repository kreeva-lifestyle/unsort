// What a store is shown of a product besides its written text: Shopify's product type (Playbook's category, which
// files the product in its collection), Playbook's own tags, and the custom fields. Owner, 20 Nov 2026: "Category
// changes: a change does not reach products already on the store. Corrected tags and fields: these are not sent again
// by themselves." They were worked out once, when the AI wrote the listing; now they are worked out from the product
// as it is at EVERY send, by this one file, so the full publish (publish.ts) and the small send (factsSend.ts) cannot
// drift apart:
//   type    the product's category (never an empty one: the store keeps what it has);
//   tags    the website's tag rules (tags.ts) over the product's facts and chosen values, plus the AI's extra tags
//           kept with the listing (ai_tags). Tags a person typed on the listing (locked) stay as typed;
//   fields  one per Playbook attribute, as fields.ts builds them (without the questions: they belong to the text).
// What was sent is kept on the listing (pb_listings.sent), so the next send knows which of the store's tags are
// Playbook's own (publishParts.ts mergeTags), which fields it filled before, and whether anything changed at all.
// The pure parts are tested in test/listingFacts.test.mjs.
import { enc, one } from './db.ts';
import { type AttrValues, fieldInputs } from './fields.ts';
import { profileOf } from './profile.ts';
import { normalizeSizes } from './sizes.ts';
import { attributeValues, siteValueTags } from './tagStore.ts';
import { buildTags, vendorCode } from './tags.ts';
import type { ListingRow, ProductRow, SentFacts, TagRules, WebsiteRow } from './types.ts';

export interface Vendor { name: string; codes: string[] | null }
type TagListing = Pick<ListingRow, 'tags' | 'ai_tags' | 'locked'>;

/** The AI's extra tags a rebuild keeps: the ones stored with the listing. For a listing written before they were
 *  kept, only its tags on the website's allowed list: anything else cannot be told from a rule tag that went stale. */
export function extrasOf(l: Pick<ListingRow, 'tags' | 'ai_tags'>, rules: Partial<TagRules>): string[] {
  if (Array.isArray(l.ai_tags)) return l.ai_tags;
  const ok = new Set((rules.ai_allowed || []).map(t => String(t).trim().toLowerCase()).filter(Boolean));
  return ok.size ? (l.tags || []).filter(t => ok.has(String(t).trim().toLowerCase())) : [];
}

/** Playbook's own tags for a listing, as its product is now. `valueTags`: the chosen values in the site's tag style. */
export function ownTags(a: { l: TagListing; p: ProductRow; rules: Partial<TagRules>; vendor: Vendor | null; valueTags: string[] }): string[] {
  if ((a.l.locked || []).includes('tags')) return a.l.tags || [];
  const { p, vendor } = a;
  const vars = { category: p.category || '', fabric: p.fabric || '', color: p.color || '', vendor: vendor?.name || '', sku: p.sku || '', name: p.name || '' };
  return buildTags(a.rules, { ...vars, vendor_code: vendorCode(vendor?.codes, p.sku), sizes: normalizeSizes(p.sizes || []), attributes: p.attributes || {}, tags: a.valueTags }, extrasOf(a.l, a.rules));
}

/** The custom fields as key → value (a list as its JSON), for telling whether one changed or went empty. */
export const fieldRecord = (p: Pick<ProductRow, 'fabric' | 'color' | 'attributes'>, attrs: AttrValues[]): Record<string, string> =>
  Object.fromEntries(fieldInputs('', p, [], attrs).map(f => [f.key, f.value]));

/** `fields` null: this website sends no custom fields (Store profile → Custom fields is off). */
export interface Facts { type: string; tags: string[]; fields: Record<string, string> | null; attrs: AttrValues[] }

/** Read what the store should show for this listing now (three small reads). */
export async function listingFacts(l: TagListing, p: ProductRow, site: WebsiteRow): Promise<Facts> {
  const rules = site.tag_rules || {}, typed = (l.locked || []).includes('tags'), fields = profileOf(site).custom_fields;
  const [vendor, valueTags, attrs] = await Promise.all([
    p.vendor_id ? one<Vendor>(`pb_vendors?id=eq.${enc(p.vendor_id)}&select=name,codes`) : Promise.resolve(null),
    typed ? Promise.resolve([] as string[]) : siteValueTags(p.id, rules.tag_style, p.category),
    fields ? attributeValues(p.id, p.category) : Promise.resolve([] as AttrValues[]),
  ]);
  return { type: String(p.category || '').trim(), tags: ownTags({ l, p, rules, vendor, valueTags }), fields: fields ? fieldRecord(p, attrs) : null, attrs };
}

const low = (s: string) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();
/** The same tags, capitals and order aside. */
export const sameTags = (a: string[], b: string[]) => { const x = new Set(a.map(low)), y = new Set(b.map(low)); return x.size === y.size && [...x].every(t => y.has(t)); };
const sameRecord = (a: Record<string, string>, b: Record<string, string>) => { const k = Object.keys(a); return k.length === Object.keys(b).length && k.every(x => a[x] === b[x]); };

/** Does the store already have these facts, going by the record of the last send? No record = not known = no.
 *  Tags are compared as a set, capitals aside (their order is not a change). An empty category is never sent, so
 *  it is never a difference; nor are the fields of a website that sends none. */
export function sameFacts(now: Facts, was: SentFacts | null | undefined): boolean {
  if (!was || !Array.isArray(was.tags)) return false;
  if (now.type && now.type !== String(was.type ?? '')) return false;
  if (!sameTags(now.tags, was.tags)) return false;
  return now.fields === null || sameRecord(now.fields, was.fields || {});
}

/** The record of a send: what the store has of Playbook's now. A website that sends no fields keeps the earlier
 *  record of them, so switching fields on again knows what is there. */
export const sentOf = (now: Facts, was: SentFacts | null | undefined): SentFacts =>
  ({ type: now.type || String(was?.type ?? ''), tags: now.tags, fields: now.fields ?? was?.fields ?? {} });

/** Fields Playbook filled last time that the product no longer has a value for: taken off the store, so a value
 *  removed in Playbook does not live on there. Only keys on record: a field someone else filled is never touched. */
export const emptied = (now: Facts, was: SentFacts | null | undefined): string[] =>
  (now.fields === null ? [] : Object.keys(was?.fields || {}).filter(k => !(k in now.fields!)));
