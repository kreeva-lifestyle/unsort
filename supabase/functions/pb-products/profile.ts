// Pure: one store's profile for the writer (owner, 2026-11-12: "different
// content, alt, title, description, meta … for each store"). The profile is
// the `profile` object inside pb_websites.content; older rows lack it, so
// every gap is filled here. Also the primary keyword a listing is written
// for: the store's keyword pattern filled from the product's facts.
// No I/O — tested in test/seoCheck.test.mjs.
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

/** "{color} {fabric} {category}" → "Maroon Georgette Kurta Set"; '' when nothing fills it. */
export function keywordOf(pattern: string, p: Pick<ProductRow, 'name' | 'category' | 'fabric' | 'color' | 'attributes'>): string {
  const a = p.attributes || {};
  const vars: Record<string, string> = {
    color: p.color || '', colour: p.color || '', fabric: p.fabric || '', category: p.category || '', name: p.name || '',
    work: a.work || '', occasion: a.occasion || '', pattern: a.pattern || '',
  };
  const out = String(pattern || DEFAULT_KEYWORD).replace(/\{\s*([a-z_]+)\s*\}/gi, (_m, k: string) => txt(vars[k.toLowerCase()], 60));
  return txt(out.replace(/[^\p{L}\p{N}' &-]+/gu, ' '), 80);
}

/** A keyword typed by hand: trimmed, one line, no markup. */
export const cleanKeyword = (v: unknown) => txt(String(v ?? '').replace(/[<>{}]/g, ' '), 80);
