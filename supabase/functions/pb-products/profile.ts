// Pure: one store's profile for the writer (owner, 2026-11-12: "different
// content, alt, title, description, meta … for each store"). The profile is
// the `profile` object inside pb_websites.content; older rows lack it, so
// every gap is filled here. Also the primary keyword a listing is written
// for: the store's keyword pattern filled from the product's facts.
// No I/O — tested in test/seoCheck.test.mjs.
import { words } from './tagText.ts';
import type { ContentCfg, ProductRow } from './types.ts';

export const DEFAULT_KEYWORD = '{color} {fabric} {category}';

export interface Profile {
  brand: string; market: string; spelling: 'british' | 'american'; units: 'inches' | 'cm';
  audience: string; angle: string; keyword_pattern: string;
  delivery: string; stitching: string; returns: string;
  faq_in_description: boolean; custom_fields: boolean;
}

const txt = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function profileOf(site: { name: string; shop_name?: string | null; content?: Partial<ContentCfg> | null }): Profile {
  const p = site.content?.profile || {};
  return {
    brand: txt(p.brand_name, 80) || txt(site.name, 80),
    market: txt(p.market, 80),
    spelling: p.spelling === 'american' ? 'american' : 'british',
    units: p.units === 'cm' ? 'cm' : 'inches',
    audience: txt(p.audience, 400), angle: txt(p.angle, 400),
    keyword_pattern: txt(p.keyword_pattern, 120) || DEFAULT_KEYWORD,
    delivery: txt(p.delivery, 300), stitching: txt(p.stitching, 300), returns: txt(p.returns, 300),
    faq_in_description: p.faq_in_description !== false,
    custom_fields: p.custom_fields !== false,
  };
}

/** Does "| Brand" fit in an SEO title of `max` characters and still leave the product 12? A longer brand name is
 *  left out of SEO titles (content.ts withBrand), not asked of the writer (genPrompt.ts) and not checked (seoCheck.ts). */
export function brandFits(brand: string, max?: number): boolean {
  const b = String(brand || '').replace(/\s+/g, ' ').trim();
  return !!b && (!max || max - b.length - 3 >= 12);
}

/** Has the store said anything about ordering (delivery, stitching, returns)? Then the SEO description may use one as its
 *  store benefit. Nothing of it is written into a description or a question (owner, 2026-11-12). */
export const hasOrdering = (p: Profile) => !!(p.delivery || p.stitching || p.returns);

/** The parts a pattern may use, least important first: the first left out when the phrase is too long. The category and
 *  the name are never left out. */
const DROP = ['occasion', 'pattern', 'work', 'fabric', 'colour', 'color'];

/** Of a product's values for one attribute, the one its own words name first ("Zari embroidery, Embroidery Work" →
 *  Embroidery; "Wedding, Reception" → Wedding); the first only when the product has no such fact. A value its facts do
 *  not name is never used: the phrase must not say a colour or fabric the product's own facts contradict (a "Light
 *  Yellow" lehenga tagged Navy Blue keeps Light Yellow). */
function mainValue(values: string[] | undefined, fact: unknown): string {
  if (!values?.length) return '';
  const fw = words(fact);
  if (!fw.length) return values[0];
  let best = '', at = Infinity;
  for (const v of values) {
    const vw = words(v);
    for (let i = 0; vw.length && i + vw.length <= fw.length && i < at; i++) if (vw.every((w, j) => fw[i + j] === w)) { at = i; best = v; break; }
  }
  return best;
}

/** Characters of the SEO title left beside the phrase, so each product's SEO title can say what sets it apart (two
 *  products with the same phrase must not get the same SEO title). */
export const SEO_ROOM = 12;
/** The longest phrase the SEO title holds beside "| Brand" with SEO_ROOM to spare, and the title too (20 to 80). */
export function phraseMax(brand: string, titleMax?: number, metaTitleMax?: number): number {
  const meta = metaTitleMax ? metaTitleMax - SEO_ROOM - (brandFits(brand, metaTitleMax) ? String(brand).replace(/\s+/g, ' ').trim().length + 3 : 0) : 80;
  return Math.max(20, Math.min(80, titleMax || 80, meta));
}

/** Cut at a whole word. */
const upTo = (s: string, max: number) => (s.length <= max ? s : (s.slice(0, max + 1).replace(/\s+\S*$/, '') || s.slice(0, max)).trim());

/** The phrase a listing is written for: the store's pattern ("{color} {work} {fabric} {category} {occasion}") filled
 *  with the product's tags — Playbook's own value names ("Embroidery", not the supplier's "Zari embroidery, Embroidery
 *  Work"), one per part (`values`: attribute key → the product's values) — else the first item of the read fact; and
 *  no longer than `max` (phraseMax: it fits the SEO title beside the brand): the least important part (occasion, then
 *  pattern, work, fabric, colour) is left out first, then it is cut at a word. Owner, 18 Nov 2026: "donot provide
 *  suggestions rather fix it directly" — an 80-character phrase cut mid-word ("…Festival Sange") could never be
 *  written in, held listings in review and asked the owner to shorten the store profile.
 *  "{color} {fabric} {category}" → "Maroon Georgette Kurta Set"; '' when nothing fills it. */
export function keywordOf(pattern: string, p: Pick<ProductRow, 'name' | 'category' | 'fabric' | 'color' | 'attributes'>, o: { values?: Record<string, string[]>; max?: number } = {}): string {
  const a = p.attributes || {}, v = o.values || {};
  const part = (key: string, fact: unknown) => {
    const tag = mainValue(v[key], fact);
    return txt(tag ? tag.split(/\s+\/\s+/)[0] : String(fact ?? '').split(/\s*[,;|/]\s*/)[0], 40); // "Cocktail / Reception" → Cocktail
  };
  const vars: Record<string, string> = {
    color: part('colour', p.color), colour: part('colour', p.color), fabric: part('fabric', p.fabric), work: part('work', a.work),
    occasion: part('occasion', a.occasion), pattern: part('pattern', a.pattern), category: txt(p.category, 60), name: txt(p.name, 60),
  };
  const pieces = String(pattern || DEFAULT_KEYWORD).split(/(\{\s*[a-z_]+\s*\})/i).map(t => {
    const m = /^\{\s*([a-z_]+)\s*\}$/i.exec(t), key = m ? m[1].toLowerCase() : '';
    return { key, text: m ? vars[key] ?? '' : t };
  });
  const joined = () => txt(pieces.map(x => x.text).join('').replace(/[^\p{L}\p{N}' &-]+/gu, ' '), 400);
  const max = Math.max(20, Math.min(80, o.max ?? 80));
  for (const k of DROP) {
    if (joined().length <= max) break;
    for (const x of pieces) if (x.key === k) x.text = '';
  }
  return upTo(joined(), max);
}

/** A keyword typed by hand: trimmed, one line, no markup. */
export const cleanKeyword = (v: unknown) => txt(String(v ?? '').replace(/[<>{}]/g, ' '), 80);
