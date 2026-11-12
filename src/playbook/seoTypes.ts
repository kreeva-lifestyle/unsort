// One store, one voice (owner, 2026-11-12): the store profile inside
// pb_websites.content.profile, what a listing carries besides its row
// (private.pb_listing_seo, 20261112090000_pb_store_writer.sql) and the
// necessary details a product needs before anything is written for it.
// The server twins: supabase/functions/pb-products/profile.ts and tagGate.ts.

export interface PbProfile {
  /** Ends every SEO title ("… | Kreeva"); empty = the website's name. */
  brand_name: string;
  market: string;
  spelling: 'british' | 'american';
  units: 'inches' | 'cm';
  audience: string;
  /** What this store leads with: each store should lead with something different. */
  angle: string;
  /** The search phrase each listing is written for: {color} {fabric} {category} {work} {occasion} {name}. */
  keyword_pattern: string;
  delivery: string; stitching: string; returns: string;
  /** Also put the two questions at the end of the description. */
  faq_in_description: boolean;
  /** Send fabric, work, colour, occasion, set contents and the FAQ to Shopify as custom fields. */
  custom_fields: boolean;
}

export const DEFAULT_KEYWORD = '{color} {fabric} {category}';
export const DEFAULT_PROFILE: PbProfile = {
  brand_name: '', market: '', spelling: 'british', units: 'inches', audience: '', angle: '',
  keyword_pattern: DEFAULT_KEYWORD, delivery: '', stitching: '', returns: '', faq_in_description: true, custom_fields: true,
};

export interface PbFaq { q: string; a: string }
export interface PbListingSeo {
  listing_id: string; keyword: string | null; keyword_locked: boolean;
  faq: PbFaq[]; faq_locked: boolean; missing: string[]; notes: string[]; rewrites: number;
}

/** What the AI cost for one product, in dollars as recorded (format.ts aiRupees shows rupees). */
export interface PbAiCost { product_id: string; read_usd: number; tag_usd: number; write_usd: number; writes: number }

/** The pattern filled for a sample or a real product: "Maroon Georgette Kurta Set". */
export function fillKeyword(pattern: string, p: { name?: string | null; category?: string | null; fabric?: string | null; color?: string | null; attributes?: Record<string, string> | null }): string {
  const a = p.attributes || {};
  const vars: Record<string, string> = {
    color: p.color || '', colour: p.color || '', fabric: p.fabric || '', category: p.category || '', name: p.name || '',
    work: a.work || '', occasion: a.occasion || '', pattern: a.pattern || '',
  };
  return (pattern || DEFAULT_KEYWORD).replace(/\{\s*([a-z_]+)\s*\}/gi, (_m, k: string) => (vars[k.toLowerCase()] ?? '').trim())
    .replace(/[^\p{L}\p{N}' &-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** What a product still needs before it can be Ready, besides its required tags (the gate's twin,
 *  pb_products_refresh): a price, a category, a fabric, a colour and at least one photo. */
export const missingDetails = (p: { cost_price?: number | null; sell_price?: number | null; category?: string | null; fabric?: string | null; color?: string | null }, photos: number): string[] => [
  ...(p.cost_price == null && p.sell_price == null ? ['Cost price'] : []), ...((p.category ?? '').trim() ? [] : ['Category']),
  ...((p.fabric ?? '').trim() ? [] : ['Fabric']), ...((p.color ?? '').trim() ? [] : ['Colour']), ...(photos > 0 ? [] : ['Photo']),
];

/** Missing details first, then the required tags; a tag attribute named like a detail ("Colour") is said once. */
export function missingAll(details: string[], tags: string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const m of [...details, ...(tags ?? [])]) if (!out.some(o => o.toLowerCase() === m.toLowerCase())) out.push(m);
  return out;
}
