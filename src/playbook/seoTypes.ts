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

/** The parts a pattern may use, least important first: left out first when the phrase is too long (profile.ts DROP). */
const DROP = ['occasion', 'pattern', 'work', 'fabric', 'colour', 'color'];

/** The longest search phrase the SEO title holds beside "| Brand" (profile.ts phraseMax's twin): a brand that leaves the
 *  product fewer than 12 characters is left out of SEO titles, so it takes no room. */
export function phraseMax(brand: string, titleMax?: number, metaTitleMax?: number): number {
  const b = brand.replace(/\s+/g, ' ').trim();
  const meta = metaTitleMax ? metaTitleMax - (b && metaTitleMax - b.length - 3 >= 12 ? b.length + 3 : 0) : 80;
  return Math.max(20, Math.min(80, titleMax || 80, meta));
}

/** The pattern filled for a sample product (the server's keywordOf twin, without the tag lists): one item of each fact,
 *  and no longer than `max` — the least important part left out first, then cut at a word.
 *  "{color} {fabric} {category}" → "Maroon Georgette Kurta Set". */
export function fillKeyword(pattern: string, p: { name?: string | null; category?: string | null; fabric?: string | null; color?: string | null; attributes?: Record<string, string> | null }, max = 80): string {
  const a = p.attributes || {};
  const one = (s: unknown) => String(s ?? '').split(/\s*[,;|/]\s*/)[0].replace(/\s+/g, ' ').trim().slice(0, 40);
  const vars: Record<string, string> = {
    color: one(p.color), colour: one(p.color), fabric: one(p.fabric), work: one(a.work), occasion: one(a.occasion), pattern: one(a.pattern),
    category: (p.category || '').trim().slice(0, 60), name: (p.name || '').trim().slice(0, 60),
  };
  const pieces = (pattern || DEFAULT_KEYWORD).split(/(\{\s*[a-z_]+\s*\})/i).map(t => {
    const m = /^\{\s*([a-z_]+)\s*\}$/i.exec(t), key = m ? m[1].toLowerCase() : '';
    return { key, text: m ? vars[key] ?? '' : t };
  });
  const joined = () => pieces.map(x => x.text).join('').replace(/[^\p{L}\p{N}' &-]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const cap = Math.max(20, Math.min(80, max));
  for (const k of DROP) {
    if (joined().length <= cap) break;
    for (const x of pieces) if (x.key === k) x.text = '';
  }
  const s = joined();
  return s.length <= cap ? s : (s.slice(0, cap + 1).replace(/\s+\S*$/, '') || s.slice(0, cap)).trim();
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
